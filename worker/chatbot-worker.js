/**
 * Well Beyond Now — API backend (Cloudflare Worker).
 *
 * Deploy via the Cloudflare dashboard: Workers & Pages -> Create -> deploy
 * this file's contents with Quick Edit. No build step, no npm install.
 *
 * Handles five things on one Worker:
 * 1. POST /        — chatbot (see chatbot-setup.md)
 * 2. POST /stripe-webhook — verifies Stripe's signature, creates a
 *                           product-specific entitlement, emails access.
 * 3. GET  /unlock   — verifies the Checkout Session and redirects to
 *                     the product Stripe says was purchased.
 * 4. POST /content  — the reading page calls this with a token to fetch
 *                     the actual e-book content, only if that token is
 *                     valid for that book.
 * 5. POST /recover  — emails an existing access link without revealing
 *                     whether a purchase exists for an address.
 *
 * See ebook-setup.md for how to wire up Stripe + add real content.
 *
 * This file intentionally avoids the Anthropic and Stripe SDKs —
 * Cloudflare's dashboard-paste deployment has no build step to bundle
 * npm packages, so it calls both APIs directly over fetch() instead.
 */

const ALLOWED_ORIGINS = [
  'https://wellbeyondnow.com.au',
  'https://www.wellbeyondnow.com.au',
];

const SITE_ORIGIN = 'https://wellbeyondnow.com.au';

const RATE_LIMIT_MAX = 15;     // messages per window, per visitor IP
const RATE_LIMIT_WINDOW = 60;  // seconds
const MAX_TURNS = 20;          // conversation turns kept per request
const MAX_MESSAGE_LENGTH = 1500;

// Stripe Price IDs live in Worker secrets/variables, never in redirect URLs.
// This mapping is the only authority for deciding which product was purchased.
const BOOKS = {
  birthReadyEbook: {
    title: 'Birth Ready',
    pageSlug: 'birth-ready',
    priceEnv: 'STRIPE_PRICE_BIRTH_READY',
  },
  fourthTrimesterReset: {
    title: 'The Fourth Trimester Reset',
    pageSlug: 'fourth-trimester-reset',
    priceEnv: 'STRIPE_PRICE_FOURTH_TRIMESTER',
  },
  cycleFertilityBundle: {
    title: 'Cycle & Fertility Foundations',
    pageSlug: 'cycle-fertility-foundations',
    priceEnv: 'STRIPE_PRICE_CYCLE_FERTILITY',
  },
};

const VALID_BOOKS = Object.keys(BOOKS);
const STRIPE_API_VERSION = '2026-07-29.dahlia';
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

const SYSTEM_PROMPT = `You are the website assistant for Well Beyond Now (wellbeyondnow.com.au), a doula and naturopath business supporting women before, during and after birth. Speak in first person as "I", the way the practitioner speaks on her own site — warm, calm, encouraging, concise (2-4 sentences per reply, typically).

WHAT YOU CAN HELP WITH:
- Explaining the business's services, philosophy and approach (doula + naturopathic care across preconception, pregnancy, birth, and postpartum).
- Explaining pricing and what's included, using ONLY the figures below — never invent, guess, round, or update a price.
- Explaining how booking works and pointing people to book a free discovery call or a specific session.
- General, educational information about pregnancy/birth/postpartum topics and naturopathic principles — the kind of thing you'd find in a book or article. Always frame this as general education, never as advice about someone's own specific body, symptoms, medications, supplements, or situation.

CURRENT OFFERINGS & PRICING (AUD):

1:1 Support (billed via a Stripe invoice after a discovery call, since each is tailored):
- Single Session (90 min consultation): from $150 — a one-off consult or check-in at any stage of the journey.
- Full Birth Support Package: from $1,800 — two prenatal planning sessions, on-call support from 38 weeks, continuous labour & birth support, two postpartum home visits.
- Postpartum Care Package: from $600 — four in-home postpartum visits, a naturopathic recovery plan, feeding & newborn support.

Programs & E-books (self-serve digital purchase):
- "Birth Ready" e-book — $47 — a birth preparation guide.
- "The Fourth Trimester Reset" — $97 — a 6-week self-paced postpartum recovery program.
- "Cycle & Fertility Foundations" — $67 — an e-book & workbook on naturopathic cycle/fertility guidance.

BOOKING: Free 20-minute discovery calls and direct session bookings happen via the "Book a Call" button or the Contact page. If someone wants to book, direct them there — never try to book anything yourself.

WHAT YOU MUST NEVER DO:
- Never give advice, guidance, or recommendations tailored to a specific person's own health, symptoms, pregnancy, medications, supplements, or body — even if they ask directly, share personal details, or insist. This includes anything resembling dosing, diagnosis, or "is this normal for me" style questions.
- Never assess whether something they describe is safe, normal, or concerning for them personally.
- Never invent services, prices, or policies that aren't listed above.

WHEN SOMEONE ASKS FOR PERSONAL HEALTH ADVICE OR SOMETHING OUTSIDE YOUR SCOPE:
Warmly explain this is exactly the kind of thing best discussed properly, one-on-one — not something you can responsibly answer in chat. Encourage them to book a free discovery call or session. Mention they can also leave their email using the button below the chat if they'd rather get a personal reply first.`;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

async function handleChat(request, env, headers) {
  // --- Rate limiting (soft: skipped gracefully if RATE_LIMIT_KV isn't bound) ---
  if (env.RATE_LIMIT_KV) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `rl:${ip}`;
    const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || '0', 10);
    if (current >= RATE_LIMIT_MAX) {
      return jsonResponse(
        { error: "You've sent a lot of messages — please wait a minute and try again." },
        429,
        headers
      );
    }
    await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid request' }, 400, headers);
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages = incoming
    .slice(-MAX_TURNS)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));

  if (messages.length === 0) {
    return jsonResponse({ error: 'No message provided' }, 400, headers);
  }

  let apiResponse;
  try {
    apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        messages,
      }),
    });
  } catch (err) {
    return jsonResponse({ error: 'Could not reach the assistant right now.' }, 502, headers);
  }

  if (!apiResponse.ok) {
    return jsonResponse({ error: 'The assistant is temporarily unavailable.' }, 502, headers);
  }

  const data = await apiResponse.json();

  if (data.stop_reason === 'refusal') {
    return jsonResponse(
      { reply: "I'm not able to help with that one — happy to help with questions about services, pricing, or booking instead." },
      200,
      headers
    );
  }

  const textBlock = (data.content || []).find((b) => b.type === 'text');
  const reply = textBlock ? textBlock.text : "Sorry, I didn't quite catch that — could you try rephrasing?";

  return jsonResponse({ reply }, 200, headers);
}

function noStoreHeaders(extra = {}) {
  return { 'Cache-Control': 'no-store', ...extra };
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function createAccessToken(sessionId, env) {
  if (!env.ACCESS_TOKEN_SECRET) throw new Error('ACCESS_TOKEN_SECRET is not configured');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ACCESS_TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sessionId));
  return bytesToBase64Url(new Uint8Array(signature));
}

function configuredBookForPrice(priceId, env) {
  const matches = VALID_BOOKS.filter((book) => env[BOOKS[book].priceEnv] === priceId);
  return matches.length === 1 ? matches[0] : null;
}

async function stripeGet(path, env) {
  if (!env.STRIPE_RESTRICTED_KEY) throw new Error('STRIPE_RESTRICTED_KEY is not configured');
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_RESTRICTED_KEY}`,
      'Stripe-Version': STRIPE_API_VERSION,
    },
  });
  if (!response.ok) throw new Error(`Stripe returned ${response.status}`);
  return response.json();
}

async function verifyPurchase(sessionId, env) {
  const encodedSessionId = encodeURIComponent(sessionId);
  const [session, lineItems] = await Promise.all([
    stripeGet(`/v1/checkout/sessions/${encodedSessionId}`, env),
    stripeGet(`/v1/checkout/sessions/${encodedSessionId}/line_items?limit=10`, env),
  ]);

  if (session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid') {
    throw new Error('Checkout Session is not a completed one-time payment');
  }

  const items = Array.isArray(lineItems.data) ? lineItems.data : [];
  if (items.length !== 1 || !items[0].price || items[0].quantity < 1) {
    throw new Error('Checkout Session must contain exactly one configured product');
  }

  const book = configuredBookForPrice(items[0].price.id, env);
  if (!book) throw new Error('Checkout Session does not contain a configured product');

  const email = normaliseEmail(
    session.customer_details && session.customer_details.email
      ? session.customer_details.email
      : session.customer_email
  );
  if (!email || email.length > 254 || !email.includes('@')) {
    throw new Error('Checkout Session has no valid customer email');
  }

  return { book, email, sessionId: session.id, purchasedAt: session.created * 1000 };
}

function accessUrl(book, token) {
  const url = new URL(`${SITE_ORIGIN}/read/${BOOKS[book].pageSlug}.html`);
  url.searchParams.set('token', token);
  return url.toString();
}

async function sendAccessEmail(email, book, token, idempotencyKey, env) {
  if (!env.RESEND_API_KEY || !env.ACCESS_EMAIL_FROM) {
    throw new Error('Resend is not fully configured');
  }

  const title = BOOKS[book].title;
  const link = accessUrl(book, token);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'User-Agent': 'well-beyond-now-worker/1.0',
    },
    body: JSON.stringify({
      from: env.ACCESS_EMAIL_FROM,
      reply_to: env.ACCESS_EMAIL_REPLY_TO || undefined,
      to: [email],
      subject: `Your ${title} access link`,
      html: `<p>Thank you for your purchase.</p><p><a href="${link}">Open ${title}</a></p><p>This private link provides lifetime access and can be opened on your other devices. Please keep it safe.</p>`,
      text: `Thank you for your purchase. Open ${title}: ${link}\n\nThis private link provides lifetime access and can be opened on your other devices. Please keep it safe.`,
    }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

async function fulfilPurchase(purchase, env, options = {}) {
  if (!env.RATE_LIMIT_KV) throw new Error('RATE_LIMIT_KV is not configured');

  const token = await createAccessToken(purchase.sessionId, env);
  const emailHash = await sha256(purchase.email);
  const record = {
    book: purchase.book,
    emailHash,
    purchasedAt: purchase.purchasedAt,
    sessionId: purchase.sessionId,
  };

  await Promise.all([
    env.RATE_LIMIT_KV.put(`access:${token}`, JSON.stringify(record)),
    env.RATE_LIMIT_KV.put(`buyer:${emailHash}:${purchase.book}`, token),
    env.RATE_LIMIT_KV.put(`session:${purchase.sessionId}`, token),
  ]);

  if (options.sendEmail !== false) {
    await sendAccessEmail(
      purchase.email,
      purchase.book,
      token,
      `wbn-access-${purchase.sessionId}`,
      env
    );
  }

  return { token, book: purchase.book };
}

// GET /unlock?session_id=cs_...
// The product is derived exclusively from Stripe's verified line items.
async function handleUnlock(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) {
    return new Response('Missing or invalid session_id.', { status: 400, headers: noStoreHeaders() });
  }

  try {
    const purchase = await verifyPurchase(sessionId, env);
    const entitlement = await fulfilPurchase(purchase, env, { sendEmail: false });
    try {
      await sendAccessEmail(
        purchase.email,
        purchase.book,
        entitlement.token,
        `wbn-access-${purchase.sessionId}`,
        env
      );
    } catch (emailError) {
      // The purchaser still gets immediate access. Stripe's webhook will retry email delivery.
    }
    return new Response(null, {
      status: 303,
      headers: noStoreHeaders({ Location: accessUrl(entitlement.book, entitlement.token) }),
    });
  } catch (err) {
    return new Response(
      'We could not verify or deliver this purchase. Please contact jenna4134@gmail.com.',
      { status: 402, headers: noStoreHeaders() }
    );
  }
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  return new Uint8Array(hex.match(/.{2}/g).map((pair) => parseInt(pair, 16)));
}

async function verifyStripeWebhook(payload, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestampPart || signatures.length === 0) return false;

  const timestamp = Number(timestampPart.slice(2));
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (!Number.isFinite(timestamp) || age > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signedPayload = new TextEncoder().encode(`${timestamp}.${payload}`);

  for (const signature of signatures) {
    const bytes = hexToBytes(signature);
    if (bytes && await crypto.subtle.verify('HMAC', key, bytes, signedPayload)) return true;
  }
  return false;
}

async function handleStripeWebhook(request, env) {
  const payload = await request.text();
  const valid = await verifyStripeWebhook(
    payload,
    request.headers.get('Stripe-Signature'),
    env.STRIPE_WEBHOOK_SECRET
  );
  if (!valid) return new Response('Invalid Stripe signature.', { status: 400 });

  let event;
  try {
    event = JSON.parse(payload);
  } catch (err) {
    return new Response('Invalid JSON.', { status: 400 });
  }

  const relevant = event.type === 'checkout.session.completed'
    || event.type === 'checkout.session.async_payment_succeeded';
  if (!relevant) return new Response('Ignored.', { status: 200 });

  try {
    const purchase = await verifyPurchase(event.data.object.id, env);
    await fulfilPurchase(purchase, env);
    return new Response('Fulfilled.', { status: 200 });
  } catch (err) {
    // A non-2xx response asks Stripe to retry transient Stripe, KV or email failures.
    return new Response('Fulfilment failed.', { status: 500 });
  }
}

async function handleRecovery(request, env, headers) {
  if (!env.RATE_LIMIT_KV) {
    return jsonResponse({ message: 'If a matching purchase exists, an access email will arrive shortly.' }, 200, headers);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ error: 'Invalid request.' }, 400, headers);
  }

  const email = normaliseEmail(body.email);
  const book = body.book;
  if (!email || email.length > 254 || !email.includes('@') || !VALID_BOOKS.includes(book)) {
    return jsonResponse({ error: 'Enter a valid purchase email.' }, 400, headers);
  }

  const emailHash = await sha256(email);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateKey = `recovery-rate:${ip}:${emailHash}`;
  const attempts = parseInt((await env.RATE_LIMIT_KV.get(rateKey)) || '0', 10);

  if (attempts < 5) {
    await env.RATE_LIMIT_KV.put(rateKey, String(attempts + 1), { expirationTtl: 3600 });
    const token = await env.RATE_LIMIT_KV.get(`buyer:${emailHash}:${book}`);
    if (token) {
      const recordText = await env.RATE_LIMIT_KV.get(`access:${token}`);
      let record = null;
      try { record = recordText ? JSON.parse(recordText) : null; } catch (parseError) { record = null; }
      if (record && record.book === book && record.emailHash === emailHash) {
        try {
          await sendAccessEmail(
            email,
            book,
            token,
            `wbn-recovery-${emailHash}-${book}-${Math.floor(Date.now() / 60000)}`,
            env
          );
        } catch (emailError) {
          // Keep the response generic so purchase records cannot be enumerated.
        }
      }
    }
  }

  return jsonResponse(
    { message: 'If a matching purchase exists, an access email will arrive shortly.' },
    200,
    headers
  );
}

// POST /content { token, book } — called by the reading page's JS.
async function handleContent(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid request' }, 400, headers);
  }

  const { token, book } = body;
  if (!token || !book || !VALID_BOOKS.includes(book)) {
    return jsonResponse({ error: 'Missing or invalid token/book.' }, 400, headers);
  }

  if (!env.RATE_LIMIT_KV) {
    return jsonResponse({ error: 'Access system is not fully configured yet.' }, 500, headers);
  }

  const record = await env.RATE_LIMIT_KV.get(`access:${token}`);
  if (!record) {
    return jsonResponse({ error: "This access link isn't valid — please check your order email or contact us." }, 403, headers);
  }

  const parsed = JSON.parse(record);
  if (parsed.book !== book) {
    return jsonResponse({ error: 'This link does not grant access to this content.' }, 403, headers);
  }

  const content = await env.RATE_LIMIT_KV.get(`content:${book}`);
  if (!content) {
    return jsonResponse({ error: "This content isn't available yet — please check back soon or contact us." }, 404, headers);
  }

  return jsonResponse({ html: content }, 200, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // Browser redirects and signed Stripe webhooks do not use site CORS.
    if (url.pathname === '/unlock' && request.method === 'GET') {
      return handleUnlock(request, env);
    }

    if (url.pathname === '/stripe-webhook' && request.method === 'POST') {
      return handleStripeWebhook(request, env);
    }

    if (!ALLOWED_ORIGINS.includes(origin)) {
      return jsonResponse({ error: 'Origin not allowed' }, 403, headers);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, headers);
    }

    if (url.pathname === '/content') {
      return handleContent(request, env, headers);
    }

    if (url.pathname === '/recover') {
      return handleRecovery(request, env, headers);
    }

    return handleChat(request, env, headers);
  },
};

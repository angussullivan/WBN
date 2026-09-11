/**
 * Well Beyond Now — API backend (Cloudflare Worker).
 *
 * Deploy via the Cloudflare dashboard: Workers & Pages -> Create -> deploy
 * this file's contents with Quick Edit. No build step, no npm install.
 *
 * Handles three things on one Worker:
 * 1. POST /        — chatbot (see chatbot-setup.md)
 * 2. GET  /unlock   — Stripe redirects here right after a paid e-book
 *                     checkout; verifies the payment, issues an access
 *                     token, redirects to the matching reading page.
 * 3. POST /content  — the reading page calls this with a token to fetch
 *                     the actual e-book content, only if that token is
 *                     valid for that book.
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

// Which book keys are valid — matches STRIPE_BUY_BUTTONS keys in
// js/stripe-config.js and the data-book attribute on each reading page.
const VALID_BOOKS = ['birthReadyEbook', 'fourthTrimesterReset', 'cycleFertilityBundle'];

const BOOK_PAGE_SLUGS = {
  birthReadyEbook: 'birth-ready',
  fourthTrimesterReset: 'fourth-trimester-reset',
  cycleFertilityBundle: 'cycle-fertility-foundations',
};

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

// GET /unlock?session_id=...&book=birthReadyEbook
// Reached via a full browser redirect from Stripe after a paid checkout,
// not a fetch() call — no CORS needed, and no Origin header to check.
async function handleUnlock(request, env) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');
  const book = url.searchParams.get('book');

  if (!sessionId || !book || !VALID_BOOKS.includes(book)) {
    return new Response('Missing or invalid session_id/book.', { status: 400 });
  }

  if (!env.RATE_LIMIT_KV) {
    return new Response('Access system is not fully configured yet — please contact hello@wellbeyondnow.com.', { status: 500 });
  }

  let stripeRes;
  try {
    stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
  } catch (err) {
    return new Response('Could not verify your payment right now — please contact hello@wellbeyondnow.com.', { status: 502 });
  }

  if (!stripeRes.ok) {
    return new Response('We could not verify that payment.', { status: 402 });
  }

  const session = await stripeRes.json();
  if (session.payment_status !== 'paid') {
    return new Response('That payment has not completed yet.', { status: 402 });
  }

  const token = crypto.randomUUID();
  await env.RATE_LIMIT_KV.put(
    `access:${token}`,
    JSON.stringify({ book, purchasedAt: Date.now() })
  );

  const dest = new URL(`${SITE_ORIGIN}/read/${BOOK_PAGE_SLUGS[book]}.html`);
  dest.searchParams.set('token', token);

  return Response.redirect(dest.toString(), 302);
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

    // Reached via browser redirect from Stripe, not fetch() — handle
    // before the Origin/CORS checks below, which don't apply to it.
    if (url.pathname === '/unlock' && request.method === 'GET') {
      return handleUnlock(request, env);
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

    return handleChat(request, env, headers);
  },
};

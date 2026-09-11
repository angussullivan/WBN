import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import worker from './chatbot-worker.js';

class MemoryKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.has(key) ? this.values.get(key) : null; }
  async put(key, value) { this.values.set(key, String(value)); }
}

const originalFetch = globalThis.fetch;
let calls;
let stripePrice;

function environment() {
  return {
    RATE_LIMIT_KV: new MemoryKV(),
    STRIPE_RESTRICTED_KEY: 'not-a-real-stripe-key',
    STRIPE_WEBHOOK_SECRET: 'not-a-real-webhook-secret',
    ACCESS_TOKEN_SECRET: 'test-secret-that-is-at-least-thirty-two-bytes',
    RESEND_API_KEY: 'not-a-real-resend-key',
    ACCESS_EMAIL_FROM: 'Well Beyond Now <access@example.com>',
    STRIPE_PRICE_BIRTH_READY: 'price_birth',
    STRIPE_PRICE_FOURTH_TRIMESTER: 'price_trimester',
    STRIPE_PRICE_CYCLE_FERTILITY: 'price_cycle',
  };
}

beforeEach(() => {
  calls = [];
  stripePrice = 'price_birth';
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    calls.push({ url: value, options });
    if (value.endsWith('/line_items?limit=10')) {
      return Response.json({ data: [{ price: { id: stripePrice }, quantity: 1 }] });
    }
    if (value.includes('/v1/checkout/sessions/')) {
      return Response.json({
        id: 'cs_test_paid123',
        mode: 'payment',
        status: 'complete',
        payment_status: 'paid',
        created: 1_700_000_000,
        customer_details: { email: 'Buyer@Example.com' },
      });
    }
    if (value === 'https://api.resend.com/emails') return Response.json({ id: 'email_123' });
    throw new Error(`Unexpected fetch: ${value}`);
  };
});

afterEach(() => { globalThis.fetch = originalFetch; });

test('derives the entitlement from Stripe and ignores a forged book parameter', async () => {
  const env = environment();
  const request = new Request(
    'https://worker.example/unlock?session_id=cs_test_paid123&book=cycleFertilityBundle'
  );
  const first = await worker.fetch(request, env);
  assert.equal(first.status, 303);
  assert.match(first.headers.get('location'), /\/read\/birth-ready\.html\?token=/);
  assert.doesNotMatch(first.headers.get('location'), /cycle-fertility/);

  const second = await worker.fetch(request, env);
  assert.equal(second.headers.get('location'), first.headers.get('location'));
  assert.equal(env.RATE_LIMIT_KV.values.has('session:cs_test_paid123'), true);
});

test('rejects a paid session whose Price ID is not configured', async () => {
  stripePrice = 'price_attacker_controlled';
  const response = await worker.fetch(
    new Request('https://worker.example/unlock?session_id=cs_test_paid123'),
    environment()
  );
  assert.equal(response.status, 402);
});

test('a valid token opens only the purchased book', async () => {
  const env = environment();
  env.RATE_LIMIT_KV.values.set('content:birthReadyEbook', '<h2>Birth Ready</h2>');
  const unlocked = await worker.fetch(
    new Request('https://worker.example/unlock?session_id=cs_test_paid123'),
    env
  );
  const token = new URL(unlocked.headers.get('location')).searchParams.get('token');

  const allowed = await worker.fetch(new Request('https://worker.example/content', {
    method: 'POST',
    headers: { Origin: 'https://wellbeyondnow.com.au', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, book: 'birthReadyEbook' }),
  }), env);
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { html: '<h2>Birth Ready</h2>' });

  const denied = await worker.fetch(new Request('https://worker.example/content', {
    method: 'POST',
    headers: { Origin: 'https://wellbeyondnow.com.au', 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, book: 'cycleFertilityBundle' }),
  }), env);
  assert.equal(denied.status, 403);
});

test('recovery is non-enumerating and resends an existing lifetime link', async () => {
  const env = environment();
  await worker.fetch(
    new Request('https://worker.example/unlock?session_id=cs_test_paid123'),
    env
  );
  calls = [];

  const response = await worker.fetch(new Request('https://worker.example/recover', {
    method: 'POST',
    headers: { Origin: 'https://wellbeyondnow.com.au', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'buyer@example.com', book: 'birthReadyEbook' }),
  }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: 'If a matching purchase exists, an access email will arrive shortly.',
  });
  assert.equal(calls.filter((call) => call.url === 'https://api.resend.com/emails').length, 1);
});

test('rejects unsigned Stripe webhooks', async () => {
  const response = await worker.fetch(new Request('https://worker.example/stripe-webhook', {
    method: 'POST',
    body: JSON.stringify({ type: 'checkout.session.completed' }),
  }), environment());
  assert.equal(response.status, 400);
});

test('accepts a valid Stripe signature and fulfils the verified product', async () => {
  const env = environment();
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_paid123' } },
  });
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`)
  );
  const hex = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');

  const response = await worker.fetch(new Request('https://worker.example/stripe-webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': `t=${timestamp},v1=${hex}` },
    body: payload,
  }), env);
  assert.equal(response.status, 200);
  assert.equal(env.RATE_LIMIT_KV.values.has('session:cs_test_paid123'), true);
});

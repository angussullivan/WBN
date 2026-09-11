# Setting up gated e-book access

This locks each e-book/program's reading page so it only works for
someone who actually paid for that specific title, using the same
Cloudflare Worker as the chatbot. No new Worker, no new account —
just one new secret and some entries in the KV store you already set up.

**Important limitation, please read first:** this stops casual sharing
(someone can't just forward the URL to a friend for free) but it is
not unbreakable copy protection — nothing on the web is. A determined
person could still screenshot or copy-paste the page after unlocking
it. Treat this as "reasonable protection for a $30-100 digital
product," not a vault.

## How it works

1. Someone buys an e-book via its Stripe Buy Button.
2. Stripe redirects their browser to your Worker's `/unlock` endpoint
   with the Checkout Session ID.
3. The Worker asks Stripe's API to confirm that session was actually
   paid (using your Stripe secret key, kept server-side).
4. If it checks out, the Worker creates a random access token, stores
   it, and redirects the buyer to the matching page under `/read/`
   with that token in the URL.
5. That reading page calls the Worker to fetch the real content —
   only if the token is valid for that specific book. The content
   never sits in the page's HTML, so "view source" shows nothing
   before unlocking.
6. The token is also saved in the buyer's browser (localStorage), so
   they can come back later without needing the original link again
   (on that same browser/device).

## 1. Add your Stripe secret key to the Worker

This is different from the publishable key already in the site, and
different from the Anthropic key already on this Worker — it must
never appear in any file or in chat.

1. Get it from Stripe Dashboard → Developers → API keys → **Secret key**.
2. Go to your `wbn-chatbot` Worker → **Settings** → **Variables and Secrets**.
3. **Add** → type **Secret** (not plain Variable — same mistake to avoid as last time).
4. Name: `STRIPE_SECRET_KEY`
5. Value: paste directly into Cloudflare's field. Save.

## 2. Redeploy the Worker with the updated code

Paste the full contents of `worker/chatbot-worker.js` (this file now
handles the chatbot, `/unlock`, and `/content` all in one) into your
Worker's **Edit code** view, replacing what's there, and deploy.

## 3. Configure each e-book's after-payment redirect in Stripe

For each of the three Payment Links / Buy Buttons (once you've
created them — see the earlier Stripe setup notes for product names
and prices):

1. Open the Payment Link in Stripe Dashboard → find **After payment**.
2. Choose **Don't show confirmation page** → redirect customers to your website.
3. Set the redirect URL to:

| Book | Redirect URL |
|---|---|
| Birth Ready | `https://wbn-chatbot.angussullivan.workers.dev/unlock?book=birthReadyEbook&session_id={CHECKOUT_SESSION_ID}` |
| The Fourth Trimester Reset | `https://wbn-chatbot.angussullivan.workers.dev/unlock?book=fourthTrimesterReset&session_id={CHECKOUT_SESSION_ID}` |
| Cycle & Fertility Foundations | `https://wbn-chatbot.angussullivan.workers.dev/unlock?book=cycleFertilityBundle&session_id={CHECKOUT_SESSION_ID}` |

`{CHECKOUT_SESSION_ID}` is a literal placeholder — type it exactly
like that, Stripe fills in the real value automatically.

## 4. Add the actual content

The content for each book lives in the same KV namespace you created
for rate limiting (`wbn-chat-ratelimit`), just under different keys —
no new namespace needed.

1. Go to Storage & databases → KV → `wbn-chat-ratelimit` → **KV Pairs**.
2. Add an entry:
   - Key: `content:birthReadyEbook` (exact key names below)
   - Value: the e-book's content as HTML (headings, paragraphs — e.g. `<h2>Chapter One</h2><p>...</p>`)
3. Repeat for the other two:
   - `content:fourthTrimesterReset`
   - `content:cycleFertilityBundle`

Until a `content:` key exists for a book, its reading page will show
"this content isn't available yet" to anyone who unlocks it — so
nothing breaks if you set up payments before you've finished writing.

## Testing it

Once content + redirect are set up for at least one book, make a real
test purchase (or a Stripe test-mode payment if the Buy Button is
still in test mode) and confirm you land on the reading page with the
content visible. Then open the reading page's URL directly with no
token — it should show the "please purchase" message instead of the
content.

# Setting up secure, lifetime e-book access

The Cloudflare Worker verifies what Stripe says was purchased, creates one
deterministic lifetime entitlement per Checkout Session, emails the private
access link through Resend, and lets a purchaser recover that link on another
device using the checkout email address.

The `book` URL parameter used by the earlier implementation has been removed.
The browser is never trusted to select an entitlement.

## Security model and limitation

The Worker maps a verified Stripe Price ID to one internal book key. A paid
session for one title cannot unlock another title, and replaying the same
session returns the same access token instead of minting more tokens.

The emailed link is a bearer credential: anyone who receives it can open the
book. This is practical lifetime, multi-device access for a low-cost digital
product, not DRM. Customers should be told not to share the link.

## 1. Configure Stripe Price IDs

Create one Stripe Product and Price for each title. In the Worker's **Settings →
Variables and Secrets**, add these plain variables using the real `price_...`
IDs from the same Stripe mode as the key:

| Worker variable | Stripe product |
|---|---|
| `STRIPE_PRICE_BIRTH_READY` | Birth Ready |
| `STRIPE_PRICE_FOURTH_TRIMESTER` | The Fourth Trimester Reset |
| `STRIPE_PRICE_CYCLE_FERTILITY` | Cycle & Fertility Foundations |

Do not reuse a Price ID across books. Keep separate test and live Worker
environments so test and production values cannot be mixed.

## 2. Add a restricted Stripe key

Create a Stripe restricted API key with read-only access to Checkout Sessions.
Add it to the Worker as an encrypted secret named:

```text
STRIPE_RESTRICTED_KEY
```

Use a restricted `rk_` key rather than a general `sk_` secret. Apply Stripe key
IP restrictions if they are compatible with the Worker deployment. Never place
either key in this repository or a client-side file.

## 3. Add the access-token secret

Generate at least 32 random bytes and store the value as an encrypted Worker
secret named:

```text
ACCESS_TOKEN_SECRET
```

Do not change this value after sales begin unless all existing access links are
being deliberately invalidated and reissued.

## 4. Configure Resend

1. Add and verify the sending domain in Resend.
2. Create a Resend API key restricted to sending email.
3. Add it as an encrypted Worker secret named `RESEND_API_KEY`.
4. Add a Worker variable named `ACCESS_EMAIL_FROM`, for example:
   `Well Beyond Now <access@wellbeyondnow.com.au>`.

The Worker stores only a one-way hash of the purchase email for recovery. It
uses the raw email transiently when Stripe supplies it or when the customer
submits the recovery form.

## 5. Configure the Stripe webhook

Create a Stripe webhook endpoint pointing to:

```text
https://wbn-chatbot.angussullivan.workers.dev/stripe-webhook
```

Subscribe only to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Store the webhook signing secret as the encrypted Worker secret:

```text
STRIPE_WEBHOOK_SECRET
```

The Worker verifies the signature and rejects events more than five minutes
old. A delivery failure returns HTTP 500 so Stripe retries it.

## 6. Configure Payment Link redirects

For every Payment Link / Buy Button, set the after-payment redirect to exactly:

```text
https://wbn-chatbot.angussullivan.workers.dev/unlock?session_id={CHECKOUT_SESSION_ID}
```

Do not add a `book` parameter. The Worker retrieves the Checkout Session and
line items from Stripe and derives the book from the verified Price ID.

## 7. Add the actual content

Add these HTML values to the KV namespace bound as `RATE_LIMIT_KV`:

- `content:birthReadyEbook`
- `content:fourthTrimesterReset`
- `content:cycleFertilityBundle`

Do not enable a live Buy Button until its matching content exists and a complete
test purchase has succeeded.

## 8. Test before going live

For each title, test that:

1. A successful checkout redirects to the correct reading page.
2. The access email arrives and opens on a second browser/device.
3. The recovery form resends the same working link.
4. Replaying the same Checkout Session yields the same token.
5. A session for one Price ID cannot open another title.
6. Invalid and unpaid sessions are rejected.
7. Invalid webhook signatures are rejected.

Run the repository tests locally with:

```text
node --test worker/chatbot-worker.test.js
```

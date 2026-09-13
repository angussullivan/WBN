# Open action items — Well Beyond Now website

Running list of things that need doing outside of code (accounts, secrets,
content) before each feature is fully live. Updated as items are completed
or added.

## Cal.com bookings
- [ ] Follow `cal-setup.md` — create Cal.com account as `jenna4134@gmail.com`,
      create the 3 event types, send back the username + 3 slugs.

## Paid e-books (Stripe)
- [ ] Create the 3 Stripe Products/Prices and set `STRIPE_PRICE_BIRTH_READY`,
      `STRIPE_PRICE_FOURTH_TRIMESTER`, `STRIPE_PRICE_CYCLE_FERTILITY` on the
      Worker (see `worker/ebook-setup.md`).
- [ ] Add `STRIPE_RESTRICTED_KEY` (restricted, read-only Checkout Sessions).
- [ ] Add `ACCESS_TOKEN_SECRET` (32+ random bytes).
- [ ] Set up Resend: verified sending domain, `RESEND_API_KEY`,
      `ACCESS_EMAIL_FROM`, `ACCESS_EMAIL_REPLY_TO`.
- [ ] Configure the Stripe webhook (`/stripe-webhook`) and add
      `STRIPE_WEBHOOK_SECRET`.
- [ ] Point each Buy Button / Payment Link's redirect at
      `.../unlock?session_id={CHECKOUT_SESSION_ID}`.
- [ ] Upload the actual e-book HTML content into KV
      (`content:birthReadyEbook` etc.) before enabling any Buy Button.
- [ ] Run through the full test checklist in `worker/ebook-setup.md` before
      taking a real payment.

## Google Ads
- [ ] Create the Google Ads account and conversion actions.
- [ ] Set `GOOGLE_ADS_ID` and the 3 conversion labels in
      `js/google-ads-config.js` (contactFormSubmit, bookCallClick,
      ebookPurchase — all already firing correctly once this is set).

## Hosting / domain
- [ ] Confirm GitHub Pages → **Settings → Pages → Enforce HTTPS** is
      actually switched on for wellbeyondnow.com.au.

## Content
- [ ] Send real photos for the 4 remaining placeholder image blocks on the
      site.

## Testing
- [ ] Send a real test enquiry through the Contact page to confirm it
      actually lands in `jenna4134@gmail.com` via Web3Forms.
- [ ] Try a few real questions in the chatbot (including a health-advice
      question) to confirm the safety guardrail response reads naturally.

## Done ✅
- [x] 5-page site built and live at wellbeyondnow.com.au
- [x] Contact form delivering via Web3Forms
- [x] AI chatbot (Claude Sonnet 5) with safety guardrails, lead capture,
      mobile/iOS fixes
- [x] Secure e-book entitlement system (Stripe verification, HMAC access
      tokens, Resend delivery, recovery flow) — code complete, needs the
      Stripe/Resend setup above to go live
- [x] Google Ads conversion tracking scaffold (safe no-op until configured)
- [x] Privacy Policy page
- [x] Favicon, robots.txt, sitemap.xml, Open Graph tags

/**
 * Stripe configuration for embedded Buy Buttons.
 *
 * The publishable key is safe to expose in client-side code by design
 * (never put a secret key — sk_test_/sk_live_ — here or anywhere in
 * this repo).
 *
 * For each product: in the Stripe Dashboard, create the Product/Price,
 * then use "Create payment link" -> Buy button, and copy the
 * `buy-button-id` from the generated embed snippet into the matching
 * key below. Leave a value as null until it's ready — that product's
 * button falls back to a "coming soon" message.
 */
var STRIPE_PUBLISHABLE_KEY = "pk_test_51UEELYKvD0hhzISiUyhEJ7PW5ggQfXjM5MjPvZ9EB8gOFzt94gZXw50YyJr3RVRK9n9hWoJghN481a14osYXkUAH00GbdYhddi";

var STRIPE_BUY_BUTTONS = {
  birthReadyEbook: null,          // "Birth Ready" e-book — $47
  fourthTrimesterReset: null,     // "The Fourth Trimester Reset" program — $97
  cycleFertilityBundle: null      // "Cycle & Fertility Foundations" bundle — $67
};

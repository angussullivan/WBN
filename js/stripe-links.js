/**
 * Stripe Payment Link configuration.
 *
 * Create each Payment Link in the Stripe Dashboard
 * (Dashboard -> Payment links -> +New), then paste the resulting
 * URL below. Leave a value as null until it's ready — buttons for
 * unconfigured products show a "coming soon" message instead of a
 * broken link.
 */
var STRIPE_LINKS = {
  // Programs & E-books (programs.html)
  birthReadyEbook: null,          // "Birth Ready" e-book — $47
  fourthTrimesterReset: null,     // "The Fourth Trimester Reset" program — $97
  cycleFertilityBundle: null,     // "Cycle & Fertility Foundations" bundle — $67

  // 1:1 Support packages (services.html)
  singleSession: null,            // Single Session — from $150
  fullBirthSupportPackage: null,  // Full Birth Support Package — from $1,800
  postpartumCarePackage: null     // Postpartum Care Package — from $600
};

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('[data-stripe-link]').forEach(function (el) {
    var key = el.getAttribute('data-stripe-link');
    var url = STRIPE_LINKS[key];

    el.addEventListener('click', function (e) {
      if (!url) {
        e.preventDefault();
        alert("Online checkout for this isn't switched on yet — please use the contact form and I'll get back to you directly.");
        return;
      }
      el.setAttribute('href', url);
    });

    if (url) {
      el.setAttribute('href', url);
    }
  });
});

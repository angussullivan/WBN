document.addEventListener('DOMContentLoaded', function () {
  var slots = document.querySelectorAll('[data-buy-button]');
  if (!slots.length) return;

  var configured = [];

  slots.forEach(function (slot) {
    var buttonId = STRIPE_BUY_BUTTONS[slot.getAttribute('data-buy-button')];
    if (buttonId) {
      configured.push(slot);
      return;
    }
    // Not configured yet: keep the fallback link, but stop it going anywhere broken.
    var fallbackLink = slot.querySelector('[data-stripe-link]');
    if (fallbackLink) {
      fallbackLink.addEventListener('click', function (e) {
        e.preventDefault();
        alert("Online checkout for this isn't switched on yet — please use the contact form and I'll get back to you directly.");
      });
    }
  });

  if (!configured.length) return;

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://js.stripe.com/v3/buy-button.js';
  script.onload = function () {
    configured.forEach(function (slot) {
      var buttonId = STRIPE_BUY_BUTTONS[slot.getAttribute('data-buy-button')];
      var button = document.createElement('stripe-buy-button');
      button.setAttribute('buy-button-id', buttonId);
      button.setAttribute('publishable-key', STRIPE_PUBLISHABLE_KEY);
      slot.innerHTML = '';
      slot.appendChild(button);
    });
  };
  document.head.appendChild(script);
});

/**
 * Loads the Google tag and exposes window.wbnTrackConversion(key) for
 * other scripts to call. Safe to call regardless of configuration —
 * it's always defined, and simply no-ops until GOOGLE_ADS_ID and the
 * relevant conversion label are both set in google-ads-config.js.
 */
window.wbnTrackConversion = function () {};

(function () {
  if (typeof GOOGLE_ADS_ID === 'undefined' || !GOOGLE_ADS_ID) return;

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GOOGLE_ADS_ID;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', GOOGLE_ADS_ID);

  window.wbnTrackConversion = function (conversionKey) {
    var label = (typeof GOOGLE_ADS_CONVERSIONS !== 'undefined' && GOOGLE_ADS_CONVERSIONS)
      ? GOOGLE_ADS_CONVERSIONS[conversionKey]
      : null;
    if (!label) return;
    gtag('event', 'conversion', { send_to: GOOGLE_ADS_ID + '/' + label });
  };
})();

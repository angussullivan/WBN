document.addEventListener('DOMContentLoaded', function () {
  var bookButtons = document.querySelectorAll('[data-cal-event]');
  if (!bookButtons.length) return;

  // Track click intent regardless of whether Cal.com itself is configured yet.
  bookButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.wbnTrackConversion('bookCallClick');
    });
  });

  if (!CAL_USERNAME) return;

  var configured = Array.prototype.filter.call(bookButtons, function (btn) {
    return !!CAL_EVENTS[btn.getAttribute('data-cal-event')];
  });
  if (!configured.length) return;

  (function (C, A, L) {
    let p = function (a, ar) { a.q.push(ar); };
    let d = C.document;
    C.Cal = C.Cal || function () {
      let cal = C.Cal;
      let ar = arguments;
      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        d.head.appendChild(d.createElement('script')).src = A;
        cal.loaded = true;
      }
      if (ar[0] === L) {
        const api = function () { p(api, arguments); };
        const namespace = ar[1];
        api.q = api.q || [];
        if (typeof namespace === 'string') {
          cal.ns[namespace] = cal.ns[namespace] || api;
          p(cal.ns[namespace], ar);
          p(cal, ['initNamespace', namespace]);
        } else {
          p(cal, ar);
        }
        return;
      }
      p(cal, ar);
    };
  })(window, 'https://app.cal.com/embed/embed.js', 'init');

  Cal('init', { origin: 'https://cal.com' });
  Cal('ui', {
    theme: 'light',
    styles: { branding: { brandColor: '#b9716c' } },
    hideEventTypeDetails: false,
    layout: 'month_view'
  });

  configured.forEach(function (btn) {
    var slug = CAL_EVENTS[btn.getAttribute('data-cal-event')];
    btn.setAttribute('data-cal-link', CAL_USERNAME + '/' + slug);
    btn.setAttribute('data-cal-config', '{"layout":"month_view"}');
  });
});

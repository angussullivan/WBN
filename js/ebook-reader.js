document.addEventListener('DOMContentLoaded', function () {
  var app = document.getElementById('ebook-app');
  if (!app) return;

  var bookKey = app.getAttribute('data-book');
  var storageKey = 'wbn_access_' + bookKey;
  var statusEl = document.getElementById('ebook-status');
  var contentEl = document.getElementById('ebook-content');

  var params = new URLSearchParams(window.location.search);
  var urlToken = params.get('token');
  var token = urlToken || (function () {
    try { return localStorage.getItem(storageKey); } catch (e) { return null; }
  })();

  if (urlToken) {
    try { localStorage.setItem(storageKey, urlToken); } catch (e) { /* ignore */ }
    // Remove the token from the visible/bookmarkable URL.
    history.replaceState({}, '', window.location.pathname);
  }

  if (!token) {
    statusEl.innerHTML = "This page is for customers who've purchased this title. If you've already purchased it, use the link from your order — or <a href=\"/contact.html\">contact us</a> if you've lost access.";
    return;
  }

  if (typeof CHATBOT_WORKER_URL === 'undefined' || !CHATBOT_WORKER_URL) {
    statusEl.textContent = "This page isn't fully set up yet — please contact hello@wellbeyondnow.com.";
    return;
  }

  statusEl.textContent = 'Checking your access...';

  var endpoint = CHATBOT_WORKER_URL.replace(/\/$/, '') + '/content';

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token, book: bookKey })
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.html) {
        statusEl.hidden = true;
        contentEl.innerHTML = data.html;
        contentEl.hidden = false;
        if (urlToken) window.wbnTrackConversion('ebookPurchase');
      } else {
        statusEl.textContent = data.error || "Could not verify your access — please contact us.";
        try { localStorage.removeItem(storageKey); } catch (e) { /* ignore */ }
      }
    })
    .catch(function () {
      statusEl.textContent = 'Something went wrong loading your content — please try again or contact us.';
    });
});

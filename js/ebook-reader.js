document.addEventListener('DOMContentLoaded', function () {
  var app = document.getElementById('ebook-app');
  if (!app) return;

  var bookKey = app.getAttribute('data-book');
  var storageKey = 'wbn_access_' + bookKey;
  var statusEl = document.getElementById('ebook-status');
  var contentEl = document.getElementById('ebook-content');

  function showRecovery() {
    if (document.getElementById('ebook-recovery')) return;
    var recovery = document.createElement('div');
    recovery.id = 'ebook-recovery';
    recovery.className = 'contact-card mt-lg';
    recovery.innerHTML =
      '<h2>Recover your access</h2>' +
      '<p>Enter the email used at checkout and we’ll resend your private access link.</p>' +
      '<form class="ebook-recovery-form">' +
        '<div class="form-group">' +
          '<label for="recovery-email">Purchase email</label>' +
          '<input id="recovery-email" name="email" type="email" autocomplete="email" required>' +
        '</div>' +
        '<button type="submit" class="btn btn-primary">Email my access link</button>' +
        '<p class="ebook-recovery-note" role="status" aria-live="polite"></p>' +
      '</form>';
    app.appendChild(recovery);

    var form = recovery.querySelector('form');
    var button = form.querySelector('button');
    var note = form.querySelector('.ebook-recovery-note');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      button.disabled = true;
      note.textContent = 'Sending...';
      fetch(CHATBOT_WORKER_URL.replace(/\/$/, '') + '/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.elements.email.value,
          book: bookKey
        })
      })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          note.textContent = data.message || data.error || 'Please try again.';
        })
        .catch(function () {
          note.textContent = 'Something went wrong — please try again or contact us.';
        })
        .finally(function () { button.disabled = false; });
    });
  }

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
    if (typeof CHATBOT_WORKER_URL !== 'undefined' && CHATBOT_WORKER_URL) showRecovery();
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
        showRecovery();
      }
    })
    .catch(function () {
      statusEl.textContent = 'Something went wrong loading your content — please try again or contact us.';
    });
});

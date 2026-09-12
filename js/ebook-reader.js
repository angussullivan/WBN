document.addEventListener('DOMContentLoaded', function () {
  var app = document.getElementById('ebook-app');
  if (!app) return;

  var bookKey = app.getAttribute('data-book');
  var storageKey = 'wbn_access_' + bookKey;
  var statusEl = document.getElementById('ebook-status');
  var contentEl = document.getElementById('ebook-content');

  var allowedTags = new Set([
    'A', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CODE', 'DIV', 'EM', 'FIGCAPTION',
    'FIGURE', 'H1', 'H2', 'H3', 'H4', 'H5', 'HR', 'IMG', 'LI', 'OL', 'P',
    'PRE', 'SECTION', 'SPAN', 'STRONG', 'TABLE', 'TBODY', 'TD', 'TFOOT',
    'TH', 'THEAD', 'TR', 'UL'
  ]);
  var discardTags = new Set([
    'EMBED', 'FORM', 'IFRAME', 'MATH', 'OBJECT', 'SCRIPT', 'STYLE', 'SVG',
    'TEMPLATE'
  ]);

  function safeUrl(value, isImage) {
    var trimmed = String(value || '').trim();
    if (!trimmed) return null;
    if (isImage && /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return trimmed;
    try {
      var parsed = new URL(trimmed, window.location.href);
      var allowedProtocols = isImage ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:'];
      return allowedProtocols.indexOf(parsed.protocol) !== -1 ? parsed.href : null;
    } catch (e) {
      return null;
    }
  }

  function copySafeNode(node, destination) {
    if (node.nodeType === Node.TEXT_NODE) {
      destination.appendChild(document.createTextNode(node.textContent));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || discardTags.has(node.tagName)) return;

    if (!allowedTags.has(node.tagName)) {
      Array.from(node.childNodes).forEach(function (child) { copySafeNode(child, destination); });
      return;
    }

    var clean = document.createElement(node.tagName.toLowerCase());
    if (node.hasAttribute('class')) {
      var classes = node.getAttribute('class').split(/\s+/).filter(function (name) {
        return /^[a-z0-9_-]{1,40}$/i.test(name);
      });
      if (classes.length) clean.className = classes.join(' ');
    }
    ['title', 'alt'].forEach(function (name) {
      if (node.hasAttribute(name)) clean.setAttribute(name, node.getAttribute(name).slice(0, 500));
    });
    ['colspan', 'rowspan'].forEach(function (name) {
      var value = node.getAttribute(name);
      if (/^[1-9]\d?$/.test(value || '')) clean.setAttribute(name, value);
    });
    if (node.tagName === 'A') {
      var href = safeUrl(node.getAttribute('href'), false);
      if (href) clean.setAttribute('href', href);
      clean.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') {
      var src = safeUrl(node.getAttribute('src'), true);
      if (src) clean.setAttribute('src', src);
      clean.setAttribute('loading', 'lazy');
      clean.setAttribute('decoding', 'async');
    }
    Array.from(node.childNodes).forEach(function (child) { copySafeNode(child, clean); });
    destination.appendChild(clean);
  }

  function renderSafeHtml(html) {
    var parsed = new DOMParser().parseFromString(String(html), 'text/html');
    var fragment = document.createDocumentFragment();
    Array.from(parsed.body.childNodes).forEach(function (node) { copySafeNode(node, fragment); });
    contentEl.replaceChildren(fragment);
  }

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
    statusEl.textContent = "This page isn't fully set up yet — please contact jenna4134@gmail.com.";
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
        renderSafeHtml(data.html);
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

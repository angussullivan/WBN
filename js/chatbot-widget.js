document.addEventListener('DOMContentLoaded', function () {
  if (typeof CHATBOT_WORKER_URL === 'undefined' || !CHATBOT_WORKER_URL) return;

  var STORAGE_KEY = 'wbn_chat_history';
  var GREETING = "Hi! I can help with questions about services, pricing and booking. For anything personal to your own health or pregnancy, I'll point you toward booking a real session instead. How can I help?";

  var history = [];
  try {
    var saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) history = JSON.parse(saved);
  } catch (e) {
    history = [];
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) { /* ignore quota errors */ }
  }

  // --- Build DOM ---
  var toggle = document.createElement('button');
  toggle.className = 'chat-toggle';
  toggle.setAttribute('aria-label', 'Open chat');
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  var panel = document.createElement('div');
  panel.className = 'chat-panel';
  panel.hidden = true;
  panel.innerHTML =
    '<div class="chat-header">' +
      '<h3>Chat with Well Beyond Now</h3>' +
      '<button class="chat-close" aria-label="Close chat">&times;</button>' +
    '</div>' +
    '<div class="chat-messages"></div>' +
    '<form class="chat-input-row">' +
      '<input type="text" placeholder="Type a message..." aria-label="Message" required>' +
      '<button type="submit" class="chat-send-btn">Send</button>' +
    '</form>' +
    '<div class="chat-lead-toggle"><button type="button">Prefer a personal reply? Leave your email</button></div>' +
    '<form class="chat-lead-form" hidden>' +
      '<input type="text" name="name" placeholder="Your name" required>' +
      '<input type="email" name="email" placeholder="Your email" required>' +
      '<textarea name="message" placeholder="What would you like to ask?"></textarea>' +
      '<button type="submit" class="btn btn-primary btn-block">Send</button>' +
      '<p class="chat-lead-note"></p>' +
    '</form>';

  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  var messagesEl = panel.querySelector('.chat-messages');
  var formEl = panel.querySelector('.chat-input-row');
  var inputEl = formEl.querySelector('input');
  var sendBtn = formEl.querySelector('.chat-send-btn');
  var leadToggleBtn = panel.querySelector('.chat-lead-toggle button');
  var leadForm = panel.querySelector('.chat-lead-form');
  var leadNote = leadForm.querySelector('.chat-lead-note');

  function addMessageEl(role, text) {
    var el = document.createElement('div');
    el.className = 'chat-message ' + role;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function renderHistory() {
    messagesEl.innerHTML = '';
    addMessageEl('bot', GREETING);
    history.forEach(function (m) {
      addMessageEl(m.role === 'user' ? 'user' : 'bot', m.content);
    });
  }

  renderHistory();

  toggle.addEventListener('click', function () {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) inputEl.focus();
  });

  panel.querySelector('.chat-close').addEventListener('click', function () {
    panel.hidden = true;
  });

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = inputEl.value.trim();
    if (!text) return;

    addMessageEl('user', text);
    history.push({ role: 'user', content: text });
    saveHistory();
    inputEl.value = '';
    inputEl.disabled = true;
    sendBtn.disabled = true;

    var typingEl = addMessageEl('bot typing', 'Typing...');

    fetch(CHATBOT_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        typingEl.remove();
        var reply = data.reply || data.error || "Sorry, something went wrong — please try again.";
        addMessageEl('bot', reply);
        if (data.reply) {
          history.push({ role: 'assistant', content: data.reply });
          saveHistory();
        }
      })
      .catch(function () {
        typingEl.remove();
        addMessageEl('bot', "Sorry, I couldn't send that — please try again or leave your email below.");
      })
      .finally(function () {
        inputEl.disabled = false;
        sendBtn.disabled = false;
        inputEl.focus();
      });
  });

  leadToggleBtn.addEventListener('click', function () {
    leadForm.hidden = !leadForm.hidden;
  });

  leadForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (typeof WEB3FORMS_ACCESS_KEY === 'undefined' || !WEB3FORMS_ACCESS_KEY) {
      leadNote.textContent = 'Please email hello@wellbeyondnow.com directly for now.';
      leadNote.style.display = 'block';
      return;
    }

    var formData = new FormData(leadForm);
    formData.append('access_key', WEB3FORMS_ACCESS_KEY);
    formData.append('subject', 'Chatbot follow-up request from wellbeyondnow.com.au');

    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData
    })
      .then(function (res) { return res.json(); })
      .then(function (result) {
        leadNote.textContent = result.success
          ? "Thanks — I'll get back to you personally soon."
          : 'Something went wrong — please email hello@wellbeyondnow.com directly.';
        leadNote.style.display = 'block';
        if (result.success) leadForm.reset();
      })
      .catch(function () {
        leadNote.textContent = 'Something went wrong — please email hello@wellbeyondnow.com directly.';
        leadNote.style.display = 'block';
      });
  });
});

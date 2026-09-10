document.addEventListener('DOMContentLoaded', function () {
  var form = document.querySelector('.contact-form');
  if (!form) return;

  var note = form.querySelector('.form-note');
  var submitBtn = form.querySelector('button[type="submit"]');

  function showNote(message, isError) {
    if (!note) return;
    note.textContent = message;
    note.style.color = isError ? '#b91c1c' : 'var(--color-rose-dark)';
    note.style.display = 'block';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var formData = new FormData(form);
    formData.append('access_key', WEB3FORMS_ACCESS_KEY);
    formData.append('subject', 'New enquiry from wellbeyondnow.com.au');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
    }

    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData
    })
      .then(function (response) { return response.json(); })
      .then(function (result) {
        if (result.success) {
          showNote("Thank you — your message has been received. I'll be in touch within 1-2 business days.", false);
          form.reset();
        } else {
          showNote('Something went wrong sending your message — please email jenna4134@gmail.com directly.', true);
        }
      })
      .catch(function () {
        showNote('Something went wrong sending your message — please email jenna4134@gmail.com directly.', true);
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Message';
        }
      });
  });
});

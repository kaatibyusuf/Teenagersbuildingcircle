/* Newsletter signup boxes (.nl-form) and the unsubscribe page (newsletter.html?unsub=…).
   Sends to the Apps Script web app: action "subscribe" / "unsubscribe" (Newsletter.gs). */
(function () {
  var API_URL = 'https://script.google.com/macros/s/AKfycby0AsifBuB_Ad7g1SjDXCipaDU27-BrzYWf67muw5jeY_C0_0uz8AhQYYXdiNRQhvqX/exec';

  function post(body) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 25000);
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl.signal })
      .then(function (r) { return r.json(); })
      .finally(function () { clearTimeout(t); });
  }

  document.querySelectorAll('form.nl-form').forEach(function (form) {
    var box = form.closest('.nl-box') || form, msg = box.querySelector('.nl-msg'), btn = form.querySelector('button[type=submit]');
    var say = function (text, ok) { msg.textContent = text; msg.className = 'nl-msg ' + (ok ? 'ok' : 'bad'); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (form.elements.email.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say('Enter a valid email address.'); form.elements.email.focus(); return; }
      var interests = Array.prototype.slice.call(form.querySelectorAll('input[name=interests]:checked')).map(function (x) { return x.value; });
      btn.disabled = true; var label = btn.textContent; btn.textContent = 'Subscribing…'; msg.textContent = ''; msg.className = 'nl-msg';
      post({ action: 'subscribe', email: email, name: form.elements.name ? form.elements.name.value : '', interests: interests,
             source: location.pathname, website: form.elements.website ? form.elements.website.value : '' })
        .then(function (j) {
          if (!j || !j.ok) { say((j && j.error) || 'Something went wrong. Please try again.'); return; }
          box.classList.add('nl-done');
          say(j.already ? 'You are already subscribed. We have saved your choices.' : j.back ? 'Welcome back. You are subscribed again.' : 'You are subscribed. A welcome email is on its way.', true);
          form.reset();
        })
        .catch(function () { say('We could not subscribe you. Check your connection and try again.'); })
        .finally(function () { btn.disabled = false; btn.textContent = label; });
    });
  });

  // Unsubscribe page
  var un = document.getElementById('nlUnsub');
  var token = new URLSearchParams(location.search).get('unsub');
  if (un && token) {
    un.hidden = false;
    var t = document.getElementById('nlUnsubText');
    t.textContent = 'Unsubscribing…';
    post({ action: 'unsubscribe', token: token })
      .then(function (j) {
        if (j && j.ok) { un.classList.add('ok'); t.textContent = 'You are unsubscribed. We will not email ' + (j.email || 'you') + ' again. You can subscribe again below at any time.'; }
        else t.textContent = (j && j.error) || 'Something went wrong. Please try again.';
      })
      .catch(function () { t.textContent = 'We could not reach the school records. Check your connection and try again.'; });
  }
})();

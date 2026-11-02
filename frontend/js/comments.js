/* Article comments: builds the "Join the conversation" section under each article and talks to
   the Apps Script web app (Comments.gs): action "cm_list" and "cm_post". New comments are held for review. */
(function () {
  var API_URL = 'https://script.google.com/macros/s/AKfycby0AsifBuB_Ad7g1SjDXCipaDU27-BrzYWf67muw5jeY_C0_0uz8AhQYYXdiNRQhvqX/exec';
  var art = document.querySelector('article.art-body'); if (!art) return;
  var slug = location.pathname.replace(/\/+$/, '').split('/').pop().replace(/\.html$/, '');
  if (!/^[a-z0-9-]{3,120}$/.test(slug)) return;

  var css = document.createElement('style');
  css.textContent = '.cm{max-width:720px;margin:0 auto;padding:8px 20px 56px;font-family:Inter,system-ui,sans-serif;color:#0E2A3D}' +
    '.cm h2{font-family:"Bricolage Grotesque",Inter,sans-serif;letter-spacing:-.02em;color:#062F4D;font-size:clamp(24px,3vw,30px);margin:0 0 6px}' +
    '.cm-sub{color:#5B6E7F;font-size:15px;margin:0 0 22px}' +
    '.cm-list{list-style:none;margin:0 0 28px;padding:0;display:grid;gap:12px}' +
    '.cm-item{background:#F4F8FB;border:1px solid #E3EAF0;border-radius:16px;padding:16px 18px}' +
    '.cm-top{display:flex;gap:10px;align-items:center;margin-bottom:6px}' +
    '.cm-av{flex:none;width:34px;height:34px;border-radius:50%;background:#094570;color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px}' +
    '.cm-name{font-weight:700;color:#062F4D}.cm-date{color:#5B6E7F;font-size:13px;margin-inline-start:auto}' +
    '.cm-text{margin:0;font-size:16px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.cm-reply{margin-top:12px;padding:12px 14px;border-inline-start:3px solid #85CCFF;background:#fff;border-radius:10px;font-size:15px;line-height:1.6}' +
    '.cm-reply b{display:block;color:#094570;font-size:13px;margin-bottom:2px}' +
    '.cm-empty{color:#5B6E7F;font-size:15px;margin:0 0 24px}' +
    '.cm-form{display:grid;gap:12px;background:#fff;border:1px solid #E3EAF0;border-radius:18px;padding:20px;box-shadow:0 12px 32px -22px rgba(6,47,77,.25)}' +
    '.cm-form h3{margin:0;font-family:"Bricolage Grotesque",Inter,sans-serif;color:#062F4D;font-size:20px}' +
    '.cm-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:560px){.cm-row{grid-template-columns:1fr}}' +
    '.cm-form label{display:grid;gap:5px;font-size:13.5px;font-weight:600;color:#094570}' +
    '.cm-form input,.cm-form textarea{font:inherit;font-size:16px;font-weight:400;color:#0E2A3D;border:1.5px solid #E3EAF0;border-radius:12px;padding:11px 13px;background:#fff;width:100%;box-sizing:border-box}' +
    '.cm-form textarea{min-height:120px;resize:vertical}' +
    '.cm-form input:focus,.cm-form textarea:focus{outline:none;border-color:#3E97D9;box-shadow:0 0 0 3px rgba(133,204,255,.35)}' +
    '.cm-hp{position:absolute!important;left:-9999px!important;height:0;overflow:hidden}' +
    '.cm-foot{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}' +
    '.cm-note{font-size:13px;color:#5B6E7F;margin:0;flex:1 1 240px}' +
    '.cm-btn{border:0;background:#062F4D;color:#fff;font:inherit;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px;cursor:pointer}' +
    '.cm-btn:hover{background:#094570}.cm-btn:disabled{opacity:.6;cursor:wait}' +
    '.cm-msg{margin:0;font-size:14.5px;font-weight:600}.cm-msg.ok{color:#128C4B}.cm-msg.bad{color:#B3261E}';
  document.head.appendChild(css);

  var sec = document.createElement('section'); sec.className = 'cm'; sec.id = 'comments'; sec.setAttribute('aria-labelledby', 'cmH');
  sec.innerHTML = '<h2 id="cmH">Join the conversation</h2><p class="cm-sub">Share a thought, a question or your own experience. Comments are read before they appear.</p>' +
    '<ul class="cm-list" id="cmList" hidden></ul><p class="cm-empty" id="cmEmpty" hidden>No comments yet. Be the first to share a thought.</p>' +
    '<form class="cm-form" id="cmForm" novalidate><h3>Leave a comment</h3>' +
    '<div class="cm-row"><label>Your name<input name="name" maxlength="60" autocomplete="name" required></label>' +
    '<label>Email (optional, never shown)<input name="email" type="email" maxlength="120" autocomplete="email"></label></div>' +
    '<label>Your comment<textarea name="comment" maxlength="1500" required></textarea></label>' +
    '<div class="cm-hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
    '<div class="cm-foot"><p class="cm-note">Please keep it kind and on topic. We review comments before they are shown.</p><button class="cm-btn" type="submit">Post comment</button></div>' +
    '<p class="cm-msg" id="cmMsg" role="status"></p></form>';
  art.insertAdjacentElement('afterend', sec);

  var list = sec.querySelector('#cmList'), empty = sec.querySelector('#cmEmpty'), form = sec.querySelector('#cmForm'), msg = sec.querySelector('#cmMsg');
  function post(body) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 25000);
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl.signal })
      .then(function (r) { return r.json(); }).finally(function () { clearTimeout(t); });
  }
  function fdate(s) { var d = new Date(String(s).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function render(items) {
    list.innerHTML = '';
    items.forEach(function (c) {
      var li = document.createElement('li'); li.className = 'cm-item';
      var top = document.createElement('div'); top.className = 'cm-top';
      var av = document.createElement('span'); av.className = 'cm-av'; av.textContent = (c.name || '?').trim().charAt(0).toUpperCase();
      var nm = document.createElement('span'); nm.className = 'cm-name'; nm.textContent = c.name;
      var dt = document.createElement('span'); dt.className = 'cm-date'; dt.textContent = fdate(c.date);
      top.appendChild(av); top.appendChild(nm); top.appendChild(dt);
      var tx = document.createElement('p'); tx.className = 'cm-text'; tx.textContent = c.text;
      li.appendChild(top); li.appendChild(tx);
      if (c.reply) { var rp = document.createElement('div'); rp.className = 'cm-reply'; var b = document.createElement('b'); b.textContent = 'Himaayah Schools'; var rt = document.createElement('span'); rt.textContent = c.reply; rp.appendChild(b); rp.appendChild(rt); li.appendChild(rp); }
      list.appendChild(li);
    });
    list.hidden = !items.length; empty.hidden = !!items.length;
    var h = sec.querySelector('#cmH'); h.textContent = items.length ? 'Join the conversation (' + items.length + ')' : 'Join the conversation';
  }
  post({ action: 'cm_list', slug: slug }).then(function (j) { render(j && j.ok ? j.comments : []); }).catch(function () { render([]); });

  try { var saved = localStorage.getItem('hm_cm_name'); if (saved) form.elements.name.value = saved; } catch (e) {}
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var say = function (t, ok) { msg.textContent = t; msg.className = 'cm-msg ' + (ok ? 'ok' : 'bad'); };
    var name = form.elements.name.value.trim(), email = form.elements.email.value.trim(), text = form.elements.comment.value.trim();
    if (name.length < 2) { say('Enter your name.'); form.elements.name.focus(); return; }
    if (text.length < 5) { say('Write a short comment first.'); form.elements.comment.focus(); return; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say('Enter a valid email address, or leave it blank.'); form.elements.email.focus(); return; }
    var btn = form.querySelector('button'), label = btn.textContent; btn.disabled = true; btn.textContent = 'Posting…'; say('');
    post({ action: 'cm_post', slug: slug, name: name, email: email, comment: text, website: form.elements.website.value })
      .then(function (j) {
        if (!j || !j.ok) { say((j && j.error) || 'Something went wrong. Please try again.'); return; }
        try { localStorage.setItem('hm_cm_name', name); } catch (e) {}
        form.elements.comment.value = ''; say('Thank you. Your comment has been received and will appear once it has been reviewed.', true);
      })
      .catch(function () { say('We could not post your comment. Check your connection and try again.'); })
      .finally(function () { btn.disabled = false; btn.textContent = label; });
  });
})();

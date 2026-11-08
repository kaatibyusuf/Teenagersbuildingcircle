/* "Ask our assistant": a chat panel opened from the green "Chat with us" menu (answers come from api/chat).
   It only works once ANTHROPIC_API_KEY is set in Vercel; until then it shows a polite message. */
(function () {
  var menu = document.getElementById('waMenu');
  if (!menu) return;
  var AR = document.documentElement.getAttribute('lang') === 'ar';
  var T = AR ? {
    entry: 'اسأل مساعدنا', entrySub: 'إجابات فورية عن البرامج والرسوم', title: 'حارس · مساعد حِمَايَة', sub: 'يجيب من معلومات المدرسة. للأمور الخاصة بحسابك راسل فريقنا.',
    hi: 'السلام عليكم ورحمة الله. أنا حارس، المساعد الآلي لمدرسة حِمَايَة. كيف أستطيع مساعدتك؟', ph: 'اكتب سؤالك…', send: 'إرسال', close: 'إغلاق', wa: 'راسلنا على واتساب', err: 'تعذّر الاتصال. حاول مرة أخرى أو راسلنا على واتساب.',
    chips: ['ما هي الرسوم؟', 'كيف أسجّل؟', 'اختبار تحديد المستوى']
  } : {
    entry: 'Ask our assistant', entrySub: 'Quick answers on programmes and fees', title: 'Haris · Himaayah assistant', sub: 'Answers come from school information. For anything about your account, message our team.',
    hi: 'Assalaamu alaykum. I am Haris, the Himaayah Schools assistant. How can I help you today?', ph: 'Type your question…', send: 'Send', close: 'Close', wa: 'Message us on WhatsApp', err: 'Could not connect. Please try again or message us on WhatsApp.',
    chips: ['What are the fees?', 'How do I enrol?', 'Placement test']
  };
  var css = '.hsa-btn{display:flex;flex-direction:column;align-items:flex-start;padding:11px 14px;border:0;border-radius:10px;background:#E3F2FD;color:#062F4D;font:600 14px/1.3 inherit;font-family:inherit;text-align:start;cursor:pointer}' +
    '.hsa-btn span{display:inline-flex;align-items:center;gap:8px}.hsa-btn span:before{content:"";width:8px;height:8px;border-radius:50%;background:#3E97D9;box-shadow:0 0 0 3px rgba(62,151,217,.2)}.hsa-btn small{font-weight:500;color:#4A6072;font-size:13px}.hsa-btn:hover{background:#D3E9FA}.hsa-btn:focus-visible{outline:2px solid #85CCFF;outline-offset:3px}' +
    '.hsa{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 36px));display:none;flex-direction:column;background:#fff;border-radius:20px;box-shadow:0 20px 60px -12px rgba(6,47,77,.35),0 0 0 1px #E3EAF0;overflow:hidden;font:14.5px/1.5 Inter,-apple-system,sans-serif;color:#0E2A3D}' +
    '.hsa.open{display:flex}.hsa-h{background:#094570;color:#fff;padding:14px 16px;display:flex;gap:10px;align-items:flex-start}.hsa-h b{display:block;font-size:16px}.hsa-h small{display:block;color:#B9D6EC;font-size:12px;line-height:1.35;margin-top:2px}' +
    '.hsa-x{margin-inline-start:auto;background:transparent;border:0;color:#fff;font-size:24px;line-height:1;cursor:pointer;padding:0 4px}' +
    '.hsa-log{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#F4F8FB}' +
    '.hsa-m{max-width:86%;padding:10px 13px;border-radius:16px;white-space:pre-wrap;word-wrap:break-word}.hsa-m.a{background:#fff;border:1px solid #E3EAF0;align-self:flex-start;border-end-start-radius:4px}.hsa-m.u{background:#094570;color:#fff;align-self:flex-end;border-end-end-radius:4px}' +
    '.hsa-m a{color:inherit;text-decoration:underline}.hsa-chips{display:flex;flex-wrap:wrap;gap:8px}.hsa-chip{border:1px solid #B9CCDB;background:#fff;color:#094570;border-radius:99px;padding:7px 13px;font:600 13px inherit;font-family:inherit;cursor:pointer}' +
    '.hsa-go{display:inline-block;align-self:flex-start;background:#128C4B;color:#fff!important;text-decoration:none!important;font-weight:700;padding:10px 16px;border-radius:12px}' +
    '.hsa-dots{align-self:flex-start;color:#5B6E7F;padding:2px 8px}.hsa-f{display:flex;gap:8px;padding:10px;border-top:1px solid #E3EAF0;background:#fff}' +
    '.hsa-f input{flex:1;min-width:0;border:1px solid #B9CCDB;border-radius:12px;padding:0 14px;height:44px;font:16px inherit;font-family:inherit;color:#0E2A3D}.hsa-f input:focus{outline:2px solid #3E97D9;outline-offset:1px}' +
    '.hsa-f button{border:0;background:#094570;color:#fff;border-radius:12px;padding:0 16px;font:700 14px inherit;font-family:inherit;cursor:pointer}.hsa-f button:disabled{opacity:.5}' +
    '@media(max-width:520px){.hsa{right:8px;bottom:8px;height:calc(100vh - 16px)}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var msgs = []; try { msgs = JSON.parse(sessionStorage.getItem('hsa') || '[]') || []; } catch (e) {}
  var save = function () { try { sessionStorage.setItem('hsa', JSON.stringify(msgs.slice(-20))); } catch (e) {} };
  var el = function (tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

  var panel = el('div', 'hsa'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', T.title);
  var head = el('div', 'hsa-h'), hb = el('div'); hb.appendChild(el('b', '', T.title)); hb.appendChild(el('small', '', T.sub));
  var x = el('button', 'hsa-x', '×'); x.type = 'button'; x.setAttribute('aria-label', T.close); head.appendChild(hb); head.appendChild(x);
  var log = el('div', 'hsa-log'); log.setAttribute('aria-live', 'polite');
  var form = el('form', 'hsa-f'), input = el('input'); input.type = 'text'; input.placeholder = T.ph; input.maxLength = 600; input.setAttribute('aria-label', T.ph); input.autocomplete = 'off';
  var send = el('button', '', T.send); send.type = 'submit'; form.appendChild(input); form.appendChild(send);
  panel.appendChild(head); panel.appendChild(log); panel.appendChild(form); document.body.appendChild(panel);

  function linkify(node, text) {                                   // plain text + clickable https links, built with DOM nodes (no innerHTML)
    var re = /(https?:\/\/[^\s)]+|himaayahschools\.com\/[^\s)]*)/g, last = 0, m;
    while ((m = re.exec(text))) {
      node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var raw = m[0].replace(/[.,;!?]+$/, ''), a = el('a', '', raw); a.href = /^http/.test(raw) ? raw : 'https://www.' + raw; a.target = '_blank'; a.rel = 'noopener';
      node.appendChild(a); last = m.index + raw.length; re.lastIndex = last;
    }
    node.appendChild(document.createTextNode(text.slice(last)));
  }
  function add(role, text, go) {
    var m = el('div', 'hsa-m ' + (role === 'user' ? 'u' : 'a')); linkify(m, text); log.appendChild(m);
    if (go) { var a = el('a', 'hsa-go', T.wa + ' · ' + go.name); a.href = go.url; a.target = '_blank'; a.rel = 'noopener'; log.appendChild(a); }
    log.scrollTop = log.scrollHeight; return m;
  }
  function render() {
    log.textContent = ''; add('assistant', T.hi);
    if (!msgs.length) { var c = el('div', 'hsa-chips'); T.chips.forEach(function (q) { var b = el('button', 'hsa-chip', q); b.type = 'button'; b.onclick = function () { ask(q); }; c.appendChild(b); }); log.appendChild(c); }
    msgs.forEach(function (m) { add(m.role, m.text, m.go); });
  }
  var busy = false;
  function ask(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    busy = true; send.disabled = true; input.value = '';
    var chips = log.querySelector('.hsa-chips'); if (chips) chips.remove();
    msgs.push({ role: 'user', text: text }); add('user', text); save();
    var dots = el('div', 'hsa-dots', '…'); log.appendChild(dots); log.scrollTop = log.scrollHeight;
    var body = JSON.stringify({ messages: msgs.slice(-10).map(function (m) { return { role: m.role, text: m.text }; }) });
    fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        dots.remove();
        if (j.reply) { msgs.push({ role: 'assistant', text: j.reply, go: j.handover || null }); add('assistant', j.reply, j.handover); }
        else add('assistant', j.error || T.err, { name: 'WhatsApp', url: 'https://wa.me/2347047226487' });
      })
      .catch(function () { dots.remove(); add('assistant', T.err, { name: 'WhatsApp', url: 'https://wa.me/2347047226487' }); })
      .then(function () { busy = false; send.disabled = false; save(); input.focus(); });
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
  function open() {
    var w = document.getElementById('waWidget'), b = document.getElementById('waBtn');
    if (w) w.classList.remove('open'); if (b) b.setAttribute('aria-expanded', 'false');
    panel.classList.add('open'); input.focus();
  }
  x.addEventListener('click', function () { panel.classList.remove('open'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') panel.classList.remove('open'); });

  var btn = el('button', 'hsa-btn'); btn.type = 'button'; var s1 = el('span', '', T.entry), s2 = el('small', '', T.entrySub); btn.appendChild(s1); btn.appendChild(s2);
  btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
  menu.insertBefore(btn, menu.firstChild);
  render();
})();

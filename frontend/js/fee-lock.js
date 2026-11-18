/* Fee lock screen (FeeLock.gs). When the school server says a student's fee is overdue, the portal does not open.
   This shows what is owed and a Pay now button instead. Everything from the server is set with textContent. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === 'text') n.textContent = props[k]; else if (k === 'class') n.className = props[k]; else n.setAttribute(k, props[k]); });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function nice(iso) {
    var d = new Date(String(iso || '').slice(0, 10) + 'T12:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  window.feeLocked = function (d) {
    var s = (d && d.student) || {}, first = String(s.Name || '').trim().split(/\s+/)[0] || 'student', id = encodeURIComponent(s.StudentID || '');
    var login = $('login'), app = $('app'), out = $('out');
    if (login) login.hidden = true;
    if (out) out.hidden = false;
    if (!app) return;
    app.hidden = false; app.className = (app.className || '').replace(/\bwrap\b/, '').trim() + ' wrap';
    while (app.firstChild) app.removeChild(app.firstChild);
    var due = nice(s.NextDue), fee = Number(s.Fee) || 0;
    var wa = 'https://wa.me/2347025842849?text=' + encodeURIComponent('Assalaamu alaykum. This is my payment receipt. Name: ' + (s.Name || '') + ', ID: ' + (s.StudentID || '') + '.');
    var card = el('article', { 'class': 'c', style: 'max-width:560px;margin:48px auto;padding:32px' }, [
      el('span', { 'class': 'kick', text: 'Fee due' }),
      el('h1', { text: 'Assalaamu alaykum, ' + first }),
      el('p', { style: 'margin:14px 0 10px', text: due ? 'Your fee was due on ' + due + '. Your portal opens again as soon as the payment is applied.' : (d.message || 'Your fee is due. Your portal opens again as soon as the payment is applied.') }),
      fee ? el('p', { 'class': 'sub', style: 'margin:0 0 18px', text: 'Amount: ₦' + fee.toLocaleString('en-NG') }) : null,
      el('p', { style: 'margin:0 0 18px' }, [el('a', { 'class': 'btn btn-ink', href: 'pay?id=' + id, text: 'Pay now' })]),
      el('p', { 'class': 'sub' }, [document.createTextNode('Already paid? Send your receipt on '), el('a', { href: wa, target: '_blank', rel: 'noopener noreferrer', text: 'WhatsApp' }), document.createTextNode(' and it will be applied.')])
    ]);
    app.appendChild(card);
    window.scrollTo(0, 0);
  };
})();

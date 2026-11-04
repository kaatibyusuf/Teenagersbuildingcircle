/* Himaayah Schools: cookie and storage notice. Shows once, remembers the choice in this browser. */
(function () {
  'use strict';
  var KEY = 'hs-cookie-ok';
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}
  var ar = false;
  try { ar = localStorage.getItem('hs-lang') === 'ar'; } catch (e) {}
  var T = ar
    ? { t: 'ملفات الارتباط والتخزين', p: 'نستخدم تخزينًا أساسيًا في متصفحك لتسجيل الدخول والسلة واللغة، وإحصاءات زيارات لا تستخدم ملفات الارتباط. لا نبيع بياناتك ولا نعرض إعلانات الأطراف الثالثة.', ok: 'حسنًا', more: 'سياسة ملفات الارتباط' }
    : { t: 'Cookies and storage', p: 'We use essential storage in your browser for sign-in, your cart and your language, and visit counts that do not use cookies. We do not sell your data or show third-party ads.', ok: 'Got it', more: 'Cookie policy' };
  var css = '.ck{position:fixed;left:16px;right:16px;bottom:16px;z-index:9998;max-width:560px;margin:0 auto;background:#062F4D;color:#fff;border-radius:18px;padding:18px 20px;box-shadow:0 18px 48px -12px rgba(6,47,77,.5);font:14px/1.5 Inter,system-ui,sans-serif}' +
    '.ck b{display:block;font-size:15px;margin-bottom:4px}.ck p{margin:0 0 12px;color:#d6e6f2}.ck div{display:flex;gap:10px;align-items:center;flex-wrap:wrap}' +
    '.ck button{border:0;border-radius:99px;background:#85CCFF;color:#062F4D;font:600 14px Inter,system-ui,sans-serif;padding:9px 20px;cursor:pointer}' +
    '.ck a{color:#85CCFF;text-decoration:underline}@media(min-width:640px){.ck{left:auto;right:20px;margin:0}}';
  function show() {
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    var d = document.createElement('div'); d.className = 'ck'; d.setAttribute('role', 'region'); d.setAttribute('aria-label', T.t);
    if (ar) d.dir = 'rtl';
    d.innerHTML = '<b>' + T.t + '</b><p>' + T.p + '</p><div><button type="button">' + T.ok + '</button><a href="/policies#cookies">' + T.more + '</a></div>';
    d.querySelector('button').onclick = function () { try { localStorage.setItem(KEY, '1'); } catch (e) {} d.remove(); };
    document.body.appendChild(d);
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();

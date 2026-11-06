/* Light / dark mode. Runs in <head> so the saved choice is applied before the page paints. */
(function () {
  var KEY = 'hs-theme', root = document.documentElement;
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function systemDark() { return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches; }
  function current() { var s = read(); return s ? s : (systemDark() ? 'dark' : 'light'); }
  function apply(t) {
    if (t === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    var b = document.querySelector('.theme-btn');
    if (b) {
      var ar = root.lang === 'ar';
      b.setAttribute('aria-pressed', String(t === 'dark'));
      var l = t === 'dark' ? (ar ? 'التبديل إلى الوضع الفاتح' : 'Switch to light mode') : (ar ? 'التبديل إلى الوضع الداكن' : 'Switch to dark mode');
      b.setAttribute('aria-label', l); b.title = l;
    }
  }
  apply(current());

  var SVG = '<svg class="t-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>' +
    '<svg class="t-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  function place() {
    if (document.querySelector('.theme-btn')) return true;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'theme-btn'; b.setAttribute('translate', 'no'); b.innerHTML = SVG;
    b.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      write(next); apply(next);
    });
    var lang = document.querySelector('.lang');
    if (lang && lang.parentNode && !lang.classList.contains('lang-float')) lang.parentNode.insertBefore(b, lang);
    else { b.classList.add('theme-float'); document.body.appendChild(b); }
    apply(current());
    return true;
  }
  function init() { place(); }
  window.addEventListener('load', function () {
    var b = document.querySelector('.theme-btn'), lang = document.querySelector('.lang');
    if (b && lang && b.classList.contains('theme-float') && !lang.classList.contains('lang-float')) { b.classList.remove('theme-float'); lang.parentNode.insertBefore(b, lang); }
  });
  // i18n.js adds the language switch; wait for it so the two sit together
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  else setTimeout(init, 0);
  new MutationObserver(function () { apply(current()); }).observe(root, { attributes: true, attributeFilter: ['lang'] });
  if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (!read()) apply(current()); }); } catch (e) {} }
})();

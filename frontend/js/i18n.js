/* Himaayah Schools: English / Arabic switch.
   Loaded in <head> on every page. The pages are written in English; in Arabic mode
   this file turns the page right-to-left and swaps every English text it knows for
   its Arabic translation, including text the page's own scripts add later.
   Switching happens in place, so a signed-in portal or a half-filled form is kept.
   Translations live in js/lang/ar/common.js and js/lang/ar/<page>.js.
   "More languages" loads Google Translate on demand. */
(function () {
  'use strict';
  var KEY = 'hs-lang';
  var root = document.documentElement;
  var me = document.currentScript;
  var base = me && me.src ? me.src.replace(/i18n\.js(?:\?.*)?$/, '') : 'js/';
  var page = (root.className.match(/(?:^|\s)page-([\w-]+)/) || [])[1] || '';

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function sstore(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function googleOn() { return /(?:^|;\s*)googtrans=\/en\/(?!en\b)[\w-]+/.test(document.cookie) || /\btranslated-(?:ltr|rtl)\b/.test(root.className); }

  // ?lang=ar or ?lang=en in a link sets the language too
  var q = /[?&]lang=(ar|en)\b/.exec(location.search);
  if (q) store(KEY, q[1]);
  var lang = store(KEY) === 'ar' && !googleOn() ? 'ar' : 'en';

  var API = window.HS_I18N = { lang: lang, missing: {}, ready: false };
  var D = Object.create(null), P = [], REV = null;

  // Patterns are tried most specific first: the more fixed words a pattern has, the earlier it runs
  function weight(src) {
    var s = src, prev;
    do { prev = s; s = s.replace(/\((?:[^()\\]|\\.)*\)[?*+]?/g, ''); } while (s !== prev);
    return s.replace(/\\./g, 'x').length;
  }
  API.add = function (obj) {
    for (var k in obj) {
      if (k.slice(0, 3) === 're:') P.push([new RegExp('^' + k.slice(3) + '$'), obj[k], weight(k.slice(3))]);
      else D[k] = obj[k];
    }
    P.sort(function (a, b) { return b[2] - a[2]; });
    REV = null;
  };

  /* ---------- translating ---------- */
  var MONTHS = { January: 'يناير', February: 'فبراير', March: 'مارس', April: 'أبريل', May: 'مايو', June: 'يونيو', July: 'يوليو', August: 'أغسطس', September: 'سبتمبر', October: 'أكتوبر', November: 'نوفمبر', December: 'ديسمبر',
    Jan: 'يناير', Feb: 'فبراير', Mar: 'مارس', Apr: 'أبريل', Jun: 'يونيو', Jul: 'يوليو', Aug: 'أغسطس', Sep: 'سبتمبر', Sept: 'سبتمبر', Oct: 'أكتوبر', Nov: 'نوفمبر', Dec: 'ديسمبر',
    Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت', Sunday: 'الأحد',
    Mon: 'الاثنين', Tue: 'الثلاثاء', Wed: 'الأربعاء', Thu: 'الخميس', Fri: 'الجمعة', Sat: 'السبت', Sun: 'الأحد' };
  var DATE_WORDS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun';
  var DATE_RE = new RegExp('\\b(' + DATE_WORDS + ')\\b', 'g');
  var DATE_ONLY = new RegExp('^[\\d\\s.,:/\\-–—·•+()₦%]*(' + DATE_WORDS + ')\\b[\\w\\s.,:/\\-–—·•+()₦%]*$');
  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function dateAr(t) { var d = t.replace(DATE_RE, function (m) { return MONTHS[m]; }); return d === t ? t : d.replace(/,/g, '،'); }
  function piece(x) {           // a captured part of a pattern: translate it if known, else just its month/day names
    var t = norm(x); if (!t) return x;
    if (D[t] !== undefined) return D[t];
    var p = pat(t); if (p !== null) return p;
    return dateAr(t);
  }
  function pat(t) {
    for (var i = 0; i < P.length; i++) {
      var m = P[i][0].exec(t);
      if (m) return P[i][1].replace(/\$(\d)/g, function (_, n) { return m[+n] === undefined ? '' : piece(m[+n]); });
    }
    return null;
  }
  function tr(t) {
    if (D[t] !== undefined) return D[t];
    var p = pat(t); if (p !== null) return p;
    if (DATE_ONLY.test(t) && !/[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(t)) {
      var d = dateAr(t);
      if (!/[A-Za-z]/.test(d)) return d;
    }
    return null;
  }
  API.tr = function (s) { return tr(norm(String(s))); };

  var SKIP = 'script,style,noscript,code,pre,textarea,[translate="no"],.notranslate';
  var done = new WeakMap(), orig = new WeakMap(), texts = [], attrs = [];
  function miss(t) { if (t.length < 400) API.missing[t] = (API.missing[t] || 0) + 1; }
  function prune() {
    if (texts.length > 4000) texts = texts.filter(function (n) { return n.isConnected; });
    if (attrs.length > 4000) attrs = attrs.filter(function (r) { return r[0].isConnected; });
  }
  // phone numbers keep their left-to-right digit order inside Arabic text
  var PHONE = /\+?\d[\d ]{7,}\d/, PHONES = /\+?\d[\d ]{7,}\d/g;
  function isolate(s) { return s.replace(PHONES, function (m) { return '\u2066' + m + '\u2069'; }); }
  function doText(n) {
    var v = n.nodeValue;
    if (!v || done.get(n) === v) return;
    var latin = /[A-Za-z]/.test(v), phone = PHONE.test(v) && v.indexOf('\u2066') < 0;
    if (!latin && !phone) return;
    var p = n.parentNode;
    if (!p || p.nodeType !== 1 || p.closest(SKIP)) return;
    var t = norm(v), a = latin ? tr(t) : t;
    if (a === null) { miss(t); if (!phone) return; a = t; }
    if (p.tagName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', p.value);
    var out = (/^[.,،؛:!?)]/.test(a) ? '' : v.match(/^\s*/)[0]) + isolate(a) + v.match(/\s*$/)[0];
    if (!orig.has(n)) texts.push(n);
    orig.set(n, v); done.set(n, out);
    n.nodeValue = out;
  }
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var SKIP_ATTR = 'script,style,noscript,code,pre,[translate="no"],.notranslate';
  function doAttr(el, name) {
    var v = el.getAttribute(name);
    if (!v || !/[A-Za-z]/.test(v) || el.closest(SKIP_ATTR)) return;
    var t = norm(v), a = tr(t);
    if (a === null) { miss(t); return; }
    attrs.push([el, name, v, a]);
    el.setAttribute(name, a);
  }
  function doEl(el) {
    for (var i = 0; i < ATTRS.length; i++) if (el.hasAttribute(ATTRS[i])) doAttr(el, ATTRS[i]);
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/.test(el.type) && el.value && /[A-Za-z]/.test(el.value) && !el.closest(SKIP)) {
      var a = tr(norm(el.value)); if (a !== null) { attrs.push([el, '.value', el.value, a]); el.value = a; }
    }
  }
  function walk(rootNode) {
    if (rootNode.nodeType === 3) { doText(rootNode); return; }
    if (rootNode.nodeType !== 1) return;
    if (rootNode.closest && rootNode.closest(SKIP_ATTR)) return;
    doEl(rootNode);
    var els = rootNode.querySelectorAll('[placeholder],[title],[aria-label],[alt],input[type=button],input[type=submit],input[type=reset]');
    for (var i = 0; i < els.length; i++) doEl(els[i]);
    var w = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    for (var j = 0; j < list.length; j++) doText(list[j]);
  }
  var titleEn = null;
  function doTitle() {
    var t = norm(document.title), a = t && tr(t);
    if (a && a !== document.title) { titleEn = document.title; document.title = a; }
  }

  // back to English: every text and attribute we changed goes back to what the page wrote
  function restore() {
    if (!REV) { REV = Object.create(null); for (var k in D) REV[D[k]] = k; }
    texts.forEach(function (n) {
      if (!n.isConnected) return;
      var v = n.nodeValue;
      if (v === done.get(n)) n.nodeValue = orig.get(n);
      else if (REV[norm(v)] !== undefined) n.nodeValue = REV[norm(v)];
      done.delete(n); orig.delete(n);
    });
    attrs.forEach(function (r) {
      var el = r[0];
      if (r[1] === '.value') { if (el.value === r[3]) el.value = r[2]; }
      else if (el.getAttribute(r[1]) === r[3]) el.setAttribute(r[1], r[2]);
    });
    texts = []; attrs = [];
    if (titleEn !== null) { document.title = titleEn; titleEn = null; }
  }

  // headings that an English-only letter animation has split into single letters are put back whole
  function joinHeadings() {
    var hs = document.querySelectorAll('.hero h1');
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      if (h.querySelector('.ch') && h.getAttribute('aria-label')) { h.textContent = h.getAttribute('aria-label'); h.removeAttribute('aria-label'); }
    }
  }

  var mo = null, mt = null;
  function observe() {
    if (mo) return;
    mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') { if (m.target.nodeType === 1) doAttr(m.target, m.attributeName); }
        else for (var k = 0; k < m.addedNodes.length; k++) walk(m.addedNodes[k]);
      }
      prune();
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    var tt = document.querySelector('title');
    if (tt) { mt = new MutationObserver(function () { if (lang === 'ar') doTitle(); }); mt.observe(tt, { childList: true, characterData: true, subtree: true }); }
  }
  function unobserve() { if (mo) { mo.disconnect(); mo = null; } if (mt) { mt.disconnect(); mt = null; } }

  var loaded = false, waiting = [];
  function loadDicts(cb) {
    if (loaded) { cb(); return; }
    waiting.push(cb);
    if (waiting.length > 1) return;
    var files = ['common'].concat(page ? [page] : []), left = files.length;
    files.forEach(function (f) {
      var s = document.createElement('script');
      s.src = base + 'lang/ar/' + f + '.js';
      s.async = false;
      s.onload = s.onerror = function () {
        if (--left) return;
        loaded = true;
        var w = waiting; waiting = [];
        w.forEach(function (fn) { fn(); });
      };
      document.head.appendChild(s);
    });
  }

  // pop-up messages from the page scripts are translated too
  ['alert', 'confirm', 'prompt'].forEach(function (fn) {
    var o = window[fn];
    if (typeof o !== 'function') return;
    window[fn] = function (msg) {
      var args = Array.prototype.slice.call(arguments);
      if (lang === 'ar' && typeof msg === 'string') { var a = tr(norm(msg)); if (a !== null) args[0] = a; }
      return o.apply(window, args);
    };
  });

  function toArabic(then) {
    root.setAttribute('lang', 'ar');
    root.setAttribute('dir', 'rtl');
    loadDicts(function () {
      if (lang !== 'ar') return;
      joinHeadings();
      walk(document.body);
      doTitle();
      observe();
      API.ready = true;
      root.classList.remove('i18n-wait');
      if (then) then();
    });
  }
  function toEnglish() {
    unobserve();
    restore();
    root.setAttribute('lang', 'en');
    root.removeAttribute('dir');
  }

  /* ---------- the switch ---------- */
  var GLOBE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5s1.3-6.8 3.9-9.5z"/></svg>';
  var CHECK = '<svg class="lang-tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';

  function clearGoogle() {
    var exp = '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    var h = location.hostname;
    document.cookie = 'googtrans' + exp;
    document.cookie = 'googtrans' + exp + '; domain=' + h;
    document.cookie = 'googtrans' + exp + '; domain=.' + h;
    var parts = h.split('.');
    if (parts.length > 2) document.cookie = 'googtrans' + exp + '; domain=.' + parts.slice(-2).join('.');
  }
  function cleanUrl() {          // a ?lang= in the address must not override the visitor's choice later
    try { var u = new URL(location.href); if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); return u.toString(); } } catch (e) {}
    return null;
  }

  var wrap, btn, menu;
  function closeMenu() { if (!wrap) return; wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  function paintSwitch() {
    if (!wrap) return;
    var ar = lang === 'ar', gt = googleOn();
    btn.setAttribute('aria-label', ar ? 'اللغة' : 'Language');
    wrap.querySelector('.lang-cur').textContent = gt ? '…' : ar ? 'عربي' : 'EN';
    wrap.querySelector('[data-lang="en"]').setAttribute('aria-checked', String(!ar && !gt));
    wrap.querySelector('[data-lang="ar"]').setAttribute('aria-checked', String(ar));
    wrap.querySelector('.lang-more').textContent = ar ? 'لغات أخرى' : 'More languages';
  }
  function setLang(to) {
    store(KEY, to);
    var u = cleanUrl(); if (u) try { history.replaceState(history.state, '', u); } catch (e) {}
    if (to === lang) { paintSwitch(); return; }
    lang = API.lang = to;
    if (to === 'ar') toArabic(); else toEnglish();
    paintSwitch();
  }
  function choose(to) {
    if (to === 'more') { if (lang === 'ar') setLang('en'); openGoogle(); return; }
    if (googleOn()) {            // Google has rewritten the page; only a fresh load undoes that
      clearGoogle(); store(KEY, to);
      location.href = cleanUrl() || location.href.split('#')[0];
      return;
    }
    setLang(to);
    closeMenu();
  }

  function buildSwitch() {
    if (document.querySelector('.lang')) return;
    wrap = document.createElement('div');
    wrap.className = 'lang';
    wrap.setAttribute('translate', 'no');
    wrap.innerHTML =
      '<button type="button" class="lang-btn" aria-haspopup="true" aria-expanded="false">' + GLOBE + '<span class="lang-cur"></span></button>' +
      '<div class="lang-menu" role="menu">' +
      '<button type="button" role="menuitemradio" data-lang="en" lang="en" dir="ltr">English' + CHECK + '</button>' +
      '<button type="button" role="menuitemradio" data-lang="ar" lang="ar" dir="rtl">العربية' + CHECK + '</button>' +
      '<button type="button" role="menuitem" data-lang="more" class="lang-more"></button>' +
      '<div class="lang-gt" id="hs-gt"></div>' +
      '</div>';
    btn = wrap.querySelector('.lang-btn');
    menu = wrap.querySelector('.lang-menu');
    paintSwitch();
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !wrap.classList.contains('open');
      wrap.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lang]');
      if (b) { e.stopPropagation(); choose(b.getAttribute('data-lang')); }
    });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

    // where it goes: public nav, the Madrasah page's nav, portal top bar, or a small floating pill
    var pill = document.querySelector('.nav-pill');
    var mpill = document.querySelector('nav.nav > .pill');
    var topNav = document.querySelector('header.top nav');
    if (pill) { pill.classList.add('has-lang'); pill.insertBefore(wrap, document.getElementById('navToggle')); }
    else if (mpill) { mpill.classList.add('has-lang'); mpill.insertBefore(wrap, document.getElementById('tog')); }
    else if (topNav) topNav.insertBefore(wrap, topNav.firstChild);
    else { wrap.classList.add('lang-float'); document.body.appendChild(wrap); }

    if (googleOn()) openGoogle();
  }

  var gtLoading = false;
  function openGoogle() {
    wrap.classList.add('open', 'gt');
    btn.setAttribute('aria-expanded', 'true');
    if (gtLoading) return;
    gtLoading = true;
    window.hsGoogleTranslate = function () {
      /* global google */
      new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'hs-gt');
    };
    var s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=hsGoogleTranslate';
    s.onerror = function () { var g = document.getElementById('hs-gt'); if (g) g.textContent = 'Google Translate could not load.'; };
    document.head.appendChild(s);
  }

  /* ---------- boot ---------- */
  function onReady(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  if (lang === 'ar') {
    root.setAttribute('lang', 'ar');
    root.setAttribute('dir', 'rtl');
    root.classList.add('i18n-wait');          // hide the page a moment so English doesn't flash
    loadDicts(function () {});                // start fetching now, in parallel with the page
    onReady(function () { buildSwitch(); toArabic(); });
    setTimeout(function () { root.classList.remove('i18n-wait'); }, 3000);
  } else {
    onReady(buildSwitch);
  }
})();

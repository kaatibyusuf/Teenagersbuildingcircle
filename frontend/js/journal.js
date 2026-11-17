/* Literary journal: lists approved Arabic work, opens it in a reader, and sends new submissions for review.
   Everything shown is put on the page as plain text (textContent). */
(function () {
  'use strict';
  var API_URL = 'https://script.google.com/macros/s/AKfycby0AsifBuB_Ad7g1SjDXCipaDU27-BrzYWf67muw5jeY_C0_0uz8AhQYYXdiNRQhvqX/exec';
  var MAX_BYTES = 7 * 1024 * 1024, MAX_TEXT = 20000, MIN_TEXT = 40, BIO_MIN = 200, BIO_MAX = 200;
  /* [English name used by the server, Arabic name shown large on the cover] */
  var GENRES = [['Poem', 'قصيدة'], ['Short story', 'قصة قصيرة'], ['Essay', 'مقال'], ['Reflection', 'خاطرة'], ['Translation', 'ترجمة'], ['Research paper', 'بحث']];
  var PROGRAMMES = ['Madrasah', 'Academy', 'Skills School', 'Teenagers Building Circle', 'Alumni', 'Guest'];
  var MSG = {
    title: 'Enter the title of your work.',
    author: 'Enter your name as it should appear.',
    email: 'Enter a valid email address.',
    genre: 'Choose the type of work.',
    nofile: 'Attach your work as a Word document (.docx).',
    pdf: 'The attachment must be a Word document (.docx).',
    big: 'That file is too large. The limit is 7 MB.',
    own: 'Please confirm this is your own work and that we may publish it.',
    sending: 'Sending…',
    uploading: 'Uploading. This can take a moment…',
    done: 'Thank you. Your work has reached our staff for review. We will email you once we have read it.',
    net: 'We could not send it. Check your internet connection and try again.',
    fail: 'Something went wrong. Please try again.',
    none: 'Nothing has been published yet. Be the first: send in your work.',
    nomatch: 'Nothing matches. Try fewer words or clear the filters.',
    loading: 'Loading the work…',
    loadfail: 'We could not load the work just now. Please refresh in a moment.',
    openfail: 'We could not open that piece. Please try again.'
  };
  var $ = function (id) { return document.getElementById(id); };
  var works = [];

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function post(body) { return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }
  function fill(sel, list) {
    list.forEach(function (g) { var v = Array.isArray(g) ? g[0] : g, o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
  }
  function genreAr(v) { for (var i = 0; i < GENRES.length; i++) if (GENRES[i][0] === v) return GENRES[i][1]; return v; }
  /* search ignores vowel marks and the different forms of alef, ya and ta marbuta */
  function norm(s) { return String(s || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه'); }
  function wordCount(s) { var t = String(s || '').trim(); return t ? t.split(/\s+/).length : 0; }
  function arabicShare(s) {
    var ar = (s.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g) || []).length, la = (s.match(/[A-Za-z]/g) || []).length;
    return ar + la === 0 ? 0 : ar / (ar + la);
  }

  /* ---------- list ---------- */
  function byLine(w) {
    var by = el('p', 'jn-by'); var a = el('b', '', w.Author); a.dir = 'auto'; by.appendChild(a);
    if (w.Programme && w.Programme !== 'Guest') { by.appendChild(document.createTextNode(' · ')); by.appendChild(el('span', '', w.Programme)); }
    if (w.Year) by.appendChild(document.createTextNode(' · ' + w.Year));
    return by;
  }
  function readBtn(w, cls, withEn) {
    var b = el('button', cls, withEn ? 'Read now' : 'Read'); b.type = 'button';
    b.addEventListener('click', function () { openWork(w.ID); });
    return b;
  }
  var GKEY = { 'Poem': 'poem', 'Short story': 'story', 'Essay': 'essay', 'Reflection': 'reflection', 'Translation': 'translation', 'Research paper': 'research' };
  function genreKey(g) { return GKEY[g] || 'essay'; }
  function featCard(w, i) {
    var c = el('article', 'jn-card');
    var art = el('div', 'jn-art jn-c' + (i % 6) + ' jn-g-' + genreKey(w.Genre)); art.appendChild(el('small', '', w.Genre)); var g = el('b', 'jn-ar', genreAr(w.Genre)); g.lang = 'ar'; g.dir = 'rtl'; art.appendChild(g); c.appendChild(art);
    c.appendChild(el('p', 'jn-label', w.Featured ? 'Featured' : 'New'));
    var h = el('h3', 'jn-ar', w.Title); h.dir = 'auto'; c.appendChild(h); c.appendChild(byLine(w));
    var s = el('p', 'jn-sum', w.Excerpt); s.dir = 'auto'; c.appendChild(s);
    c.appendChild(readBtn(w, 'jn-link'));
    return c;
  }
  function row(w) {
    var c = el('article', 'jn-item');
    var tags = el('div', 'jn-tags');
    if (w.Featured) tags.appendChild(el('span', 'jn-tag jn-feat-tag', 'Featured'));
    tags.appendChild(el('span', 'jn-tag', w.Genre));
    c.appendChild(tags);
    var h = el('h3', 'jn-ar', w.Title); h.dir = 'auto'; c.appendChild(h); c.appendChild(byLine(w));
    var s = el('p', 'jn-sum', w.Excerpt); s.dir = 'auto'; c.appendChild(s);
    c.appendChild(readBtn(w, 'jn-btn jn-read', true));
    return c;
  }
  function renderFeatured() {
    var box = $('jnFeat'); box.textContent = '';
    works.slice(0, 3).forEach(function (w, i) { box.appendChild(featCard(w, i)); });
    $('latest').hidden = works.length === 0;
  }
  function render() {
    var q = norm($('jnQ').value.trim()), g = $('jnGenre').value, p = $('jnProg').value;
    var shown = works.filter(function (w) {
      if (g && w.Genre !== g) return false;
      if (p && w.Programme !== p) return false;
      return !q || norm(w.Title + ' ' + w.Author + ' ' + w.Excerpt).indexOf(q) >= 0;
    });
    var list = $('jnList'); list.textContent = '';
    shown.forEach(function (w) { list.appendChild(row(w)); });
    $('jnCount').textContent = works.length ? shown.length + ' / ' + works.length : '';
    var empty = $('jnEmpty'); empty.hidden = shown.length > 0; empty.textContent = '';
    if (!shown.length) empty.textContent = works.length ? MSG.nomatch : MSG.none;
  }
  function load() {
    var empty = $('jnEmpty'); empty.hidden = false; empty.textContent = MSG.loading;
    post({ action: 'jrn_list' }).then(function (j) {
      works = j && j.ok && Array.isArray(j.works) ? j.works : [];
      renderFeatured(); render();
    }).catch(function () {
      works = []; renderFeatured(); empty.hidden = false; empty.textContent = MSG.loadfail;
    });
  }

  /* ---------- reader ---------- */
  function openWork(id) {
    post({ action: 'jrn_get', id: id }).then(function (j) {
      if (!j || !j.ok || !j.work) throw new Error('x');
      var w = j.work, d = $('jnReader');
      $('jnRG').textContent = w.Genre;
      $('jnRT').textContent = w.Title;
      var by = $('jnRBy'); by.textContent = ''; var au = el('b', '', w.Author); au.dir = 'auto'; by.appendChild(au);
      if (w.Programme && w.Programme !== 'Guest') { by.appendChild(document.createTextNode(' · ')); by.appendChild(el('span', '', w.Programme)); }
      if (w.Year) by.appendChild(document.createTextNode(' · ' + w.Year));
      $('jnRText').textContent = w.Text;
      var bio = $('jnRBio'); bio.hidden = !w.Bio; bio.textContent = w.Bio || '';
      var pdf = $('jnRPdf'); if (/^https:\/\//i.test(w.FileUrl || '')) { pdf.href = w.FileUrl; pdf.hidden = false; } else { pdf.hidden = true; pdf.removeAttribute('href'); }
      if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
      d.scrollTop = 0;
    }).catch(function () { window.alert(MSG.openfail); });
  }
  function closeReader() { var d = $('jnReader'); if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }

  /* ---------- submit ---------- */
  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(new Error('read')); };
      r.readAsDataURL(file);
    });
  }
  function say(m, kind) { var p = $('jnMsg'); p.textContent = m || ''; p.className = 'jn-msg' + (kind ? ' ' + kind : ''); }
  function sayRaw(text) { var p = $('jnMsg'); p.textContent = text; p.className = 'jn-msg bad'; }
  function mark(id, bad) { var f = $(id); if (f) { if (bad) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid'); } }
  function check() {
    var v = { title: $('fTitle').value.trim(), author: $('fAuthor').value.trim(), email: $('fEmail').value.trim(), genre: $('fGenre').value,
              file: $('fFile').files[0] || null, own: $('fOwn').checked };
    var rules = [
      ['fTitle', v.title.length >= 3, MSG.title], ['fAuthor', v.author.length >= 2, MSG.author],
      ['fEmail', /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email), MSG.email], ['fGenre', !!v.genre, MSG.genre],
      ['fFile', !!v.file, MSG.nofile],
      ['fFile', !v.file || /\.docx$/i.test(v.file.name), MSG.pdf], ['fFile', !v.file || v.file.size <= MAX_BYTES, MSG.big], ['fOwn', v.own, MSG.own]
    ];
    ['fTitle', 'fAuthor', 'fEmail', 'fGenre', 'fFile'].forEach(function (id) { mark(id, false); });
    for (var i = 0; i < rules.length; i++) { if (!rules[i][1]) { mark(rules[i][0], true); $(rules[i][0]).focus(); return { error: rules[i][2] }; } }
    return { v: v };
  }
  function submit(e) {
    e.preventDefault();
    var c = check();
    if (c.error) { say(c.error, 'bad'); return; }
    var v = c.v, btn = $('jnSend');
    btn.disabled = true; say(MSG.uploading);
    var base = { action: 'jrn_submit', title: v.title, author: v.author, email: v.email, genre: v.genre, own: true, website: $('fWeb').value, source: 'website' };
    var go = toBase64(v.file).then(function (b64) { base.file = b64; base.ext = 'docx'; return base; });
    go.then(post).then(function (j) {
      if (j && j.ok) { $('jnForm').reset(); say(MSG.done, 'good'); }
      else if (j && j.error) sayRaw(j.error);
      else say(MSG.fail, 'bad');
    }).catch(function () { say(MSG.net, 'bad'); }).then(function () { btn.disabled = false; });
  }

  /* guidelines fade in one by one as they are scrolled into view; without the observer (or with reduced motion) everything just shows */
  function reveal() {
    var els = document.querySelectorAll('.jn-rv');
    if (!els.length) return;
    var still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!('IntersectionObserver' in window) || still) { for (var i = 0; i < els.length; i++) els[i].classList.add('in'); return; }
    document.documentElement.classList.add('rv');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });
    for (var j = 0; j < els.length; j++) io.observe(els[j]);
  }
  function on(id, ev, fn) { var n = $(id); if (n) n.addEventListener(ev, fn); }
  function init() {
    if ($('jnGenre')) fill($('jnGenre'), GENRES);
    if ($('jnProg')) fill($('jnProg'), PROGRAMMES);
    if ($('fGenre')) fill($('fGenre'), GENRES);
    ['jnQ', 'jnGenre', 'jnProg'].forEach(function (id) { on(id, 'input', render); on(id, 'change', render); });
    on('jnForm', 'submit', submit);
    on('jnClose', 'click', closeReader);
    on('jnReader', 'click', function (e) { if (e.target === $('jnReader')) closeReader(); });
    if ($('jnList')) load();
    reveal();
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
  if (typeof module !== 'undefined' && module.exports) module.exports = { GENRES: GENRES.map(function (g) { return g[0]; }), PROGRAMMES: PROGRAMMES, MAX_BYTES: MAX_BYTES, MAX_TEXT: MAX_TEXT, MIN_TEXT: MIN_TEXT, BIO_MIN: BIO_MIN, BIO_MAX: BIO_MAX, wordCount: wordCount, norm: norm, arabicShare: arabicShare };
})();

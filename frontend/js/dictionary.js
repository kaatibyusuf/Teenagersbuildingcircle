/* Student Dictionary: search, alphabet browsing and topic filter, all in the browser. Entries are in dictionary-data.js. */
(function () {
  var D = window.HS_DICT || [], PAGE = 24;
  var ar = function () { return document.documentElement.lang === 'ar'; };
  var T = {
    all: ['All topics', 'كل المواضيع'], words: ['words', 'كلمة'], word: ['word', 'كلمة'], none: ['No words match. Try fewer letters, or search in English.', 'لا توجد كلمات مطابقة. جرّب أحرفًا أقل، أو ابحث بالإنجليزية.'],
    root: ['Root', 'الجذر'], plural: ['Plural', 'الجمع'], forms: ['Forms', 'الصيغ'], more: ['Show more', 'عرض المزيد'], example: ['Example', 'مثال'],
    n: ['Noun', 'اسم'], v: ['Verb', 'فعل'], adj: ['Adjective', 'صفة'], p: ['Small word', 'حرف / أداة'], showing: ['Showing', 'عرض']
  };
  var TOPIC = { 'Deen': 'الدين', 'School': 'المدرسة', 'Family': 'الأسرة', 'Daily life': 'الحياة اليومية', 'Nature': 'الطبيعة', 'Body': 'الجسم', 'Numbers': 'الأعداد', 'Verbs': 'الأفعال', 'Adjectives': 'الصفات', 'Small words': 'كلمات صغيرة' };
  function t(k) { return T[k][ar() ? 1 : 0]; }
  var HARAKAT = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
  function norm(s) {
    return String(s || '').replace(HARAKAT, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').trim().toLowerCase();
  }
  var LET = 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي'.split(' ');
  D.forEach(function (e) { e._n = norm(e.w); e._l = e._n.charAt(0); e._s = (e._n + ' ' + norm(e.a) + ' ' + e.e.toLowerCase() + ' ' + norm(e.r.replace(/ /g, '')) + ' ' + e.c.toLowerCase()); });
  D.sort(function (a, b) { var i = LET.indexOf(a._l), j = LET.indexOf(b._l); return i - j || (a._n < b._n ? -1 : a._n > b._n ? 1 : 0); });
  var $ = function (id) { return document.getElementById(id); };
  var S = { q: '', letter: '', topic: '', shown: PAGE }, root = $('dcList'); if (!root) return;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function filtered() {
    var q = norm(S.q), q2 = q.length > 3 && q.indexOf('\u0627\u0644') === 0 ? q.slice(2) : q;   // also match without the article al-
    return D.filter(function (e) {
      if (S.letter && e._l !== S.letter) return false;
      if (S.topic && e.c !== S.topic) return false;
      return !q || e._s.indexOf(q) >= 0 || e._s.indexOf(q2) >= 0;
    }).sort(function (a, b) {   // best matches first when searching: starts-with, then contains
      if (!q) return 0;
      var hit = function (e) { return e._n.indexOf(q) === 0 || e._n.indexOf(q2) === 0 || e.e.toLowerCase().indexOf(q) === 0 ? 0 : 1; }; return hit(a) - hit(b);
    });
  }
  function card(e) {
    var meta = '';
    if (e.r) meta += '<span>' + t('root') + ': <b class="ar" dir="rtl">' + esc(e.r) + '</b></span>';
    if (e.f) meta += '<span>' + t(e.t === 'v' ? 'forms' : 'plural') + ': <b class="ar" dir="rtl">' + esc(e.f) + '</b></span>';
    return '<article class="dc-card"><div class="dc-top"><h3 class="dc-w" lang="ar" dir="rtl">' + esc(e.w) + '</h3><div class="dc-tags"><span class="dc-tag">' + t(e.t) + '</span><span class="dc-tag top">' + esc(ar() ? (TOPIC[e.c] || e.c) : e.c) + '</span></div></div>' +
      (meta ? '<div class="dc-meta">' + meta + '</div>' : '') +
      '<p class="dc-en">' + esc(e.e) + '</p>' + (e.a ? '<p class="dc-ar" lang="ar">' + esc(e.a) + '</p>' : '') +
      '<div class="dc-ex"><p class="a" lang="ar" dir="rtl">' + esc(e.x) + '</p><p class="e">' + esc(e.xe) + '</p></div></article>';
  }
  function render() {
    var list = filtered(), part = list.slice(0, S.shown);
    root.innerHTML = part.length ? part.map(card).join('') : '<p class="dc-empty">' + esc(t('none')) + '</p>';
    $('dcCount').textContent = list.length + ' ' + t(list.length === 1 ? 'word' : 'words');
    var more = $('dcMore'); more.hidden = list.length <= S.shown; more.textContent = t('more');
    var has = {}; D.forEach(function (e) { if ((!S.topic || e.c === S.topic)) has[e._l] = 1; });
    Array.prototype.forEach.call($('dcLetters').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.l === S.letter)); b.disabled = !has[b.dataset.l] && b.dataset.l !== S.letter; });
    Array.prototype.forEach.call($('dcChips').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.c === S.topic)); });
  }
  function build() {
    $('dcLetters').innerHTML = LET.map(function (l) { return '<button type="button" data-l="' + l + '" aria-pressed="false">' + l + '</button>'; }).join('');
    var topics = []; D.forEach(function (e) { if (topics.indexOf(e.c) < 0) topics.push(e.c); });
    $('dcChips').innerHTML = ['<button type="button" data-c="" aria-pressed="true">' + esc(t('all')) + '</button>'].concat(topics.map(function (c) { return '<button type="button" data-c="' + esc(c) + '" aria-pressed="false">' + esc(ar() ? (TOPIC[c] || c) : c) + '</button>'; })).join('');
    render();
  }
  $('dcLetters').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b || b.disabled) return; S.letter = S.letter === b.dataset.l ? '' : b.dataset.l; S.shown = PAGE; render(); });
  $('dcChips').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; S.topic = b.dataset.c; S.shown = PAGE; render(); });
  $('dcMore').addEventListener('click', function () { S.shown += PAGE; render(); });
  $('dcQ').addEventListener('input', function () { S.q = this.value; S.letter = ''; S.shown = PAGE; render(); });
  new MutationObserver(function () { build(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  build();
})();

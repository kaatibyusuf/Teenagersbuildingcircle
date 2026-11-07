/* Student Dictionary: search, alphabet browsing and topic filter, all in the browser. Entries are in dictionary-data.js. */
(function () {
  var D = window.HS_DICT || [], PAGE = 24;
  var ar = function () { return document.documentElement.lang === 'ar'; };
  var T = {
    all: ['All topics', 'كل المواضيع'], words: ['words', 'كلمة'], word: ['word', 'كلمة'], none: ['No words match. Try fewer letters, or search in English.', 'لا توجد كلمات مطابقة. جرّب أحرفًا أقل، أو ابحث بالإنجليزية.'],
    root: ['Root', 'الجذر'], plural: ['Plural', 'الجمع'], forms: ['Forms', 'الصيغ'], more: ['Show more', 'عرض المزيد'], example: ['Example', 'مثال'],
    flip: ['Tap the card to see the meaning', 'اضغط على البطاقة لترى المعنى'], know: ['I know it', 'أعرفها'], again: ['Again', 'أعد'], left: ['left', 'متبقية'],
    done: ['Well done! You went through the whole deck.', 'أحسنت! أنهيت كل البطاقات.'], restart: ['Start again', 'ابدأ من جديد'], q: ['What does this word mean?', 'ما معنى هذه الكلمة؟'],
    score: ['Your score', 'نتيجتك'], of: ['of', 'من'], review: ['Words to review', 'كلمات للمراجعة'], next: ['Next', 'التالي'], correct: ['Correct!', 'صحيح!'], wrong: ['Not quite. The answer is', 'ليس تمامًا. الجواب هو'], finish: ['See my score', 'اعرض نتيجتي'], tiny: ['Not enough words in this topic for a quiz. Choose All topics.', 'عدد الكلمات في هذا الموضوع قليل للاختبار. اختر كل المواضيع.'],
    n: ['Noun', 'اسم'], v: ['Verb', 'فعل'], adj: ['Adjective', 'صفة'], p: ['Small word', 'حرف / أداة'], showing: ['Showing', 'عرض'], listen: ['Listen', 'استمع'], syn: ['Synonyms', 'المرادفات'], say: ['Say it', 'انطقها']
  };
  var TOPIC = { 'Deen': 'الدين', 'School': 'المدرسة', 'Family': 'الأسرة', 'Daily life': 'الحياة اليومية', 'Nature': 'الطبيعة', 'Body': 'الجسم', 'Numbers': 'الأعداد', 'Verbs': 'الأفعال', 'Adjectives': 'الصفات', 'Small words': 'كلمات صغيرة', 'Animals': 'الحيوانات', 'Colours': 'الألوان', 'Clothes': 'الملابس', 'Jobs': 'المهن', 'Places': 'الأماكن', 'Time': 'الوقت', 'Health': 'الصحة', 'Feelings': 'المشاعر', 'Food': 'الطعام', 'Home': 'البيت', 'Society': 'المجتمع', 'Science': 'العلوم', 'Math': 'الرياضيات', 'Sports': 'الرياضة', 'Technology': 'التقنية' };
  function t(k) { return T[k][ar() ? 1 : 0]; }

  // Reading help: a rule-based Latin spelling made from the vowel marks (not hand-checked), and the device's own Arabic voice.
  var TR = { 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'ḥ', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 'ṣ', 'ض': 'ḍ', 'ط': 'ṭ', 'ظ': 'ẓ', 'ع': 'ʿ', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'ء': 'ʾ', 'ئ': 'ʾ', 'ؤ': 'ʾ', 'أ': 'ʾ', 'إ': 'ʾ', 'پ': 'p', 'چ': 'ch', 'ڤ': 'v', 'گ': 'g', '؟': '?', '،': ',' };
  var VOW = { 'َ': 'a', 'ُ': 'u', 'ِ': 'i' }, TAN = { 'ً': 1, 'ٌ': 1, 'ٍ': 1 };
  function translit(w) {
    return String(w).replace(/ـ/g, '').split(/\s+/).map(function (word) {
      if (word.replace(/[ً-ْٰ]/g, '') === 'الله') return 'Allāh';
      var items = [], m;
      for (var i = 0; i < word.length; i++) {
        var c = word.charAt(i);
        if (c >= 'ً' && c <= 'ْ' || c === 'ٰ' || c === 'ٓ') { if (items.length) items[items.length - 1].m.push(c); }
        else items.push({ c: c, m: [] });
      }
      var out = '';
      items.forEach(function (it, k) {
        var c = it.c, mk = it.m.join(''), shadda = mk.indexOf('ّ') >= 0, v = '', tan = '', last = k === items.length - 1;
        ['َ', 'ُ', 'ِ'].forEach(function (x) { if (mk.indexOf(x) >= 0) v = VOW[x]; });
        if (mk.indexOf('ً') >= 0 || mk.indexOf('ٌ') >= 0 || mk.indexOf('ٍ') >= 0) tan = 'x';
        var nextBare = k + 1 < items.length && items[k + 1].c === 'ل' && !/[َُِ]/.test(items[k + 1].m.join(''));
        if (c === 'آ') { out += k === 0 ? 'ā' : 'ʾā'; return; }   // alif with madda
        if (c === 'ا' || c === 'ٱ') {                                           // alif
          if (mk.indexOf('ٓ') >= 0) { out += 'ā'; return; }   // alif madda
          if (v) { out += v; return; }                                  // initial alif with its own vowel (no hamza shown)
          if (k === 0) { out += nextBare && items.length > 2 ? 'a' : ''; return; }   // article al-
          if (/a$/.test(out)) out = out.slice(0, -1) + 'ā'; else out += 'ā';
          return;
        }
        if (c === 'ى') { out = /a$/.test(out) ? out.slice(0, -1) + 'ā' : out + 'ā'; return; }   // alif maqsura
        if (c === 'ة') { out += v || !last ? 't' + v : (tan ? '' : 'h'); return; }   // ta marbuta
        if ((c === 'أ' || c === 'إ') && k === 0) { out += v; return; }   // initial hamza on alif
        if (c === 'و' || c === 'ي') {                          // waw / yaa: long vowel or consonant
          var lng = c === 'و' ? 'u' : 'i', cons = c === 'و' ? 'w' : 'y';
          if (!v && !shadda && !tan) { if (out.slice(-1) === lng) { out = out.slice(0, -1) + (c === 'و' ? 'ū' : 'ī'); } else out += cons; return; }
          out += (shadda ? cons + cons : cons) + v; return;
        }
        var r = TR[c];
        if (r === undefined) { out += c; return; }
        out += (shadda ? r + r : r) + v;
      });
      return out;
    }).join(' ');
  }
  function say(text) {
    try {
      var ss = window.speechSynthesis; if (!ss) return;
      ss.cancel();
      var u = new SpeechSynthesisUtterance(text); u.lang = 'ar-SA'; u.rate = 0.8;
      var vs = ss.getVoices ? ss.getVoices() : [];
      for (var i = 0; i < vs.length; i++) if (/^ar/i.test(vs[i].lang)) { u.voice = vs[i]; break; }
      ss.speak(u);
    } catch (e) {}
  }
  var CAN_SAY = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  var SPK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  function sayBtn(text, label) { return CAN_SAY ? '<button type="button" class="dc-say" data-say="' + esc(text) + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + SPK + '</button>' : ''; }

  var HARAKAT = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
  function norm(s) {
    return String(s || '').replace(HARAKAT, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').trim().toLowerCase();
  }
  var LET = 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي'.split(' ');
  D.forEach(function (e) { e._n = norm(e.w); e._l = e._n.charAt(0); e._s = (e._n + ' ' + norm(e.a) + ' ' + e.e.toLowerCase() + ' ' + norm(e.r.replace(/ /g, '')) + ' ' + e.c.toLowerCase() + ' ' + norm(e.s || '')); });
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
    return '<article class="dc-card"><div class="dc-top"><div class="dc-wrap"><h3 class="dc-w" lang="ar" dir="rtl">' + esc(e.w) + '</h3><p class="dc-tr" dir="ltr">' + esc(translit(e.w)) + '</p></div>' + sayBtn(e.w, t('listen')) + '<div class="dc-tags"><span class="dc-tag">' + t(e.t) + '</span><span class="dc-tag top">' + esc(ar() ? (TOPIC[e.c] || e.c) : e.c) + '</span></div></div>' +
      (meta ? '<div class="dc-meta">' + meta + '</div>' : '') +
      '<p class="dc-en">' + esc(e.e) + '</p>' + (e.a ? '<p class="dc-ar" lang="ar">' + esc(e.a) + '</p>' : '') +
      (e.s ? '<p class="dc-syn"><span>' + t('syn') + ':</span> <b class="ar" lang="ar" dir="rtl">' + esc(e.s) + '</b></p>' : '') +
      '<div class="dc-ex"><div class="dc-exa"><p class="a" lang="ar" dir="rtl">' + esc(e.x) + '</p>' + sayBtn(e.x, t('say')) + '</div><p class="e">' + esc(e.xe) + '</p></div></article>';
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

  // ---- Flashcards and quiz ----
  var MODE = 'browse', study = $('dcStudy');
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function pool() { return D.filter(function (e) { return !S.topic || e.c === S.topic; }); }
  var F = null, Q = null;
  function cardsStart() { F = { deck: shuffle(pool()), i: 0, flipped: false, known: 0 }; cardsRender(); }
  function cardsRender() {
    if (!F.deck.length) { study.innerHTML = '<div class="dc-fc"><p class="dc-done">' + esc(t('done')) + '</p><button class="dc-btn" type="button" data-s="restart">' + esc(t('restart')) + '</button></div>'; return; }
    var e = F.deck[0];
    study.innerHTML = '<div class="dc-fc"><p class="dc-prog">' + F.deck.length + ' ' + t('left') + '</p>' +
      '<button type="button" class="dc-flip' + (F.flipped ? ' on' : '') + '" data-s="flip" aria-live="polite">' +
      (F.flipped ? '<span class="dc-en">' + esc(e.e) + '</span>' + (e.a ? '<span class="dc-ar" lang="ar">' + esc(e.a) + '</span>' : '') + '<span class="a" lang="ar" dir="rtl">' + esc(e.x) + '</span><span class="e">' + esc(e.xe) + '</span>'
        : '<span class="dc-w" lang="ar" dir="rtl">' + esc(e.w) + '</span><span class="hint">' + esc(t('flip')) + '</span>') + '</button>' +
      (F.flipped ? '<div class="dc-row"><button class="dc-btn line" type="button" data-s="again">' + esc(t('again')) + '</button><button class="dc-btn" type="button" data-s="know">' + esc(t('know')) + '</button></div>' : '') + '</div>';
  }
  function quizStart() {
    var p = pool(); if (p.length < 6) { study.innerHTML = '<p class="dc-empty">' + esc(t('tiny')) + '</p>'; Q = null; return; }
    var qs = shuffle(p).slice(0, 10).map(function (e) {
      var others = shuffle(D.filter(function (x) { return x !== e && x.e !== e.e && x.t === e.t; }));
      if (others.length < 3) others = shuffle(D.filter(function (x) { return x !== e && x.e !== e.e; }));
      return { e: e, opts: shuffle([e].concat(others.slice(0, 3))) };
    });
    Q = { qs: qs, i: 0, score: 0, picked: null, wrong: [] }; quizRender();
  }
  function quizRender() {
    if (Q.i >= Q.qs.length) {
      study.innerHTML = '<div class="dc-fc"><p class="dc-done">' + esc(t('score')) + ': <b>' + Q.score + ' ' + t('of') + ' ' + Q.qs.length + '</b></p>' +
        (Q.wrong.length ? '<p class="dc-prog">' + esc(t('review')) + '</p><ul class="dc-rev">' + Q.wrong.map(function (e) { return '<li><span lang="ar" dir="rtl">' + esc(e.w) + '</span> ' + esc(e.e) + '</li>'; }).join('') + '</ul>' : '') +
        '<button class="dc-btn" type="button" data-s="qrestart">' + esc(t('restart')) + '</button></div>'; return;
    }
    var q = Q.qs[Q.i], ans = Q.picked != null;
    study.innerHTML = '<div class="dc-fc"><p class="dc-prog">' + (Q.i + 1) + ' ' + t('of') + ' ' + Q.qs.length + '</p><p class="dc-qt">' + esc(t('q')) + '</p><p class="dc-w big" lang="ar" dir="rtl">' + esc(q.e.w) + '</p>' +
      '<div class="dc-opts">' + q.opts.map(function (o, k) {
        var cls = ans ? (o === q.e ? ' ok' : k === Q.picked ? ' bad' : '') : '';
        return '<button type="button" class="dc-opt' + cls + '" data-s="pick" data-k="' + k + '"' + (ans ? ' disabled' : '') + '>' + esc(o.e) + '</button>'; }).join('') + '</div>' +
      (ans ? '<p class="dc-fb">' + (q.opts[Q.picked] === q.e ? esc(t('correct')) : esc(t('wrong')) + ' <b>' + esc(q.e.e) + '</b>') + '</p><div class="dc-ex"><p class="a" lang="ar" dir="rtl">' + esc(q.e.x) + '</p><p class="e">' + esc(q.e.xe) + '</p></div><button class="dc-btn" type="button" data-s="next">' + esc(Q.i + 1 >= Q.qs.length ? t('finish') : t('next')) + '</button>' : '') + '</div>';
  }
  study.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-s]'); if (!b) return; var s = b.dataset.s;
    if (s === 'flip') { F.flipped = !F.flipped; cardsRender(); }
    else if (s === 'know') { F.deck.shift(); F.flipped = false; cardsRender(); }
    else if (s === 'again') { F.deck.push(F.deck.shift()); F.flipped = false; cardsRender(); }
    else if (s === 'restart') cardsStart();
    else if (s === 'pick') { var q = Q.qs[Q.i]; Q.picked = +b.dataset.k; if (q.opts[Q.picked] === q.e) Q.score++; else Q.wrong.push(q.e); quizRender(); }
    else if (s === 'next') { Q.i++; Q.picked = null; quizRender(); }
    else if (s === 'qrestart') quizStart();
  });
  function setMode(m) {
    MODE = m; var browse = m === 'browse';
    ['dcLetters', 'dcCount', 'dcList'].forEach(function (id) { $(id).hidden = !browse; });
    $('dcMore').hidden = !browse || $('dcMore').hidden; study.hidden = browse; document.querySelector('.dc-search').hidden = !browse;
    Array.prototype.forEach.call($('dcModes').children, function (x) { x.setAttribute('aria-pressed', String(x.dataset.mode === m)); });
    if (m === 'browse') render(); else if (m === 'cards') cardsStart(); else quizStart();
  }
  $('dcModes').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) setMode(b.dataset.mode); });
  $('dcLetters').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b || b.disabled) return; S.letter = S.letter === b.dataset.l ? '' : b.dataset.l; S.shown = PAGE; render(); });
  $('dcChips').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; S.topic = b.dataset.c; S.shown = PAGE; render(); if (MODE === 'cards') cardsStart(); else if (MODE === 'quiz') quizStart(); });
  $('dcMore').addEventListener('click', function () { S.shown += PAGE; render(); });
  $('dcQ').addEventListener('input', function () { S.q = this.value; S.letter = ''; S.shown = PAGE; render(); });
  document.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('[data-say]'); if (b) say(b.getAttribute('data-say')); });
  window.HS_translit = translit;
  new MutationObserver(function () { build(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  build();
  if (location.hash === '#cards') setMode('cards'); else if (location.hash === '#quiz') setMode('quiz');
})();

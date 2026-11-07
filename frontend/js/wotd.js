/* Word of the day: the same word all day for everyone, changing at the student's own midnight. Needs js/dictionary-data.js. */
(function () {
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  window.hsWotd = function () {
    var D = (window.HS_DICT || []).filter(function (e) { return e.t !== 'p'; }); if (!D.length) return '';
    var n = new Date(), day = Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 864e5);
    var e = D[(day * 7919) % D.length];
    return '<article class="c w12" id="wotd" style="--i:3"><h2>Word of the day</h2><div class="wotd"><div class="t" translate="no"><p class="dc-en">' + esc(e.e) + '</p>' +
      '<div class="dc-ex"><p class="a" lang="ar" dir="rtl">' + esc(e.x) + '</p><p class="e">' + esc(e.xe) + '</p></div></div><p class="dc-w" lang="ar" dir="rtl" translate="no">' + esc(e.w) + '</p></div>' +
      '<p class="sub"><a href="dictionary#cards" style="color:var(--deep);font-weight:600;text-decoration:underline">Practise with flashcards</a> or look up any word in the Student Dictionary.</p></article>';
  };
})();

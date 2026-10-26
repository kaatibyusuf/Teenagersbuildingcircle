/* Sign-in guard for every portal (student, teacher, tutor, facilitator, admin and owner pages).
   Portals keep the ID and access code in this browser tab so a person can move between pages
   (dashboard, revision tracker, quizzes, library) without typing them again.
   This script forgets them, so the person must enter BOTH the ID and the access code again, when:
     - the page is refreshed,
     - the page is opened directly (typed address, bookmark, or a tab the browser reopened),
     - nobody has used the page for IDLE_MINUTES.
   It must load before the page's own script, so it sits at the top of <head>. */
(function () {
  var KEYS = ['hs', 'ht', 'ha', 'hc', 'hca', 'hct', 'how', 'hcsa', 'hsk', 'hskt', 'hta', 'hf', 'hb', 'hbc'];
  var IDLE_MINUTES = 30, STAMP = 'hs-active';
  try {
    var ss = window.sessionStorage, now = Date.now();
    var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || null;
    var type = nav ? nav.type : (performance.navigation ? ['navigate', 'reload', 'back_forward'][performance.navigation.type] || 'navigate' : 'navigate');
    var fromSite = false;
    try { var r = new URL(document.referrer); fromSite = r.origin === location.origin && r.pathname !== location.pathname; } catch (e) {}
    var last = Number(ss.getItem(STAMP) || 0), fresh = last > 0 && now - last < IDLE_MINUTES * 60000;
    var keep = fresh && (type === 'back_forward' || (type === 'navigate' && fromSite));
    if (!keep) KEYS.forEach(function (k) { ss.removeItem(k); });
    ss.setItem(STAMP, String(now));
    var t = 0;
    ['click', 'keydown', 'touchstart'].forEach(function (ev) {
      window.addEventListener(ev, function () {
        var n = Date.now(); if (n - t < 30000) return; t = n;
        try {
          if (Number(ss.getItem(STAMP) || 0) && n - Number(ss.getItem(STAMP)) >= IDLE_MINUTES * 60000) { KEYS.forEach(function (k) { ss.removeItem(k); }); location.reload(); return; }
          ss.setItem(STAMP, String(n));
        } catch (e) {}
      }, { passive: true, capture: true });
    });
  } catch (e) {}
})();

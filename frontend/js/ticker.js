/* Scrolling notice bar at the top of the public pages.
   To change the notice, edit MESSAGES below. To switch it off, set ON to false.
   Each message is [text, link]; leave the link as '' for plain text. */
(function () {
  var ON = true;
  var MESSAGES = [
    ['Admission is closed for the current Madrasah session.', ''],
    ['Join the waitlist and we will email you when a place opens', 'waitlist.html'],
  ];
  var LABEL = 'Notice';

  if (!ON || !MESSAGES.length) return;
  var me = document.currentScript;
  if (!me) return;
  var esc = function (t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var item = function (m) {
    return m[1]
      ? '<a class="tkr-i" href="' + esc(m[1]) + '">' + esc(m[0]) + ' <span aria-hidden="true">→</span></a>'
      : '<span class="tkr-i">' + esc(m[0]) + '</span>';
  };
  var one = MESSAGES.map(item).join('<span class="tkr-s" aria-hidden="true">✦</span>') + '<span class="tkr-s" aria-hidden="true">✦</span>';
  var group = one + one + one; // long enough to fill wide screens
  var html = '<div class="tkr" role="region" aria-label="' + esc(LABEL) + '">'
    + '<span class="tkr-tag"><i aria-hidden="true"></i>' + esc(LABEL) + '</span>'
    + '<div class="tkr-view"><div class="tkr-track">'
    + '<div class="tkr-g">' + group + '</div>'
    + '<div class="tkr-g" aria-hidden="true">' + group + '</div>'
    + '</div></div></div>';
  me.insertAdjacentHTML('afterend', html);
  document.documentElement.classList.add('has-tkr');
  // links in the hidden copy should not be reachable by keyboard
  var copies = document.querySelectorAll('.tkr-g[aria-hidden="true"] a');
  for (var i = 0; i < copies.length; i++) copies[i].setAttribute('tabindex', '-1');
})();

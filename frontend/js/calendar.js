/* School calendar: the school's own dates (from the sheet) plus public holidays and Islamic occasions. */
(function () {
  var API = 'https://script.google.com/macros/s/AKfycby0AsifBuB_Ad7g1SjDXCipaDU27-BrzYWf67muw5jeY_C0_0uz8AhQYYXdiNRQhvqX/exec';
  var $ = function (id) { return document.getElementById(id); }, list = $('clList'); if (!list) return;
  var ar = function () { return document.documentElement.lang === 'ar'; }, loc = function () { return ar() ? 'ar' : 'en-GB'; };
  var T = {
    all: ['All', 'الكل'], Term: ['Terms', 'الفصول'], Exam: ['Exams', 'الاختبارات'], Holiday: ['Holidays', 'العطل'], Islamic: ['Islamic occasions', 'مناسبات إسلامية'], Event: ['Events', 'فعاليات'], Deadline: ['Deadlines', 'مواعيد نهائية'],
    TermS: ['Term', 'فصل'], ExamS: ['Exam', 'اختبار'], HolidayS: ['Holiday', 'عطلة'], IslamicS: ['Islamic', 'إسلامي'], EventS: ['Event', 'فعالية'], DeadlineS: ['Deadline', 'موعد نهائي'],
    add: ['Add to calendar', 'أضف إلى التقويم'], none: ['Nothing to show for this filter.', 'لا شيء لعرضه.'], past: ['Show past dates', 'عرض التواريخ الماضية'], hidePast: ['Hide past dates', 'إخفاء التواريخ الماضية'],
    to: ['to', 'إلى'], pending: ['Term dates and exam dates will be posted here as soon as they are confirmed.', 'ستُنشر هنا تواريخ الفصول والاختبارات فور اعتمادها.'], progs: ['All programmes', 'كل البرامج']
  };
  function t(k) { return T[k][ar() ? 1 : 0]; }
  var S = { type: 'all', prog: 'All', past: false, events: [], own: 0 };
  var todayIso = (function () { var n = new Date(); return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2); })();
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function dt(iso) { var q = iso.split('-'); return new Date(+q[0], +q[1] - 1, +q[2]); }
  function visible() {
    return S.events.filter(function (e) {
      if (S.type !== 'all' && e.k !== S.type) return false;
      if (S.prog !== 'All' && e.p !== 'All' && e.p !== S.prog) return false;
      return S.past || (e.e || e.d) >= todayIso;
    });
  }
  function render() {
    var ev = visible(), html = '', cur = '';
    ev.forEach(function (e) {
      var d = dt(e.d), mk = e.d.slice(0, 7);
      if (mk !== cur) { html += (cur ? '</div>' : '') + '<h2 class="cl-month">' + esc(d.toLocaleDateString(loc(), { month: 'long', year: 'numeric' })) + '</h2><div class="cl-list">'; cur = mk; }
      var range = e.e ? '<p>' + esc(d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' })) + ' ' + t('to') + ' ' + esc(dt(e.e).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })) + '</p>' : '';
      html += '<div class="cl-item"><div class="cl-date"><b>' + d.getDate() + '</b><span>' + esc(d.toLocaleDateString(loc(), { month: 'short' })) + '</span></div><div class="cl-body"><h3>' + esc(e.t) + '</h3>' + range +
        (e.n ? '<p>' + esc(e.n) + '</p>' : '') + '<div class="cl-tags"><span class="cl-tag ' + e.k + '">' + t(e.k + 'S') + '</span>' + (e.p && e.p !== 'All' ? '<span class="cl-tag">' + esc(e.p) + '</span>' : '') + '</div></div>' +
        '<button type="button" class="cl-add" data-i="' + S.events.indexOf(e) + '">' + t('add') + '</button></div>';
    });
    list.innerHTML = html ? html + '</div>' : '<p class="cl-note">' + esc(t('none')) + '</p>';
    $('clPending').hidden = S.own > 0;
    $('clPast').textContent = t(S.past ? 'hidePast' : 'past');
    Array.prototype.forEach.call($('clChips').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.k === S.type)); });
  }
  function chips() {
    var kinds = ['all', 'Term', 'Exam', 'Holiday', 'Islamic', 'Event', 'Deadline'].filter(function (k) { return k === 'all' || S.events.some(function (e) { return e.k === k; }); });
    $('clChips').innerHTML = kinds.map(function (k) { return '<button type="button" data-k="' + k + '" aria-pressed="false">' + t(k) + '</button>'; }).join('');
    var progs = ['All']; S.events.forEach(function (e) { if (e.p && progs.indexOf(e.p) < 0) progs.push(e.p); });
    var sel = $('clProg'); sel.hidden = progs.length < 2;
    sel.innerHTML = progs.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p === 'All' ? t('progs') : p) + '</option>'; }).join(''); sel.value = S.prog;
  }
  // ---- add to calendar (.ics) ----
  function ymd(iso) { return iso.replace(/-/g, ''); }
  function nextDay(iso) { var d = dt(iso); d.setDate(d.getDate() + 1); return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
  function ics(evs) {
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Himaayah Schools//Calendar//EN', 'CALSCALE:GREGORIAN'];
    evs.forEach(function (e, i) {
      L.push('BEGIN:VEVENT', 'UID:' + ymd(e.d) + '-' + i + '@himaayahschools.com', 'DTSTAMP:' + ymd(todayIso) + 'T000000Z', 'DTSTART;VALUE=DATE:' + ymd(e.d), 'DTEND;VALUE=DATE:' + nextDay(e.e || e.d),
        'SUMMARY:' + e.t.replace(/[\;,]/g, ' ').replace(/\n/g, ' '), 'DESCRIPTION:' + ((e.n || '') + ' (Himaayah Schools)').replace(/[\;,]/g, ' '), 'END:VEVENT');
    });
    L.push('END:VCALENDAR'); return L.join('\r\n');
  }
  function download(name, evs) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics(evs)], { type: 'text/calendar' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  $('clChips').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) { S.type = b.dataset.k; render(); } });
  $('clProg').addEventListener('change', function () { S.prog = this.value; render(); });
  $('clPast').addEventListener('click', function () { S.past = !S.past; render(); });
  $('clAll').addEventListener('click', function () { download('himaayah-calendar.ics', visible()); });
  list.addEventListener('click', function (ev) { var b = ev.target.closest('.cl-add'); if (b) { var e = S.events[+b.dataset.i]; download('himaayah-' + e.d + '.ics', [e]); } });
  function merge(own) {
    S.own = own.length;
    S.events = (window.HS_CAL_BASE || []).concat(own).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.k === 'Term' ? -1 : 1); });
    chips(); render();
  }
  merge([]);
  fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'calendar' }) })
    .then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok && j.events) merge(j.events); }).catch(function () {});
  new MutationObserver(function () { chips(); render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();

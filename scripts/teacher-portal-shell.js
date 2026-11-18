// Gives the teacher portal the same layout as the student portal, and lets any portal replace the dark third summary card.
// Usage: node scripts/teacher-portal-shell.js [path/to/frontend]. Safe to run twice; if a spot is missing it says which and changes that file not at all.
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || path.join(__dirname, '..', 'frontend');
function patch(rel, marker, steps) {
  const file = path.join(dir, rel); let h = fs.readFileSync(file, 'utf8');
  if (h.includes(marker)) { console.log(rel + ': already done, NOT changed'); return true; }
  const miss = [];
  steps.forEach(([a, b, all]) => { const n = h.split(a).length - 1; if (!n || (!all && n !== 1)) miss.push(a.slice(0, 80) + (n ? ' (found ' + n + ' times)' : ' (not found)')); else h = h.split(a).join(b); });
  if (miss.length) { console.error(rel + ' NOT changed. Could not find:\n - ' + miss.join('\n - ')); return false; }
  fs.writeFileSync(file, h); console.log(rel + ': done'); return true;
}
const CFG = `<link rel="stylesheet" href="css/portal-shell.css">
<script>
/* Layout settings for js/portal-shell.js (same menu, top bar and cards as the student portal). */
window.PORTAL_SHELL = {
  programme: 'Teacher portal',
  data: function () { return typeof D === 'undefined' || !D ? null : { student: { Name: D.teacher.Name, StudentID: D.teacher.TeacherID, PaymentStatus: 'Exempt' } }; },
  nav: [
    { label: 'Dashboard', icon: 'home', tab: 'today' },
    { label: 'Recitations', icon: 'mic', tab: 'recitations' },
    { label: 'Students', icon: 'users', tab: 'students' },
    { label: 'Assignments', icon: 'pen', tab: 'assignments' },
    { label: 'Results', icon: 'chart', tab: 'results' },
    { label: 'Exams', icon: 'clip', href: 'exam-teacher' },
    { label: 'Class groups', icon: 'layers', groups: true },
    { label: 'Account', icon: 'key', tab: 'account' }
  ],
  stats: function (d) {
    var st = D.students || [], pre = 0, tot = 0;
    st.forEach(function (s) { pre += Number(s.AttendancePresent) || 0; tot += Number(s.AttendanceTotal) || 0; });
    var n = toMark(), r = recWaiting().length, work = n + r;
    return [
      { label: 'Waiting for you', value: work, valueClass: work ? '' : 'good', lab: 'to mark or hear', alt: { value: st.length, label: 'Students' }, foot: n + ' assignment' + (n === 1 ? '' : 's') + ' \\u00B7 ' + r + ' recitation' + (r === 1 ? '' : 's') },
      { label: 'Class attendance', value: tot ? Math.round(100 * pre / tot) + '%' : 'No data yet', lab: 'Attendance rate', alt: tot ? { value: tot, label: 'Records' } : null, foot: tot ? pre + ' present' : 'Take attendance on the Dashboard.' }
    ];
  },
  third: function (d) {
    var now = Date.now(), next = null, c = 0;
    (D.students || []).forEach(function (s) { var t = s.NextClass ? new Date(s.NextClass).getTime() : NaN; if (!isNaN(t) && t > now) { c++; if (!next || t < next) next = t; } });
    return next ? { label: 'Next class', value: new Date(next).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), lab: new Date(next).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), foot: c + ' student' + (c === 1 ? '' : 's') + ' booked' }
      : { label: 'Next class', value: 'None set', foot: 'Set a time on the Dashboard.' };
  },
  hello: function (d) {
    var n = toMark(), r = recWaiting().length;
    if (!n && !r) return { text: 'Nothing is waiting for you right now, m\\u0101 sh\\u0101\\u02BE All\\u0101h. Check attendance and results when you are ready.' };
    return { text: 'You have ' + (r ? r + ' recitation' + (r === 1 ? '' : 's') + ' to hear' : '') + (r && n ? ' and ' : '') + (n ? n + ' assignment' + (n === 1 ? '' : 's') + ' to mark' : '') + '. Open them from the menu on the left.' };
  }
};
</script>
<script src="js/portal-shell.js" defer></script>
`;
const a = patch('teacher.html', 'PORTAL_SHELL', [
  ['<link rel="stylesheet" href="css/dark.css">\n', '<link rel="stylesheet" href="css/dark.css">\n' + CFG],
  ['<nav class="tabs" role="tablist" aria-label="Sections">', '<nav class="tabs acx-tabs" role="tablist" aria-label="Sections">'],
  ['data-act="tab" data-t="${k}"', 'data-act="tab" data-tab="${k}" data-t="${k}"'],
  ["${k === 'assignments' && n ? ' (' + n + ')' : ''}", "${k === 'assignments' && n ? ' <i>' + n + '</i>' : ''}"],
  ["${k === 'recitations' && recWaiting().length ? ' (' + recWaiting().length + ')' : ''}", "${k === 'recitations' && recWaiting().length ? ' <i>' + recWaiting().length + '</i>' : ''}"]
]);
const b = patch('js/portal-shell.js', 'cfg.third', [
  ["var payCard = { label: 'Next payment',", "var third = null; try { third = cfg.third && cfg.third(d); } catch (e) { third = null; }\n    var payCard = third || { label: 'Next payment',"]
]);
if (!a || !b) process.exit(1);

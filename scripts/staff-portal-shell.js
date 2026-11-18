// Gives the admin and owner dashboards the same layout as the student portal (left menu, top bar, welcome row, summary cards, banner).
// Usage: node scripts/staff-portal-shell.js [path/to/frontend]. Needs the portal-shell.js change from scripts/teacher-portal-shell.js (run that first).
// Each page is changed only if every spot is found; safe to run twice.
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || path.join(__dirname, '..', 'frontend');
const shellJs = path.join(dir, 'js', 'portal-shell.js');
if (!fs.existsSync(shellJs) || !fs.readFileSync(shellJs, 'utf8').includes('cfg.third')) { console.error('js/portal-shell.js does not have the summary-card hook yet. Run node scripts/teacher-portal-shell.js first.'); process.exit(1); }

const ADMIN = `<link rel="stylesheet" href="css/portal-shell.css">
<script>
/* Layout settings for js/portal-shell.js (same menu, top bar and cards as the student portal). */
window.PORTAL_SHELL = {
  programme: 'Admin portal',
  data: function () { return typeof D === 'undefined' || !D ? null : { student: { Name: D.admin.Name, StudentID: D.admin.AdminID, PaymentStatus: 'Exempt' } }; },
  nav: [
    { label: 'Payments', icon: 'card', tab: 'payments' },
    { label: 'Assign students', icon: 'users', tab: 'assign' },
    { label: 'Reset code', icon: 'key', tab: 'reset' },
    { label: 'Account', icon: 'layers', tab: 'account' }
  ],
  stats: function (d) {
    var st = D.students || [], od = st.filter(function (s) { return s.PaymentStatus === 'Overdue'; }).length, paid = st.filter(function (s) { return s.PaymentStatus === 'Paid'; }).length;
    var nt = st.filter(function (s) { return !s.TeacherID; }).length;
    return [
      { label: 'Students', value: st.length, lab: 'enrolled', alt: { value: od, label: 'Overdue' }, foot: paid + ' paid up' },
      { label: 'Needs a teacher', value: nt, valueClass: nt ? '' : 'good', lab: 'students without one', alt: { value: st.filter(function (s) { return !s.Level; }).length, label: 'No level yet' }, foot: nt ? 'Assign them on the Assign tab.' : 'Everyone has a teacher.' }
    ];
  },
  third: function (d) {
    var od = (D.students || []).filter(function (s) { return s.PaymentStatus === 'Overdue'; }).length;
    return { label: 'Overdue fees', value: od, lab: od === 1 ? 'student' : 'students', foot: od ? 'Confirm payments once you have seen the receipt.' : 'Nobody is overdue.' };
  },
  hello: function (d) { return { text: 'Confirm a payment only after you have seen the receipt, and assign new students to a teacher so they are not left waiting.' }; }
};
</script>
<script src="js/portal-shell.js" defer></script>
`;
const OWNER = `<link rel="stylesheet" href="css/portal-shell.css">
<script>
/* Layout settings for js/portal-shell.js (same menu, top bar and cards as the student portal). */
window.PORTAL_SHELL = {
  programme: 'Owner dashboard',
  data: function () { return typeof D === 'undefined' || !D ? null : { student: { Name: (D.me && D.me.Name) || 'Owner', StudentID: (D.me && (D.me.OwnerID || D.me.ID)) || '', PaymentStatus: 'Exempt' } }; },
  nav: [
    { label: 'Overview', icon: 'home', tab: 'overview' },
    { label: 'Fees', icon: 'card', tab: 'fees' },
    { label: 'Placement tests', icon: 'clip', tab: 'placement' },
    { label: 'Referrals', icon: 'star', tab: 'referrals' },
    { label: 'Staff pay', icon: 'pen', tab: 'pay' },
    { label: 'Sponsors', icon: 'users', tab: 'sponsors' },
    { label: 'Stories', icon: 'book', tab: 'stories' },
    { label: 'Growth', icon: 'chart', tab: 'growth' },
    { label: 'Reset code', icon: 'key', tab: 'reset' },
    { label: 'Account', icon: 'layers', tab: 'account' },
    { label: 'Refresh figures', icon: 'out', tab: 'refresh' }
  ],
  stats: function (d) {
    var k = D.kpi || {}, m = Number(k.moneyMonth) || 0;
    var short = m >= 1e6 ? '\u20A6' + Math.round(m / 1e4) / 100 + 'M' : m >= 1e4 ? '\u20A6' + Math.round(m / 100) / 10 + 'k' : naira(m);   // short form so it fits beside the second figure
    return [
      { label: 'Fees this month', value: short, valueClass: 'good', lab: 'collected', alt: { value: k.enrolMonth || 0, label: 'New enrolments' }, foot: 'Confirmed payments only' },
      { label: 'Active students', value: k.active || 0, lab: 'across all programmes', alt: { value: k.paidUp || 0, label: 'Paid up' }, foot: (k.overdue || 0) + ' overdue' }
    ];
  },
  third: function (d) {
    var k = D.kpi || {};
    return { label: 'Fees overdue', value: naira(k.overdueAmount), lab: (k.overdue || 0) + (k.overdue === 1 ? ' student' : ' students'), foot: k.overdue ? 'Their portals are locked until they pay.' : 'Nobody is overdue.' };
  },
  hello: function (d) { return { text: 'Your figures come straight from the school sheet. Open Needs your attention on the Overview to see what is waiting for you.' }; }
};
</script>
<script src="js/portal-shell.js" defer></script>
`;
function patch(rel, cfg, steps) {
  const file = path.join(dir, rel);
  if (!fs.existsSync(file)) { console.log(rel + ': not found, skipped'); return; }
  let h = fs.readFileSync(file, 'utf8');
  if (h.includes('PORTAL_SHELL')) { console.log(rel + ': already done, NOT changed'); return; }
  const miss = [];
  const swap = (a, b) => { if (h.split(a).length !== 2) { miss.push(a.slice(0, 80)); return; } h = h.replace(a, () => b); };
  swap('<link rel="stylesheet" href="css/dark.css">\n', '<link rel="stylesheet" href="css/dark.css">\n' + cfg);
  swap('<nav class="tabs" role="tablist" aria-label="Sections">', '<nav class="tabs acx-tabs" role="tablist" aria-label="Sections">');
  steps.forEach(([a, b]) => swap(a, b));
  if (miss.length) { console.error(rel + ' NOT changed. Could not find:\n - ' + miss.join('\n - ')); return; }
  fs.writeFileSync(file, h); console.log(rel + ': portal layout added');
}
patch('admin.html', ADMIN, [['data-act="tab" data-t="${k}"', 'data-act="tab" data-tab="${k}" data-t="${k}"']]);
patch('owner.html', OWNER, [['data-act="tab" data-t="${t}"', 'data-act="tab" data-tab="${t}" data-t="${t}"'], ['<button class="btn btn-line btn-sm" type="button" data-act="refresh">', '<button class="btn btn-line btn-sm" type="button" data-act="refresh" data-tab="refresh">']]);

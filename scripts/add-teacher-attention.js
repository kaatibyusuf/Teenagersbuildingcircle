// Adds a "Needs attention" card to the Today tab of the teacher portal: students with repeated absences, low attendance, overdue
// assignments, no recent recitation, or (admins only) an overdue fee. Usage: node scripts/add-teacher-attention.js [path/to/teacher.html]. Safe to run twice.
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'frontend', 'teacher.html');
let h = fs.readFileSync(file, 'utf8');
if (h.includes('data-attention')) { console.log('teacher.html: already has the attention card, NOT changed'); process.exit(0); }
const miss = [];
function swap(a, b) { if (h.split(a).length !== 2) { miss.push(a.slice(0, 70)); return; } h = h.replace(a, () => b); }
const FN = `/* Students who need a word from their teacher: worked out in the browser from the data already on the page. */
function attention() {
  const admin = D.teacher.Role === 'Admin', day = (s) => Math.floor(Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000), t0 = day(D.today);
  const recs = D.recordings || [], out = [];
  D.students.forEach((s) => {
    const why = []; let w = 0;
    const att = (D.attendance || []).filter((a) => a.StudentID === s.StudentID).sort((a, b) => (a.Date < b.Date ? 1 : -1));
    if (att.length >= 3 && att.slice(0, 3).every((a) => a.Status === 'Absent')) { why.push('Absent from the last 3 classes'); w += 4; }
    else if (att.length >= 2 && att.slice(0, 2).every((a) => a.Status === 'Absent')) { why.push('Absent twice in a row'); w += 2; }
    const tot = Number(s.AttendanceTotal) || 0, pre = Number(s.AttendancePresent) || 0;
    if (tot >= 5 && pre / tot < 0.7) { why.push('Attendance ' + Math.round(100 * pre / tot) + '%'); w += 2; }
    let od = 0; D.assignments.forEach((a) => a.Rows.forEach((r) => { if (r.StudentID === s.StudentID && r.Status === 'Overdue') od++; }));
    if (od) { why.push(od + ' overdue assignment' + (od === 1 ? '' : 's')); w += Math.min(od, 3); }
    if (recs.length && !recs.some((r) => r.StudentID === s.StudentID && t0 - day(r.Submitted) <= 14)) { why.push('No recitation sent in 14 days'); w += 1; }
    if (admin && String(s.PaymentStatus || '').toLowerCase() === 'overdue') { why.push('Fee overdue'); w += 2; }
    if (why.length) out.push({ s, why, w });
  });
  return out.sort((a, b) => b.w - a.w || String(a.s.Name).localeCompare(String(b.s.Name)));
}
function attentionCard() {
  const list = attention(); if (!D.students.length) return '';
  if (!list.length) return \`<article class="c w12" data-attention><h2>Needs attention</h2><p class="sub">Nobody needs a nudge right now, m\\u0101 sh\\u0101\\u02BE All\\u0101h.</p></article>\`;
  return \`<article class="c w12" data-attention><h2>Needs attention <span class="sub">\${list.length} of \${D.students.length}</span></h2>
    <ul class="list">\${list.slice(0, 8).map((x) => \`<li><span><b>\${esc(x.s.Name)}</b><br><span class="sub">\${x.why.map(esc).join(' \\u00B7 ')}</span></span><button class="btn btn-line btn-sm" type="button" data-act="goStu" data-id="\${esc(x.s.StudentID)}">Open</button></li>\`).join('')}</ul>
    \${list.length > 8 ? \`<p class="sub">And \${list.length - 8} more. See the Students tab.</p>\` : ''}</article>\`;
}
function vToday() {`;
swap('function vToday() {', FN);
swap('<article class="c w8"><h2>Attendance</h2>', '${attentionCard()}\n  <article class="c w8"><h2>Attendance</h2>');
swap("else if (a === 'goMark') {", "else if (a === 'goStu') { S.tab = 'students'; S.openStu[b.dataset.id] = true; render(); const el = [...document.querySelectorAll('.stu')].find((x) => x.dataset.id === b.dataset.id); if (el) el.scrollIntoView({ block: 'center' }); }\n  else if (a === 'goMark') {");
if (miss.length) { console.error('teacher.html NOT changed. Could not find:\n - ' + miss.join('\n - ')); process.exit(1); }
fs.writeFileSync(file, h);
console.log('teacher.html: attention card added');

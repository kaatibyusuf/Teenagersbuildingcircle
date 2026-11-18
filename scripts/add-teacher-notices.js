// Adds a "Notices" card to the top of the teacher portal home. Safe to run twice. Usage: node scripts/add-teacher-notices.js [path/to/teacher.html]
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'frontend', 'teacher.html');
let h = fs.readFileSync(file, 'utf8');
if (h.includes('data-notices')) { console.log('teacher.html: already has notices, NOT changed'); process.exit(0); }
const anchor = '<article class="c w8"><h2>Attendance</h2>';
if (h.split(anchor).length !== 2) { console.error('teacher.html NOT changed: could not find the Attendance card exactly once.'); process.exit(1); }
const card = '${(D.notices || []).length ? `<article class="c w12" data-notices><h2>Notices</h2><ul class="list">${D.notices.map((a) => `<li style="display:block"><b>${esc(a.Title)}</b> <span style="float:inline-end">${esc(a.Date)}</span><div class="sub">${esc(a.Body)}</div></li>`).join(\'\')}</ul></article>` : \'\'}\n  ';
h = h.replace(anchor, card + anchor);
fs.writeFileSync(file, h);
console.log('teacher.html: notices card added');

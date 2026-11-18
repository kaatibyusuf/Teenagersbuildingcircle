// Makes the Madrasah, TBC, Skills and Academy portals show a "Fee due, Pay now" screen when the school server says the student's fee is overdue.
// Usage: node scripts/add-fee-lock.js [path/to/frontend]. Each page is changed only if every spot is found; safe to run twice.
// Needs js/fee-lock.js (in the zip). Safe to deploy before the Apps Script update: until then the server never sends the locked answer.
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || path.join(__dirname, '..', 'frontend');
const GUARD = 'if (d && d.locked) { feeLocked(d); return; }';
const PAGES = [
  ['dashboard.html', 'function render(d) {'], ['tbc-dashboard.html', 'function render(d) {'], ['skills-dashboard.html', 'function render(d) {'], ['academy-dashboard.html', null]
];
if (!fs.existsSync(path.join(dir, 'js', 'fee-lock.js'))) console.error('js/fee-lock.js is missing from ' + dir + '. Copy it from the zip first.');
PAGES.forEach(([f, rend]) => {
  const file = path.join(dir, f);
  if (!fs.existsSync(file)) { console.log(f + ': not found, skipped'); return; }
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes('feeLocked(')) { console.log(f + ': already done, NOT changed'); return; }
  const miss = [];
  const swap = (label, a, b) => { if (s.split(a).length !== 2) { miss.push(label); return; } s = s.replace(a, () => b); };
  swap('show()', 'function show(data, id, code) {\n', 'function show(data, id, code) {\n  if (data && data.locked) { feeLocked(data); return; }\n');
  if (rend) swap('render()', rend, rend + '\n  ' + GUARD);
  swap('</head>', '</head>', '<script src="js/fee-lock.js"></script>\n</head>');
  if (miss.length) { console.error(f + ' NOT changed. Could not place: ' + miss.join(', ') + '. Send me the current file and I will fit it.'); return; }
  fs.writeFileSync(file, s); console.log(f + ': fee lock screen added');
});

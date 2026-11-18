// Shows the personal note (written by ProgrammeNotes.gs) at the top of the TBC, Skills and Academy student portals.
// Usage: node scripts/add-programme-notes.js [path/to/frontend]. Each page is changed only if every spot is found; safe to run twice.
// The note appears only when the server sends one, so this is safe to deploy before the Apps Script update.
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || path.join(__dirname, '..', 'frontend');
const CARD = `/* A personal note from the school, written from the student's own record (ProgrammeNotes.gs). Shown only when the server sends one. */
function noteCard(d) {
  const n = d.note; if (!n || !Array.isArray(n.paragraphs) || !n.paragraphs.length) return '';
  return \`<article class="c w12 note" id="note" style="--i:0"><h2>\${esc(n.title || 'A note for you')}</h2>
    <p class="note-hi">\${esc(n.greeting || '')}</p>
    \${n.paragraphs.map((t) => \`<p>\${esc(t)}</p>\`).join('')}
    \${n.focus ? \`<div class="mark note-focus"><div class="k">This week</div><b>\${esc(n.focus)}</b></div>\` : ''}
    \${n.closing ? \`<p class="sub note-end">\${esc(n.closing)}</p>\` : ''}
  </article>\`;
}
`;
const STYLE = '<style>.note p { margin: 0 0 12px; line-height: 1.75; max-width: 72ch; } .note .note-hi { font-weight: 700; color: var(--deep); } .note .note-focus { margin: 4px 0 14px; } .note .note-focus b { display: block; margin-top: 2px; font-size: 16px; font-weight: 600; line-height: 1.5; } .note .note-end { margin: 0; }</style>\n</head>';
const PAGES = [
  ['tbc-dashboard.html', 'function render(d) {', '<div class="grid">\n    <article class="c" id="next"', '<div class="grid">\n    ${noteCard(d)}\n    <article class="c" id="next"'],
  ['skills-dashboard.html', 'function render(d) {', '<div class="grid">\n    <article class="c" id="course"', '<div class="grid">\n    ${noteCard(d)}\n    <article class="c" id="course"'],
  ['academy-dashboard.html', 'function vOverview(d) {', '<div class="grid">\n    <article class="c w12" id="perf"', '<div class="grid">\n    ${noteCard(d)}\n    <article class="c w12" id="perf"']
];
PAGES.forEach(([f, fnAnchor, gridFrom, gridTo]) => {
  const file = path.join(dir, f);
  if (!fs.existsSync(file)) { console.log(f + ': not found, skipped'); return; }
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes('function noteCard')) { console.log(f + ': already done, NOT changed'); return; }
  const miss = [];
  const swap = (label, a, b) => { if (s.split(a).length !== 2) { miss.push(label); return; } s = s.replace(a, () => b); };
  swap('function', fnAnchor, CARD + fnAnchor);
  swap('first card', gridFrom, gridTo);
  swap('</head>', '</head>', STYLE);
  if (miss.length) { console.error(f + ' NOT changed. Could not place: ' + miss.join(', ') + '. Send me the current file and I will fit it.'); return; }
  fs.writeFileSync(file, s); console.log(f + ': the note now appears at the top of the portal.');
});

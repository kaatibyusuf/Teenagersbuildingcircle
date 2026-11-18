#!/usr/bin/env node
'use strict';
/* Shows the personal note (written by StudentNote.gs from the student's own record) at the top of the Madrasah student portal.
   Run from the project root:  node scripts/add-student-note.js
   The page is changed only if every spot is found; otherwise it is left untouched and the script names the missing spot. Safe to run twice.
   The note is only shown when the server sends one, so this is safe to deploy before the Apps Script update. */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'frontend', 'dashboard.html');
if (!fs.existsSync(file)) { console.log('dashboard.html not found.'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (s.includes('function noteCard')) { console.log('dashboard.html: already done.'); process.exit(0); }
const missing = [];
const swap = (label, from, to) => { if (s.split(from).length !== 2) return missing.push(label); s = s.replace(from, () => to); };

swap('card function', 'function recCard(d) {', `/* A personal note from the school, written from the student's own record (StudentNote.gs). Shown only when the server sends one. */
function noteCard(d) {
  const n = d.note; if (!n || !Array.isArray(n.paragraphs) || !n.paragraphs.length) return '';
  return \`<article class="c w12 note" id="note" style="--i:0"><h2>\${esc(n.title || 'A note for you')}</h2>
    <p class="note-hi">\${esc(n.greeting || '')}</p>
    \${n.paragraphs.map((t) => \`<p>\${esc(t)}</p>\`).join('')}
    \${n.focus ? \`<div class="mark note-focus"><div class="k">This week</div><b>\${esc(n.focus)}</b></div>\` : ''}
    \${n.closing ? \`<p class="sub note-end">\${esc(n.closing)}</p>\` : ''}
  </article>\`;
}
if (window.HS_I18N && HS_I18N.add) HS_I18N.add({ 'A note for you': 'رسالة لك', 'This week': 'هذا الأسبوع' });
function recCard(d) {`);
swap('grid', '<div class="grid">\n    <article class="c" id="next"', '<div class="grid">\n    ${noteCard(d)}\n    <article class="c" id="next"');
swap('style', '</head>', '<style>.note p { margin: 0 0 12px; line-height: 1.75; max-width: 72ch; } .note .note-hi { font-weight: 700; color: var(--deep); } .note .note-focus { margin: 4px 0 14px; } .note .note-focus b { display: block; margin-top: 2px; font-size: 16px; font-weight: 600; line-height: 1.5; } .note .note-end { margin: 0; }</style>\n</head>');
if (missing.length) { console.log('dashboard.html NOT changed. Could not place: ' + missing.join(', ') + '. Send me the current file and I will fit it.'); process.exit(0); }
fs.writeFileSync(file, s);
console.log('dashboard.html: the student note now appears at the top of the portal.');

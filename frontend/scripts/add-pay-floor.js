#!/usr/bin/env node
/* Shows the new minimum monthly pay on the owner page's Staff pay tab.
   Run from the project folder:  node scripts/add-pay-floor.js
   Safe to run twice. If a spot is missing the file is left untouched and the script says which one. */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'frontend', 'owner.html');
let html = fs.readFileSync(file, 'utf8');
const edits = [
  { name: 'staff line', done: "(s.Floor ? ' · minimum pay applies' : '')",
    from: "plural(s.Count, 'student') + ' × ' + naira(s.Rate)}</small>", to: "plural(s.Count, 'student') + ' × ' + naira(s.Rate) + (s.Floor ? ' · minimum pay applies' : '')}</small>" },
  { name: 'explanation line', done: 'P.floor ?',
    from: "${naira(P.rate)} for every active student assigned to a teacher or tutor. ", to: "${naira(P.rate)} for every active student assigned to a teacher or tutor.${P.floor ? ' Anyone with at least one student is paid at least ' + naira(P.floor) + ' a month.' : ''} " }
];
const missing = edits.filter((e) => !html.includes(e.done) && !html.includes(e.from));
if (missing.length) { console.error('Nothing changed. Could not find the ' + missing.map((e) => e.name).join(' and ') + ' in frontend/owner.html (the page may differ from the one this script expects).'); process.exit(1); }
let n = 0;
edits.forEach((e) => { if (!html.includes(e.done)) { html = html.replace(e.from, e.to); n++; } });
if (n) { fs.writeFileSync(file, html); console.log('Updated frontend/owner.html (' + n + ' change' + (n === 1 ? '' : 's') + ').'); } else console.log('Already up to date.');

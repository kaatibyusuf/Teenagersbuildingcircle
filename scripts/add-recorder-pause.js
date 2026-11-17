#!/usr/bin/env node
'use strict';
/* Adds Pause and Resume to the recitation recorder on the student portal (dashboard.html), so a student can stop to
   breathe, answer the door or check a page, and carry on in the same recording. Pauses are not counted in the time.
   The screen is also kept awake while recording, and leaving the page mid-recording asks for confirmation.
   Run from the project root:  node scripts/add-recorder-pause.js
   The page is changed only if every spot is found; otherwise it is left untouched and the script names the missing spot. Safe to run twice. */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'frontend', 'dashboard.html');
if (!fs.existsSync(file)) { console.log('dashboard.html not found.'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (s.includes('function recPause')) { console.log('dashboard.html: already done.'); process.exit(0); }
const missing = [];
const swap = (label, from, to) => { if (s.split(from).length !== 2) return missing.push(label); s = s.replace(from, () => to); };

swap('recorder state', "mr: null, stream: null, t0: 0, tick: null,", "mr: null, stream: null, t0: 0, acc: 0, paused: false, wl: null, tick: null,");
swap('live panel',
  '<span class="sub">Recording… up to ${maxMin} minutes</span>\n    <button type="button" class="btn btn-ink" data-rec="stop">Stop</button></div>`;',
  '<span class="sub">${REC.paused ? \'Paused. Press Resume when you are ready to carry on.\' : \'Recording… up to \' + maxMin + \' minutes\'}</span>\n' +
  '    ${typeof REC.mr.pause === \'function\' ? `<button type="button" class="btn btn-line" data-rec="${REC.paused ? \'resume\' : \'pause\'}">${REC.paused ? \'Resume\' : \'Pause\'}</button>` : \'\'}\n' +
  '    <button type="button" class="btn btn-ink" data-rec="stop">Stop</button></div>`;');
swap('live clock', '<b id="recTime">${mmss((Date.now() - REC.t0) / 1000)}</b>', '<b id="recTime">${mmss(recElapsed())}</b>');
swap('live panel class', 'if (REC.mr) return `<div class="rec-live">', 'if (REC.mr) return `<div class="rec-live${REC.paused ? \' paused\' : \'\'}">');
swap('tip text', 'Up to ${maxMin} minutes.</p></div>`;', 'Up to ${maxMin} minutes. You can pause and carry on.</p></div>`;');
swap('stop handler', "const secs = Math.round((Date.now() - REC.t0) / 1000); REC.mr = null; REC.stream = null;",
  "if (!REC.paused) REC.acc += Date.now() - REC.t0; const secs = Math.round(REC.acc / 1000); REC.paused = false; recWake(false); REC.mr = null; REC.stream = null;");
swap('start', "REC.mr = mr; REC.stream = stream; REC.t0 = Date.now(); mr.start(1000);", "REC.mr = mr; REC.stream = stream; REC.t0 = Date.now(); REC.acc = 0; REC.paused = false; mr.start(1000); recWake(true);");
swap('timer', "const s = (Date.now() - REC.t0) / 1000, el = $('recTime');", "const s = recElapsed(), el = $('recTime');");
swap('click', "  else if (k === 'stop') { if (REC.mr) REC.mr.stop(); }", "  else if (k === 'stop') { if (REC.mr) REC.mr.stop(); }\n  else if (k === 'pause') recPause();\n  else if (k === 'resume') recResume();");
swap('functions', "function recFile(input) {", `const recElapsed = () => (REC.acc + (REC.paused || !REC.mr ? 0 : Date.now() - REC.t0)) / 1000;
/* keep the screen on while recording so a long recitation is not cut off when the phone dims */
function recWake(on) {
  try {
    if (!on) { if (REC.wl) REC.wl.release(); REC.wl = null; return; }
    if (navigator.wakeLock && !REC.wl) navigator.wakeLock.request('screen').then((l) => { REC.wl = l; }).catch(() => {});
  } catch (e) {}
}
function recPause() {
  if (!REC.mr || REC.paused || REC.mr.state !== 'recording') return;
  REC.mr.pause(); REC.acc += Date.now() - REC.t0; REC.paused = true; recWake(false); recMount();
}
function recResume() {
  if (!REC.mr || !REC.paused) return;
  REC.mr.resume(); REC.t0 = Date.now(); REC.paused = false; recWake(true); recMount();
}
window.addEventListener('beforeunload', (e) => { if (REC.mr) { e.preventDefault(); e.returnValue = ''; } });
if (window.HS_I18N && HS_I18N.add) HS_I18N.add({
  'Pause': 'إيقاف مؤقت', 'Resume': 'متابعة',
  'Paused. Press Resume when you are ready to carry on.': 'التسجيل متوقف مؤقتًا. اضغط «متابعة» عندما تكون مستعدًا.',
  'You can pause and carry on.': 'يمكنك الإيقاف المؤقت ثم المتابعة.'
});
function recFile(input) {`);
swap('style', '</head>', '<style>.rec-live.paused .rec-dot { animation: none; background: #9A7B3F; box-shadow: 0 0 0 3px rgba(154,123,63,.25); }</style>\n</head>');
if (missing.length) { console.log('dashboard.html NOT changed. Could not place: ' + missing.join(', ') + '. Send me the current file and I will fit it.'); process.exit(0); }
fs.writeFileSync(file, s);
console.log('dashboard.html: the recorder now has Pause and Resume.');

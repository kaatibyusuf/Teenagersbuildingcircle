// Bootcamp lessons link to the Telegram group (or to a ḥadīth's own post) instead of playing recordings in the page.
// Usage: node scripts/bootcamp-telegram.js [path/to/bootcamp.html]. Safe to run twice; if a spot is missing it names it and changes nothing.
// Recordings added in the sheet still play on the page as before. The link itself is set in Bootcamp.gs (BC_TELEGRAM_URL).
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'frontend', 'bootcamp.html');
let h = fs.readFileSync(file, 'utf8');
if (h.includes('function tgBlock')) { console.log('bootcamp.html: already done, NOT changed'); process.exit(0); }
const miss = [];
function swap(a, b) { if (h.split(a).length !== 2) { miss.push(a.slice(0, 80)); return; } h = h.replace(a, () => b); }
swap("${x.recordings ? '' : '<span class=\"bc-na\">Audio soon</span>'}", "${x.recordings || s.telegram ? '' : '<span class=\"bc-na\">Audio soon</span>'}");
swap("'<p class=\"sub\">The recording for this ḥadīth is being added. You can still read it and take the quiz.</p>'}", "(x.telegram ? tgBlock(x) : '<p class=\"sub\">The recording for this ḥadīth is being added. You can still read it and take the quiz.</p>')}");
swap("${x.recordings.length ? `<button class=\"btn ${x.listened ? 'btn-line' : 'btn-ink'}\" type=\"button\" id=\"heard\"", "${x.recordings.length || x.telegram ? `<button class=\"btn ${x.listened ? 'btn-line' : 'btn-ink'}\" type=\"button\" id=\"heard\"");
swap('function lesson() {', `/* The lesson recordings are in the Bootcamp Telegram group. The server sends the link only to signed-in members. */
function tgBlock(x) {
  const t = x.telegram, ok = t && /^https:\\/\\/(t|telegram)\\.me\\//i.test(t.url || '');
  if (!ok) return '';
  return \`<div class="bc-rec"><b>Listen on Telegram</b><p class="sub" style="margin:0 0 12px">\${t.post ? 'This link opens the recording for this \\u1E25ad\\u012Bth in the Bootcamp Telegram group.' : 'The recordings are in the Bootcamp Telegram group. Open it, find \\u1E25ad\\u012Bth ' + x.n + ', listen, then come back here to take the quiz.'}</p><a class="btn btn-ink" href="\${esc(t.url)}" target="_blank" rel="noopener noreferrer">Open Telegram</a></div>\`;
}
function lesson() {`);
if (miss.length) { console.error('bootcamp.html NOT changed. Could not find:\n - ' + miss.join('\n - ')); process.exit(1); }
fs.writeFileSync(file, h);
console.log('bootcamp.html: lessons now link to Telegram');

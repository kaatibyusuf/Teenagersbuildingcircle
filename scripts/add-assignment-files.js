#!/usr/bin/env node
'use strict';
/* Lets students hand in an assignment as a photo, a Word document or a PDF, on the Madrasah portal (dashboard.html)
   and the Teenagers Building Circle portal (tbc-dashboard.html).
   Run from the project root:  node scripts/add-assignment-files.js
   Each page is changed only if every spot is found; otherwise it is left untouched and the script says which spot is missing.
   Safe to run twice. The new files js/assign-upload.js and backend/AssignmentFiles.gs must be in place too. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'frontend');

const FILE_FIELD = (id) => `        <label for="f-${id}">File (optional): a photo, Word document or PDF, up to 7 MB</label>
        <input id="f-${id}" name="file" type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,.docx,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
`;

function patch(name, action) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return console.log(name + ': not found, skipped.');
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes('js/assign-upload.js')) return console.log(name + ': already done.');
  const missing = [];
  const swap = (label, from, to) => {
    if (typeof from === 'string') { if (s.split(from).length !== 2) return missing.push(label); s = s.replace(from, () => to); }
    else { const m = s.match(from); if (!m) return missing.push(label); s = s.replace(from, () => to(m)); }
  };
  swap('script tag', '<script src="js/i18n.js"></script>', '<script src="js/i18n.js"></script>\n<script src="js/assign-upload.js"></script>');
  swap('link input', /(        <input id="l-\$\{esc\(a\.AssignmentID\)\}" name="link" type="url"[^\n]*\n)/, (m) => m[1] + FILE_FIELD('${esc(a.AssignmentID)}'));
  swap('empty check', "  if (!note && !link) return bad('Add a note or a link to your work.');",
    "  const pick = f.elements.file && f.elements.file.files[0] || null;\n  if (!note && !link && !pick) return bad('Add a note, a file or a link to your work.');");
  swap('send call', "    const d = await api(saved.id, saved.code, '" + action + "', { assignmentId: id, note, link });",
    "    let up = {};\n    if (pick) { msg.textContent = 'Reading your file…'; try { up = await HS_UPLOAD.read(pick); } catch (er) { btn.disabled = false; btn.textContent = label; return bad(er.message); } msg.textContent = ''; }\n" +
    "    const d = await api(saved.id, saved.code, '" + action + "', Object.assign({ assignmentId: id, note, link }, up));");
  if (missing.length) return console.log(name + ': NOT changed. Could not place: ' + missing.join(', ') + '. Send me the current file and I will fit it.');
  s = s.replace(">Your link</a>", ">Your file or link</a>").replace("Link: p.link || '', Score", "Link: p.link || (p.file ? 'https://example.com/your-file' : ''), Score");
  fs.writeFileSync(file, s);
  console.log(name + ': students can now upload a photo, Word document or PDF.');
}
patch('dashboard.html', 'submit');
patch('tbc-dashboard.html', 'tbc_submit');

/**
 * Himaayah Literary Journal · المجلة الأدبية (journal.html)
 *
 * Anyone can send in Arabic poems, short stories, essays, reflections, translations or research. The writer
 * uploads ONE Word .docx file: the work first, then the heading "About the writer" and a short bio about their character. Nothing is pasted.
 * The server reads the text out of the file so the work can be read on the page.
 * Nothing appears on the site until staff open the "Journal" tab of the sheet and set Status to Approved. Use Accepted for
 * work chosen for the issue but not yet released (it stays hidden), and Rejected to decline. Approved work is read on the page itself,
 * right to left. If a Word file was attached, approving the piece also shares that one file as "anyone with the link
 * can view". Hidden and Rejected pieces are never listed. (If you reject something that was already approved,
 * also stop sharing its file in Drive.)
 *
 * Staff get an email for each new submission. The public list refreshes about every 10 minutes.
 * Email addresses are never shown on the website.
 */

const JR_TAB = 'Journal';
const JR_HEAD = ['ID', 'Submitted', 'Title', 'Author', 'Programme', 'StudentID', 'Email', 'Genre', 'Text', 'Bio', 'Year', 'FileID', 'FileName', 'SizeKB', 'Status', 'Featured', 'Shared', 'Source'];
const JR_TEXTS = ['ID', 'Submitted', 'Title', 'Author', 'StudentID', 'Email', 'Text', 'Bio', 'FileID', 'FileName'];
const JR_PROGRAMMES = ['Madrasah', 'Academy', 'Skills School', 'Teenagers Building Circle', 'Alumni', 'Guest'];
const JR_GENRES = ['Poem', 'Short story', 'Essay', 'Reflection', 'Translation', 'Research paper'];
const JR_CELL_MAX = 45000;   // a sheet cell holds at most 50,000 characters; the full document stays in Drive
const JR_MIN_TEXT = 40;
const JR_MAX_BYTES = 7 * 1024 * 1024;
const JR_BIO_MIN = 200;   // the bio is exactly 200 words
const JR_BIO_MAX = 200;
const JR_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const JR_FOLDER_NAME = 'Himaayah Journal submissions';

function jr_t_() {
  const ss = ss_();
  let sh = ss.getSheetByName(JR_TAB);
  if (!sh) { sh = ss.insertSheet(JR_TAB); sh.getRange(1, 1, 1, JR_HEAD.length).setValues([JR_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  else {
    const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    JR_HEAD.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h).setFontWeight('bold'); } });
  }
  return table_(JR_TAB);
}
/* one line of text: no control characters, single spaces */
function jr_line_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‎‏‪-‮]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, n); }
/* the work itself: keeps line breaks (they matter in a poem), trims runaway blank lines */
function jr_body_(v) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
}
/* the bio: one paragraph, counted in words */
function jr_bio_(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f‎‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000); }
function jr_words_(s) { return s ? s.split(' ').filter(Boolean).length : 0; }
function jr_err_(msg) { return { ok: false, error: msg }; }
function jr_yes_(v) { return /^(yes|true)$/i.test(String(v)); }
function jr_arabicShare_(s) {
  const ar = (s.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g) || []).length, la = (s.match(/[A-Za-z]/g) || []).length;
  return ar + la === 0 ? 0 : ar / (ar + la);
}
function jr_folder_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('JR_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const found = DriveApp.getFoldersByName(JR_FOLDER_NAME);
  const f = found.hasNext() ? found.next() : DriveApp.createFolder(JR_FOLDER_NAME);
  props.setProperty('JR_FOLDER_ID', f.getId());
  return f;
}
function jr_excerpt_(text) {
  const lines = String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 6);
  let out = lines.join('\n');
  if (out.length > 280) out = out.slice(0, 280).replace(/\s+\S*$/, '') + '…';
  return out;
}

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function journalFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (a === 'jrn_list') return jr_list_();
    if (a === 'jrn_get') return jr_get_(p);
    if (a === 'jrn_submit') return jr_submit_(p);
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    console.error(err);
    return jr_err_('Something went wrong. Please try again.');
  }
}

function jr_approved_() {
  let t = null;
  try { t = jr_t_(); } catch (e) { return { t: null, rows: [] }; }
  return { t: t, rows: t.rows.filter(function (r) { return String(r.Status) === 'Approved' && String(r.Title || '').trim() && String(r.Text || '').trim(); }) };
}

/* ===== PUBLIC LIST: approved work only, with a short excerpt ===== */
function jr_list_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('jrn_list');
  if (hit) return JSON.parse(hit);
  const list = jr_approved_().rows.sort(function (a, b) {
    const fa = jr_yes_(a.Featured) ? 1 : 0, fb = jr_yes_(b.Featured) ? 1 : 0;
    return fb - fa || (iso_(a.Submitted, true) < iso_(b.Submitted, true) ? 1 : -1);
  }).slice(0, 300).map(function (r) {
    return { ID: String(r.ID), Title: String(r.Title), Author: String(r.Author || ''), Programme: String(r.Programme || ''), Genre: String(r.Genre || ''), Year: Number(r.Year) || 0,
             Excerpt: jr_excerpt_(r.Text), Featured: jr_yes_(r.Featured), HasFile: !!String(r.FileID || '').trim() };
  });
  const out = { ok: true, works: list };
  try { cache.put('jrn_list', JSON.stringify(out), 600); } catch (e) {}
  return out;
}

/* ===== ONE WORK, in full (approved only) ===== */
function jr_get_(p) {
  const id = String(p.id || '').trim().toUpperCase();
  if (!/^JR-[A-Z0-9]{6}$/.test(id)) return jr_err_('We could not find that piece.');
  const found = jr_approved_(), r = found.rows.filter(function (x) { return String(x.ID).toUpperCase() === id; })[0];
  if (!r) return jr_err_('We could not find that piece.');
  let url = '';
  if (String(r.FileID || '').trim()) {
    if (!jr_yes_(r.Shared)) {
      try { DriveApp.getFileById(String(r.FileID)).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); put_(found.t, r._row, 'Shared', 'Yes'); } catch (e) { console.error(e); }
    }
    url = 'https://drive.google.com/file/d/' + String(r.FileID).trim() + '/view';
  }
  return { ok: true, work: { ID: String(r.ID), Title: String(r.Title), Author: String(r.Author || ''), Programme: String(r.Programme || ''), Genre: String(r.Genre || ''), Year: Number(r.Year) || 0,
                             Text: String(r.Text), Bio: String(r.Bio || ''), FileUrl: url } };
}

/* ===== READING THE WORD FILE =====
   The writer uploads one .docx: the work first, then a heading "About the writer" and a bio. Nothing is pasted. */
const JR_BIO_HEADINGS = ['about the writer', 'about the author', 'about me', 'عن الكاتب', 'عن الكاتبة', 'نبذة عن الكاتب', 'نبذة عن الكاتبة', 'نبذة عني'];
function jr_xmlText_(s) {
  return String(s).replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(Number(n)); })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
/* one string per paragraph of word/document.xml; empty paragraphs are kept (they are the stanza breaks) */
function jr_docParas_(xml) {
  const out = [], re = /<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(xml))) {
    const p = m[0].replace(/<w:tab\s*\/>/g, '<w:t>\t</w:t>').replace(/<w:br\b[^>]*\/>/g, '<w:t>\n</w:t>');
    let t = '', r = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, x;
    while ((x = r.exec(p))) t += x[1];
    out.push(jr_xmlText_(t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim());
  }
  return out;
}
function jr_isBioHeading_(line) {
  const t = String(line || '').replace(/[:：.\-–—·|\/*_#]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!t || t.length > 40) return false;
  return JR_BIO_HEADINGS.some(function (h) { return t.indexOf(h) >= 0; });
}
function jr_split_(paras) {
  let at = -1;
  for (let i = paras.length - 1; i >= 0; i--) { if (jr_isBioHeading_(paras[i])) { at = i; break; } }
  if (at < 0) return { found: false, work: [], bio: [] };
  return { found: true, work: paras.slice(0, at), bio: paras.slice(at + 1).filter(Boolean) };
}

/* ===== SUBMIT ===== */
function jr_submit_(p) {
  if (String(p.website || '').trim()) return { ok: true };   // honeypot
  const d = {
    title: jr_line_(p.title, 120), author: jr_line_(p.author, 80), email: jr_line_(p.email, 120).toLowerCase(), studentId: key_(p.studentId).slice(0, 20),
    programme: JR_PROGRAMMES.indexOf(String(p.programme)) >= 0 ? String(p.programme) : 'Guest', genre: JR_GENRES.indexOf(String(p.genre)) >= 0 ? String(p.genre) : '',
    source: jr_line_(p.source, 30)
  };
  if (d.title.length < 3) return jr_err_('Enter the title of your work.');
  if (d.author.length < 2) return jr_err_('Enter your name as it should appear.');
  if (!validEmail_(d.email)) return jr_err_('Enter a valid email address. We use it to contact you and never show it.');
  if (!d.genre) return jr_err_('Choose the type of work.');
  if (!p.own) return jr_err_('Please confirm this is your own work and that we may publish it.');

  const data = String(p.file || '');
  if (!data) return jr_err_('Attach your work as a Word document (.docx).');
  const ext = jr_line_(p.ext, 6).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ext !== 'docx') return jr_err_('The attachment must be a Word document (.docx).');
  if (!/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 200))) return jr_err_('The file did not arrive. Please try again.');
  let bytes = null;
  try { bytes = Utilities.base64Decode(data); } catch (e) { return jr_err_('The file did not arrive. Please try again.'); }
  if (bytes.length < 1000) return jr_err_('That file looks empty.');
  if (bytes.length > JR_MAX_BYTES) return jr_err_('That file is too large. The limit is 7 MB.');
  if ((bytes[0] & 255) !== 0x50 || (bytes[1] & 255) !== 0x4B || (bytes[2] & 255) !== 3 || (bytes[3] & 255) !== 4) return jr_err_('That is not a real Word document.');
  let xml = '';
  try {
    const hit = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', 'check.zip')).filter(function (b) { return b.getName() === 'word/document.xml'; })[0];
    if (hit) xml = hit.getDataAsString('UTF-8');
  } catch (e) { xml = ''; }
  if (!xml) return jr_err_('That is not a real Word document.');

  const parts = jr_split_(jr_docParas_(xml));
  if (!parts.found) return jr_err_('Add the heading "About the writer" before your bio, as in the template.');
  const work = jr_body_(parts.work.join('\n')), bio = jr_bio_(parts.bio.join(' '));
  if (work.length < JR_MIN_TEXT) return jr_err_('We could not find your work above the "About the writer" heading (at least 40 characters).');
  if (jr_arabicShare_(work) < (d.genre === 'Translation' ? 0.2 : 0.5)) return jr_err_('The work must be written in Arabic.');
  const bw = jr_words_(bio);
  if (bw !== JR_BIO_MIN) return jr_err_('Your bio must be exactly 200 words.');
  d.text = work.slice(0, JR_CELL_MAX); d.bio = bio;

  const cache = CacheService.getScriptCache(), k = 'jrn_' + d.email, n = Number(cache.get(k) || 0);
  if (n >= 3) return jr_err_('You have sent several already today. Please try again tomorrow.');
  cache.put(k, String(n + 1), 86400);

  const id = 'JR-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  const fileName = id + ' - ' + (d.author.replace(/[^\w؀-ۿ\- ]+/g, ' ').trim().slice(0, 30) || 'Author') + '.docx';
  const f = jr_folder_().createFile(Utilities.newBlob(bytes, JR_DOCX_MIME, fileName));
  f.setDescription(d.title + ' / ' + d.author);
  const fileId = f.getId();
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    append_(jr_t_(), { ID: id, Submitted: iso_(new Date(), true), Title: d.title, Author: d.author, Programme: d.programme, StudentID: d.studentId, Email: d.email, Genre: d.genre, Text: d.text, Bio: d.bio,
      Year: Number(iso_(new Date()).slice(0, 4)), FileID: fileId, FileName: fileName, SizeKB: Math.round(bytes.length / 1024), Status: 'New', Featured: '', Shared: '', Source: d.source || 'website' }, JR_TEXTS);
  } finally { lock.releaseLock(); }
  try {
    if (MailApp.getRemainingDailyQuota() > 0) MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': new journal submission, ' + d.title,
      body: d.author + ' (' + d.programme + ') sent: ' + d.genre + '\n\n' + d.title + '\n\n' + jr_excerpt_(d.text) + '\n\nWord document: https://drive.google.com/file/d/' + fileId + '/view (private until you approve it)\n' +
            'Contact: ' + d.email + '\n\nOpen the "Journal" tab of the sheet (ID ' + id + '). Read it first for language, accuracy and the school\'s Sunni standards. Set Status to Accepted to keep it for the issue without showing it yet, Rejected to decline it, or Approved to publish it on the site now.' });
  } catch (e) { console.error(e); }
  return { ok: true, id: id };
}

/**
 * Himaayah Literary Journal · المجلة الأدبية (journal.html)
 *
 * Anyone can send in Arabic poems, short stories, essays, reflections, translations or research. The writer
 * pastes the full text (and may attach a PDF for longer work). Nothing appears on the site until staff open the
 * "Journal" tab of the sheet and change Status from New to Approved. Approved work is read on the page itself,
 * right to left. If a PDF was attached, approving the piece also shares that one file as "anyone with the link
 * can view". Hidden and Rejected pieces are never listed. (If you reject something that was already approved,
 * also stop sharing its PDF in Drive.)
 *
 * Staff get an email for each new submission. The public list refreshes about every 10 minutes.
 * Email addresses are never shown on the website.
 */

const JR_TAB = 'Journal';
const JR_HEAD = ['ID', 'Submitted', 'Title', 'Author', 'Programme', 'StudentID', 'Email', 'Genre', 'Text', 'Bio', 'Year', 'FileID', 'FileName', 'SizeKB', 'Status', 'Featured', 'Shared', 'Source'];
const JR_TEXTS = ['ID', 'Submitted', 'Title', 'Author', 'StudentID', 'Email', 'Text', 'Bio', 'FileID', 'FileName'];
const JR_PROGRAMMES = ['Madrasah', 'Academy', 'Skills School', 'Teenagers Building Circle', 'Alumni', 'Guest'];
const JR_GENRES = ['Poem', 'Short story', 'Essay', 'Reflection', 'Translation', 'Research paper'];
const JR_MAX_TEXT = 20000;
const JR_MIN_TEXT = 40;
const JR_MAX_BYTES = 7 * 1024 * 1024;
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

/* ===== SUBMIT ===== */
function jr_submit_(p) {
  if (String(p.website || '').trim()) return { ok: true };   // honeypot
  const d = {
    title: jr_line_(p.title, 120), author: jr_line_(p.author, 80), email: jr_line_(p.email, 120).toLowerCase(), bio: jr_line_(p.bio, 200), studentId: key_(p.studentId).slice(0, 20),
    programme: JR_PROGRAMMES.indexOf(String(p.programme)) >= 0 ? String(p.programme) : '', genre: JR_GENRES.indexOf(String(p.genre)) >= 0 ? String(p.genre) : '',
    text: jr_body_(p.text), source: jr_line_(p.source, 30)
  };
  if (d.title.length < 3) return jr_err_('Enter the title of your work.');
  if (d.author.length < 2) return jr_err_('Enter your name as it should appear.');
  if (!validEmail_(d.email)) return jr_err_('Enter a valid email address. We use it to contact you and never show it.');
  if (!d.programme) return jr_err_('Choose your programme, or Guest.');
  if (!d.genre) return jr_err_('Choose the type of work.');
  if (d.text.length < JR_MIN_TEXT) return jr_err_('Paste your full text (at least 40 characters).');
  if (d.text.length > JR_MAX_TEXT) return jr_err_('The text is over the 20,000 character limit. Attach a PDF for longer work.');
  if (jr_arabicShare_(d.text) < (d.genre === 'Translation' ? 0.2 : 0.5)) return jr_err_('The work must be written in Arabic.');
  if (!p.own) return jr_err_('Please confirm this is your own work and that we may publish it.');

  let bytes = null, ext = '';
  const data = String(p.file || '');
  if (data) {
    ext = jr_line_(p.ext, 6).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ext !== 'pdf') return jr_err_('The attachment must be a PDF.');
    if (!/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 200))) return jr_err_('The file did not arrive. Please try again.');
    try { bytes = Utilities.base64Decode(data); } catch (e) { return jr_err_('The file did not arrive. Please try again.'); }
    if (bytes.length < 1000) return jr_err_('That file looks empty.');
    if (bytes.length > JR_MAX_BYTES) return jr_err_('That file is too large. The limit is 7 MB.');
    if ((bytes[0] & 255) !== 0x25 || (bytes[1] & 255) !== 0x50 || (bytes[2] & 255) !== 0x44 || (bytes[3] & 255) !== 0x46) return jr_err_('That is not a real PDF file.');
  }

  const cache = CacheService.getScriptCache(), k = 'jrn_' + d.email, n = Number(cache.get(k) || 0);
  if (n >= 3) return jr_err_('You have sent several already today. Please try again tomorrow.');
  cache.put(k, String(n + 1), 86400);

  const id = 'JR-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  let fileId = '', fileName = '';
  if (bytes) {
    fileName = id + ' - ' + (d.author.replace(/[^\w؀-ۿ\- ]+/g, ' ').trim().slice(0, 30) || 'Author') + '.pdf';
    const f = jr_folder_().createFile(Utilities.newBlob(bytes, 'application/pdf', fileName));
    f.setDescription(d.title + ' / ' + d.author);
    fileId = f.getId();
  }
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    append_(jr_t_(), { ID: id, Submitted: iso_(new Date(), true), Title: d.title, Author: d.author, Programme: d.programme, StudentID: d.studentId, Email: d.email, Genre: d.genre, Text: d.text, Bio: d.bio,
      Year: Number(iso_(new Date()).slice(0, 4)), FileID: fileId, FileName: fileName, SizeKB: bytes ? Math.round(bytes.length / 1024) : '', Status: 'New', Featured: '', Shared: '', Source: d.source || 'website' }, JR_TEXTS);
  } finally { lock.releaseLock(); }
  try {
    if (MailApp.getRemainingDailyQuota() > 0) MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': new journal submission, ' + d.title,
      body: d.author + ' (' + d.programme + ') sent: ' + d.genre + '\n\n' + d.title + '\n\n' + jr_excerpt_(d.text) + '\n\n' + (fileId ? 'PDF: https://drive.google.com/file/d/' + fileId + '/view (private until you approve it)\n' : '') +
            'Contact: ' + d.email + '\n\nTo publish it, open the "Journal" tab of the sheet and change Status from New to Approved (ID ' + id + '). Read it first for language, accuracy and the school\'s Sunni standards.' });
  } catch (e) { console.error(e); }
  return { ok: true, id: id };
}

/**
 * Assignment files: a student can hand in a photo, a Word document or a PDF instead of (or as well as) a note and a link.
 * Add this as a NEW file next to Code.gs. Every name starts with "af" or "AF_", so it cannot clash.
 *
 * submit_ (Code.gs) calls af_save_ when the request carries a file. The file is checked, saved in a private Drive folder
 * (one sub-folder per student), shared so that anyone holding the link can view it, and the link is stored in the
 * submission's Link column. That is the same column teachers already read, so the teacher pages need no change.
 */
const AF_FOLDER_NAME = 'Himaayah Assignment submissions';
const AF_MAX_BYTES = 7 * 1024 * 1024;
const AF_MAX_PER_DAY = 12;
const AF_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif'
};

function af_folder_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('AF_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const found = DriveApp.getFoldersByName(AF_FOLDER_NAME);
  const f = found.hasNext() ? found.next() : DriveApp.createFolder(AF_FOLDER_NAME);
  props.setProperty('AF_FOLDER_ID', f.getId());
  return f;
}
function af_studentFolder_(sid) {
  const root = af_folder_(), it = root.getFoldersByName(sid);
  return it.hasNext() ? it.next() : root.createFolder(sid);
}
function af_b_(bytes, i) { return bytes[i] & 255; }
/* does the start of the file match what its extension claims? */
function af_looksLike_(ext, b) {
  const at = function (i) { return af_b_(b, i); };
  if (ext === 'pdf') return at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46;
  if (ext === 'docx') return at(0) === 0x50 && at(1) === 0x4B && at(2) === 3 && at(3) === 4;
  if (ext === 'jpg' || ext === 'jpeg') return at(0) === 0xFF && at(1) === 0xD8 && at(2) === 0xFF;
  if (ext === 'png') return at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4E && at(3) === 0x47;
  if (ext === 'webp') return at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50;
  if (ext === 'heic' || ext === 'heif') return at(4) === 0x66 && at(5) === 0x74 && at(6) === 0x79 && at(7) === 0x70;   // "ftyp"
  return false;
}
function af_docxOk_(bytes) {
  try {
    return Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', 'check.zip')).some(function (x) { return x.getName() === 'word/document.xml'; });
  } catch (e) { return false; }
}

/* Returns { ok: true, link } or { ok: false, error }. */
function af_save_(st, aid, p) {
  const data = String(p.file || '');
  const ext = String(p.ext || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
  if (!AF_TYPES[ext]) return { ok: false, error: 'Send a photo (.jpg, .png, .webp), a Word document (.docx) or a PDF.' };
  if (!data || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 200))) return { ok: false, error: 'The file did not arrive. Please try again.' };
  let bytes;
  try { bytes = Utilities.base64Decode(data); } catch (e) { return { ok: false, error: 'The file did not arrive. Please try again.' }; }
  if (bytes.length < 200) return { ok: false, error: 'That file looks empty.' };
  if (bytes.length > AF_MAX_BYTES) return { ok: false, error: 'That file is too large. The limit is ' + Math.round(AF_MAX_BYTES / 1048576) + ' MB.' };
  if (!af_looksLike_(ext, bytes)) return { ok: false, error: 'That file is not a real ' + (ext === 'docx' ? 'Word document' : ext === 'pdf' ? 'PDF' : 'photo') + '.' };
  if (ext === 'docx' && !af_docxOk_(bytes)) return { ok: false, error: 'That is not a real Word document.' };

  const sid = String(st.StudentID).trim(), cache = CacheService.getScriptCache(), k = 'af_' + key_(sid), n = Number(cache.get(k) || 0);
  if (n >= AF_MAX_PER_DAY) return { ok: false, error: 'You have sent many files today. Please try again tomorrow.' };
  cache.put(k, String(n + 1), 86400);

  const base = String(p.fname || '').replace(/\.[^.]*$/, '').replace(/[^\w؀-ۿ\- ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'work';
  const name = String(aid) + ' ' + sid + ' ' + base + '.' + ext;
  const file = af_studentFolder_(sid).createFile(Utilities.newBlob(bytes, AF_TYPES[ext], name));
  file.setDescription((st.Name || sid) + ' / ' + aid);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { console.error(e); }
  return { ok: true, link: 'https://drive.google.com/file/d/' + file.getId() + '/view' };
}

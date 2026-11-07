/**
 * Himaayah Recitation Recordings (Recordings.gs)
 *
 * Add this as a NEW file next to Code.gs and Teacher.gs. Every name starts with "rec" or "REC_", so it cannot clash.
 * Uses Code.gs helpers (ss_, table_, put_, append_, iso_, today_, key_) and Teacher.gs helpers (tchOne_, tchMine_, tchAdmin_,
 * tchFail_, tchClean_, tchNum_, tchEnsure_).
 *
 * What it does
 *   Madrasah students (all plans: Hifdh, One-Year Hifdh, Full Madrasah, Muraajah) record (or upload) a recitation from their dashboard.
 *   The audio is saved in a private Google Drive folder (one sub-folder per student). Nobody outside the school account can open it:
 *   the dashboards fetch the audio through this script after checking the ID and access code.
 *   Teachers listen in the teacher dashboard and give a score (memorisation /10, tajwid /10, fluency /5), Pass or Repeat, and a comment.
 *   A pass on a new lesson can also move the student's "current surah and ayah" forward.
 *
 * Setup (once): run setupRecordings from the editor and approve the Google Drive permission. See SETUP-RECORDINGS.md.
 */

/* ===== SETTINGS ===== */
const REC_TAB = 'Recordings';
const REC_HEADERS = ['RecID', 'StudentID', 'Submitted', 'Type', 'Surah', 'FromAyah', 'ToAyah', 'Portion', 'Note', 'FileID', 'Mime', 'SizeKB', 'Seconds',
  'Memorisation', 'Tajwid', 'Fluency', 'Result', 'Feedback', 'MarkedBy', 'Marked'];
const REC_FOLDER_NAME = 'Himaayah Recitations';        // created in the school Google Drive by setupRecordings
const REC_MAX_BYTES = 15 * 1024 * 1024;               // largest file a student can send (15 MB is about an hour of browser recording)
const REC_MAX_SECONDS = 20 * 60;                       // longest recording the dashboard allows (20 minutes)
const REC_MAX_PER_DAY = 6;                             // submissions per student per day
const REC_MAX_WAITING = 5;                             // unmarked recordings a student can have at once
const REC_TYPES = ['New lesson', 'Revision', 'Test'];
const REC_RESULTS = ['Pass', 'Repeat'];
const REC_ALL_MADRASAH = true;                              // true: every Madrasah student gets the card. false: only the plans or levels below
const REC_PLANS = /hif[dzẓ]|tahf[iīe]|mur[aā]+ja|revision/i;   // used when REC_ALL_MADRASAH is false (Hifdh, Hifz, Tahfeez, Muraajah, Muraja'ah...)
const REC_NOT_MADRASAH = /teenagers|building circle|\btbc\b|academy|skills school/i;   // Students-tab rows that are not Madrasah (e.g. Circle students)
const REC_SCALE = { Memorisation: 10, Tajwid: 10, Fluency: 5 };
const REC_MIMES = { webm: 'audio/webm', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', amr: 'audio/amr', '3gp': 'audio/3gpp' };

/* ===== SETUP: run once from the editor ===== */
function setupRecordings() {
  tchEnsure_(ss_(), REC_TAB, REC_HEADERS);
  const folder = rec_folder_();
  try { ss_().toast('Recordings are ready. Audio is saved in Drive: ' + folder.getName(), SCHOOL_NAME); } catch (e) {}
}

/* ===== CHECK: run from the editor if the card does not show on a student's dashboard =====
   View > Logs (or Execution log) shows, for every active student, whether they get the card and why. */
function checkRecordings() {
  const out = [];
  out.push('Recordings tab: ' + (ss_().getSheetByName(REC_TAB) ? 'yes' : 'NO (run setupRecordings)'));
  try { const f = rec_folder_(); out.push('Drive folder: ' + f.getName()); } catch (e) { out.push('Drive folder: NOT READY (' + e.message + '). Run setupRecordings and allow Drive.'); }
  const t = table_('Students'), ok = [], no = [];
  t.rows.forEach(function (st) {
    if (!st.StudentID || key_(st.Active) === 'FALSE') return;
    const line = String(st.StudentID).trim() + ' · ' + st.Name + ' · Plan: "' + st.Plan + '" · Level: "' + st.Level + '"';
    (rec_eligible_(st) ? ok : no).push(line);
  });
  out.push('', 'GET THE CARD (' + ok.length + '):'); out.push.apply(out, ok);
  out.push('', 'DO NOT GET THE CARD (' + no.length + '). These look like Circle, Academy or Skills students (see REC_NOT_MADRASAH), or REC_ALL_MADRASAH is false:'); out.push.apply(out, no);
  const first = t.rows.filter(function (st) { return st.StudentID && rec_eligible_(st); })[0];
  if (first) {
    const pl = payload_(first);
    out.push('', 'Code.gs sends recordings to the dashboard: ' + (pl.recordings && pl.recordings.enabled ? 'yes' : 'NO (paste the new Code.gs)'));
  }
  out.push('', 'If everything above says yes, the website is still using an old deployment: Deploy > Manage deployments > edit > New version > Deploy.');
  console.log(out.join('\n'));
  return out.join('\n');
}

/* ===== HELPERS ===== */
function rec_eligible_(st) {
  const both = String(st.Plan || '') + ' ' + String(st.Level || '');
  if (REC_NOT_MADRASAH.test(both)) return false;
  return REC_ALL_MADRASAH || REC_PLANS.test(both);
}
function rec_table_() {
  if (!ss_().getSheetByName(REC_TAB)) tchEnsure_(ss_(), REC_TAB, REC_HEADERS);
  return table_(REC_TAB);
}
function rec_folder_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('REC_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const found = DriveApp.getFoldersByName(REC_FOLDER_NAME);
  const f = found.hasNext() ? found.next() : DriveApp.createFolder(REC_FOLDER_NAME);
  props.setProperty('REC_FOLDER_ID', f.getId());
  return f;
}
function rec_studentFolder_(sid) {
  const root = rec_folder_(), it = root.getFoldersByName(sid);
  return it.hasNext() ? it.next() : root.createFolder(sid);
}
function rec_num_(v) { return v === '' || v == null ? null : Number(v); }
function rec_portion_(surah, from, to) {
  return surah + (from ? ' ' + from + (to && to !== from ? '–' + to : '') : '');
}
function rec_total_(r) {
  let got = 0, out = 0;
  Object.keys(REC_SCALE).forEach(function (k) { const n = rec_num_(r[k]); if (n !== null && isFinite(n)) { got += n; out += REC_SCALE[k]; } });
  return out ? { Score: got, OutOf: out } : null;
}
function rec_view_(r, withName) {
  const marked = !!String(r.Result || '').trim();
  const o = {
    RecID: String(r.RecID), StudentID: String(r.StudentID).trim(), Submitted: iso_(r.Submitted, true), Type: String(r.Type || ''),
    Surah: String(r.Surah || ''), FromAyah: rec_num_(r.FromAyah), ToAyah: rec_num_(r.ToAyah), Portion: String(r.Portion || ''), Note: String(r.Note || ''),
    Seconds: Number(r.Seconds) || 0, SizeKB: Number(r.SizeKB) || 0, Status: marked ? 'Marked' : 'Waiting',
    Memorisation: rec_num_(r.Memorisation), Tajwid: rec_num_(r.Tajwid), Fluency: rec_num_(r.Fluency), Total: marked ? rec_total_(r) : null,
    Result: String(r.Result || ''), Feedback: String(r.Feedback || ''), Marked: iso_(r.Marked, true)
  };
  if (withName) o.Name = withName;
  return o;
}
function rec_newest_(a, b) { return String(a.Submitted) < String(b.Submitted) ? 1 : -1; }

/* ===== WHAT THE STUDENT SEES (added to the dashboard payload in Code.gs) ===== */
function rec_forStudent_(st) {
  if (!rec_eligible_(st) || !ss_().getSheetByName(REC_TAB)) return { enabled: rec_eligible_(st), items: [] };
  const id = key_(st.StudentID);
  return { enabled: true, maxSeconds: REC_MAX_SECONDS, maxMB: REC_MAX_BYTES / 1048576,
    items: table_(REC_TAB).rows.filter(function (r) { return r.RecID && key_(r.StudentID) === id; }).map(function (r) { return rec_view_(r); }).sort(rec_newest_).slice(0, 30) };
}

/* ===== STUDENT SENDS A RECORDING ===== */
function rec_submit_(st, p) {
  if (!rec_eligible_(st)) return { ok: false, error: 'Recordings are for Madrasah students.' };
  const type = String(p.type || ''), surah = tchClean_(p.surah, 60), note = tchClean_(p.note, 500);
  if (REC_TYPES.indexOf(type) < 0) return { ok: false, error: 'Choose what you are reciting.' };
  if (!surah) return { ok: false, error: 'Choose the surah.' };
  const from = tchNum_(p.fromAyah), to = tchNum_(p.toAyah);
  const okAyah = function (n) { return isNaN(n) || (n >= 1 && n <= 286 && Math.floor(n) === n); };
  if (!okAyah(from) || !okAyah(to)) return { ok: false, error: 'Ayah numbers must be whole numbers from 1 to 286.' };
  if (!isNaN(from) && !isNaN(to) && to < from) return { ok: false, error: 'The last ayah cannot come before the first.' };
  const data = String(p.audio || ''), ext = tchClean_(p.ext, 6).toLowerCase().replace(/[^a-z0-9]/g, '');
  let mime = tchClean_(p.mime, 60).toLowerCase().split(';')[0];
  if (!/^audio\//.test(mime)) mime = REC_MIMES[ext] || (mime === 'video/webm' ? 'audio/webm' : mime === 'video/mp4' ? 'audio/mp4' : '');
  if (!mime) return { ok: false, error: 'Please send an audio file (for example a voice note or an .mp3, .m4a or .ogg file).' };
  if (!data || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 200))) return { ok: false, error: 'The recording did not arrive. Please try again.' };
  let bytes;
  try { bytes = Utilities.base64Decode(data); } catch (e) { return { ok: false, error: 'The recording did not arrive. Please try again.' }; }
  if (bytes.length < 2000) return { ok: false, error: 'That recording is too short.' };
  if (bytes.length > REC_MAX_BYTES) return { ok: false, error: 'That file is too large. The limit is ' + Math.round(REC_MAX_BYTES / 1048576) + ' MB.' };
  const secs = Math.max(0, Math.min(REC_MAX_SECONDS + 60, Math.round(Number(p.seconds) || 0)));

  const id = key_(st.StudentID), t = rec_table_(), today = today_();
  const mine = t.rows.filter(function (r) { return r.RecID && key_(r.StudentID) === id; });
  if (mine.filter(function (r) { return iso_(r.Submitted) === today; }).length >= REC_MAX_PER_DAY) return { ok: false, error: 'You can send up to ' + REC_MAX_PER_DAY + ' recordings a day. Please try again tomorrow.' };
  if (mine.filter(function (r) { return !String(r.Result || '').trim(); }).length >= REC_MAX_WAITING) return { ok: false, error: 'You have ' + REC_MAX_WAITING + ' recordings waiting for your teacher. Please wait for them to be marked.' };

  const recId = 'R-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  const portion = rec_portion_(surah, isNaN(from) ? '' : from, isNaN(to) ? '' : to);
  const fname = String(st.StudentID).trim() + ' ' + today + ' ' + portion.replace(/[^\w؀-ۿ\- ]+/g, '-') + ' ' + recId + '.' + (Object.keys(REC_MIMES).filter(function (k) { return REC_MIMES[k] === mime; })[0] || 'audio');
  const file = rec_studentFolder_(String(st.StudentID).trim()).createFile(Utilities.newBlob(bytes, mime, fname));
  file.setDescription(st.Name + ' · ' + type + ' · ' + portion);

  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    append_(rec_table_(), {
      RecID: recId, StudentID: String(st.StudentID).trim(), Submitted: new Date(), Type: type, Surah: surah, FromAyah: isNaN(from) ? '' : from, ToAyah: isNaN(to) ? '' : to,
      Portion: portion, Note: note, FileID: file.getId(), Mime: mime, SizeKB: Math.round(bytes.length / 1024), Seconds: secs
    }, ['Surah', 'Portion', 'Note', 'FileID']);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/* A student withdraws a recording that has not been marked yet (the file goes to the Drive bin) */
function rec_withdraw_(st, p) {
  const t = rec_table_(), rid = tchClean_(p.recId, 20);
  const r = t.rows.filter(function (x) { return String(x.RecID) === rid && key_(x.StudentID) === key_(st.StudentID); })[0];
  if (!r) return { ok: false, error: 'Recording not found.' };
  if (String(r.Result || '').trim()) return { ok: false, error: 'This recording has already been marked.' };
  try { DriveApp.getFileById(String(r.FileID)).setTrashed(true); } catch (e) {}
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {   // read the tab again inside the lock, so the row number is still right
    const ft = rec_table_(), fresh = ft.rows.filter(function (x) { return String(x.RecID) === rid; })[0];
    if (fresh) ft.sh.deleteRow(fresh._row);
  }
  finally { lock.releaseLock(); }
  return { ok: true };
}

/* Audio for one recording, as base64 (only the student who sent it, or one of their teachers) */
function rec_audio_(r) {
  if (!r) return { ok: false, error: 'Recording not found.' };
  try {
    const f = DriveApp.getFileById(String(r.FileID));
    return { ok: true, recId: String(r.RecID), mime: String(r.Mime || f.getMimeType()), audio: Utilities.base64Encode(f.getBlob().getBytes()) };
  } catch (e) { return { ok: false, error: 'This recording could not be opened. It may have been deleted from Drive.' }; }
}
function rec_studentAudio_(st, p) {
  const rid = tchClean_(p.recId, 20);
  return rec_audio_(rec_table_().rows.filter(function (x) { return String(x.RecID) === rid && key_(x.StudentID) === key_(st.StudentID); })[0]);
}

/* Entry point for the student actions (called from doPost in Code.gs after the student has signed in) */
function recStudentRequest(st, p) {
  try {
    if (p.action === 'rec_audio') return rec_studentAudio_(st, p);
    const r = p.action === 'rec_submit' ? rec_submit_(st, p) : p.action === 'rec_withdraw' ? rec_withdraw_(st, p) : { ok: false, error: 'Unknown action.' };
    return r.ok ? payload_(st) : r;
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong while saving the recording. Please try again.' };
  }
}

/* ===== WHAT THE TEACHER SEES (added to the teacher payload in Teacher.gs) ===== */
function rec_forTeacher_(me, students) {
  if (!ss_().getSheetByName(REC_TAB)) return [];
  const names = {};
  students.forEach(function (s) { names[key_(s.StudentID)] = s.Name; });
  return table_(REC_TAB).rows.filter(function (r) { return r.RecID && names[key_(r.StudentID)]; })
    .map(function (r) { return rec_view_(r, names[key_(r.StudentID)]); })
    .sort(function (a, b) { if ((a.Status === 'Waiting') !== (b.Status === 'Waiting')) return a.Status === 'Waiting' ? -1 : 1; return a.Status === 'Waiting' ? (a.Submitted < b.Submitted ? -1 : 1) : rec_newest_(a, b); })
    .slice(0, 300);
}
function rec_teacherRow_(me, rid) {
  const t = rec_table_(), r = t.rows.filter(function (x) { return String(x.RecID) === tchClean_(rid, 20); })[0];
  if (!r) tchFail_('Recording not found.');
  tchOne_(me, r.StudentID);   // fails unless the student is assigned to this teacher (or the teacher is an admin)
  return { t: t, r: r };
}
function rec_teacherAudio_(me, p) { return rec_audio_(rec_teacherRow_(me, p.recId).r); }

/* Teacher marks a recording. A blank result takes the mark off. */
function rec_mark_(me, p) {
  const o = rec_teacherRow_(me, p.recId), t = o.t, r = o.r, result = String(p.result || '');
  const feedback = tchClean_(p.feedback, 1000);
  if (!result) {
    ['Memorisation', 'Tajwid', 'Fluency', 'Result', 'MarkedBy', 'Marked'].forEach(function (k) { put_(t, r._row, k, ''); });
    put_(t, r._row, 'Feedback', feedback, true);
    return;
  }
  if (REC_RESULTS.indexOf(result) < 0) tchFail_('Choose Pass or Repeat.');
  const vals = {};
  Object.keys(REC_SCALE).forEach(function (k) {
    const raw = tchClean_(p[k.toLowerCase()], 6);
    if (raw === '') { vals[k] = ''; return; }
    const n = tchNum_(raw);
    if (!(n >= 0 && n <= REC_SCALE[k])) tchFail_(k + ' must be between 0 and ' + REC_SCALE[k] + '.');
    vals[k] = n;
  });
  Object.keys(vals).forEach(function (k) { put_(t, r._row, k, vals[k]); });
  put_(t, r._row, 'Result', result); put_(t, r._row, 'Feedback', feedback, true);
  put_(t, r._row, 'MarkedBy', me.TeacherID); put_(t, r._row, 'Marked', new Date());
  // Optional: a passed new lesson moves the student's current surah and ayah forward
  if (p.advance && result === 'Pass' && String(r.Type) === 'New lesson' && String(r.Surah).trim()) {
    const s = tchOne_(me, r.StudentID);
    put_(s.t, s.row._row, 'CurrentSurah', String(r.Surah).trim(), true);
    if (rec_num_(r.ToAyah) !== null) put_(s.t, s.row._row, 'CurrentAyah', Number(r.ToAyah));
  }
}

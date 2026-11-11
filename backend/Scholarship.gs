/**
 * Himaayah Schools Scholarship (free UTME forms)
 *
 * The website page scholarship.html sends action "scholarship" here. Each application is saved once on a
 * "Scholarship" tab (created automatically); the O'level result is stored privately in a Drive folder
 * called "Himaayah Scholarship Results" and the sheet row holds a link to it. The student gets a short
 * confirmation email and the school account is told about each new application.
 *
 * THE RULES (keep in step with scholarship.html)
 *   - 20 places for the 2027 UTME; Himaayah pays the UTME registration form fee.
 *   - O'level: every subject A1, B2 or B3 (no C or lower), at least 5 subjects. The result is uploaded with the application.
 *     One or two sittings are allowed if every grade still meets the rule. With two sittings BOTH results are uploaded and both must be
 *     from the same body (WAEC + WAEC, or NECO + NECO). WAEC + NECO is not accepted. The sheet shows Sittings, Year2, ExamNumber2, ResultFile2.
 *   - Scholarship exam (30 December 2026, InshAllah), scored out of 400: a score ABOVE 290 (291 or more) is needed.
 *   - The 20 highest scorers who meet every rule win. Ties: more A1s first, then the earlier application.
 *
 * WORKING THE SHEET
 *   Status (drop-down): Received → Verified (you checked the result with WAEC/NECO) → Invited (told the exam date)
 *                       → Awarded / Reserve (set by the ranking menu) · or Disqualified · or Not selected.
 *   Type each student's exam score in the ExamScore column once the exam is marked, and the number of A1s in A1Count
 *   (you see it on the result you verified) so ties can be broken.
 *   Menu Himaayah → Scholarship: 'Email verified applicants the exam date', 'Rank the scholarship exam (top 20)'.
 *
 * SETUP: add this file to the Apps Script project, add the lines in Code.gs (route + menu), then Deploy → Manage deployments → New version.
 */

const SCH_TAB = 'Scholarship';
const SCH_HEAD = ['Applied', 'Ref', 'Name', 'DateOfBirth', 'Age', 'Email', 'WhatsApp', 'State', 'School', 'Examination', 'Year', 'ExamNumber', 'Subjects',
                  'Course', 'University', 'Guardian', 'GuardianPhone', 'ResultFile', 'Status', 'A1Count', 'ExamScore', 'Rank', 'Note', 'Notified',
                  'Sittings', 'Year2', 'ExamNumber2', 'ResultFile2'];   // new columns are always added at the END so an older tab keeps working
const SCH_STATUSES = ['Received', 'Verified', 'Invited', 'Awarded', 'Reserve', 'Not selected', 'Disqualified'];
const SCH_FOLDER_NAME = 'Himaayah Scholarship Results';
const SCH_OPEN = true;              // set to false to stop taking applications
const SCH_CLOSES = '2026-12-15';    // last day to apply (West Africa time); empty = no closing date
const SCH_EXAM_DATE = '30 December 2026';   // the scholarship exam, InshAllah
const SCH_PLACES = 20;              // number of scholarships
const SCH_RESERVES = 5;             // how many reserves the ranking menu marks after the winners
const SCH_PASS_ABOVE = 290;         // a score must be ABOVE this (out of 400)
const SCH_MAX_BYTES = 3 * 1024 * 1024;
const SCH_PER_HOUR = 40;            // simple protection against spam
const SCH_NOTIFY_STAFF = true;

function sch_sheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SCH_TAB);
  if (sh) {   // an older tab: add any columns that are missing, at the end
    const have = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    SCH_HEAD.forEach(function (h) { if (have.indexOf(h) < 0) { sh.getRange(1, have.length + 1).setValue(h).setFontWeight('bold'); have.push(h); } });
  }
  if (!sh) {
    sh = ss.insertSheet(SCH_TAB);
    sh.getRange(1, 1, 1, SCH_HEAD.length).setValues([SCH_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(SCH_STATUSES, true).setAllowInvalid(false).build();
    sh.getRange(2, SCH_HEAD.indexOf('Status') + 1, 1000, 1).setDataValidation(rule);
  }
  return sh;
}
function sch_folder_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('SCH_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const found = DriveApp.getFoldersByName(SCH_FOLDER_NAME);
  const f = found.hasNext() ? found.next() : DriveApp.createFolder(SCH_FOLDER_NAME);   // private: only the school account can open it
  props.setProperty('SCH_FOLDER_ID', f.getId());
  return f;
}
function sch_say_(msg) { console.log(msg); try { ss_().toast(msg, 'Scholarship', 10); } catch (e) {} }

function sch_file_(mimeIn, nameIn, dataIn) {   // returns { bytes, mime, fname } or { error }
  const mime = String(mimeIn || '').toLowerCase(), fname = String(nameIn || 'result').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80).replace(/[^\w.\- ]/g, '_');
  if (!(/^image\/(jpeg|png)$/.test(mime) || mime === 'application/pdf')) return { error: 'Upload each result as a photo (JPG or PNG) or a PDF.' };
  let bytes = null;
  try { bytes = Utilities.base64Decode(String(dataIn || '')); } catch (e) { return { error: 'Your result did not arrive. Please try again.' }; }
  if (!bytes || bytes.length < 1000) return { error: 'A result file looks empty. Please upload it again.' };
  if (bytes.length > SCH_MAX_BYTES) return { error: 'A result file is larger than 3 MB. Please upload a smaller one.' };
  return { bytes: bytes, mime: mime, fname: fname };
}

function scholarshipFromRequest(p) {
  try {
    if (String(p.website || '')) return { ok: true, ref: 'SCH-OK' };   // honeypot filled: a bot
    if (!SCH_OPEN) return { ok: false, error: 'Applications for the scholarship are closed.' };
    if (SCH_CLOSES && iso_(new Date(), false) > SCH_CLOSES) return { ok: false, error: 'Applications closed on ' + SCH_CLOSES + '.' };
    const clean = function (v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); };
    const two = Number(p.sittings) === 2;
    const d = {
      name: clean(p.name, 100), dob: clean(p.dob, 10), state: clean(p.state, 40), email: clean(p.email, 200).toLowerCase(), phone: clean(p.whatsapp, 30),
      school: clean(p.school, 120), body: clean(p.body, 10).toUpperCase(), year: clean(p.year, 4), examNo: clean(p.examNo, 30).toUpperCase(), subjects: Math.round(Number(p.subjects)),
      year2: two ? clean(p.year2, 4) : '', examNo2: two ? clean(p.examNo2, 30).toUpperCase() : '',
      course: clean(p.course, 100), uni: clean(p.university, 100), guardian: clean(p.guardian, 100), gphone: clean(p.guardianPhone, 30)
    };
    if (!d.name) return { ok: false, error: 'Enter your full name.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dob) || isNaN(new Date(d.dob).getTime())) return { ok: false, error: 'Enter your date of birth.' };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return { ok: false, error: 'Enter a valid email address.' };
    if (d.phone.replace(/\D/g, '').length < 10) return { ok: false, error: 'Enter a WhatsApp number we can reach.' };
    if (['WAEC', 'NECO'].indexOf(d.body) < 0) return { ok: false, error: 'Choose WAEC or NECO. Results that are not yet released cannot be accepted.' };
    const okYear = function (y) { return /^\d{4}$/.test(y) && Number(y) >= 2015 && Number(y) <= 2026; };
    if (!okYear(d.year)) return { ok: false, error: 'Enter the year you wrote the exam.' };
    if (!d.examNo) return { ok: false, error: 'Enter your examination number.' };
    if (two) {
      if (!okYear(d.year2)) return { ok: false, error: 'Enter the year of your second sitting.' };
      if (!d.examNo2) return { ok: false, error: 'Enter the examination number of your second sitting.' };
      if (d.examNo2 === d.examNo) return { ok: false, error: 'The two sittings must have different examination numbers.' };
    }
    if (!(d.subjects >= 5 && d.subjects <= 16)) return { ok: false, error: "The scholarship needs at least five O'level subjects in total." };
    if (!d.state || !d.school || !d.course || !d.uni) return { ok: false, error: 'Please fill in every field.' };
    if (!d.guardian || d.gphone.replace(/\D/g, '').length < 10) return { ok: false, error: "Enter your parent or guardian's name and phone number." };

    const f1 = sch_file_(p.fileMime, p.fileName, p.fileData); if (f1.error) return { ok: false, error: f1.error };
    let f2 = null;
    if (two) { f2 = sch_file_(p.file2Mime, p.file2Name, p.file2Data); if (f2.error) return { ok: false, error: 'Second sitting: ' + f2.error }; }

    const cache = CacheService.getScriptCache(), n = Number(cache.get('schjoins') || 0);
    if (n >= SCH_PER_HOUR) return { ok: false, error: 'Too many requests right now. Please try again later.' };
    cache.put('schjoins', String(n + 1), 3600);

    const age = Math.floor((new Date().getTime() - new Date(d.dob).getTime()) / 31557600000);
    let ref = '', isNew = true;
    const lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      const sh = sch_sheet_(), last = sh.getLastRow();
      const rows = last > 1 ? sh.getRange(2, 1, last - 1, SCH_HEAD.length).getValues() : [];
      const col = function (h) { return SCH_HEAD.indexOf(h); };
      const nums = [d.examNo, d.examNo2].filter(String);
      let found = -1;
      rows.forEach(function (r, i) {
        if (found >= 0) return;
        const theirs = [String(r[col('ExamNumber')]).toUpperCase(), String(r[col('ExamNumber2')]).toUpperCase()].filter(String);
        if (String(r[col('Email')]).toLowerCase() === d.email || nums.some(function (x) { return theirs.indexOf(x) >= 0; }) ||
            String(r[col('WhatsApp')]).replace(/\D/g, '').slice(-10) === d.phone.replace(/\D/g, '').slice(-10)) found = i;
      });
      if (found >= 0 && String(rows[found][col('Status')]) !== 'Received') return { ok: true, ref: String(rows[found][col('Ref')]), updated: true };   // already being processed: do not change it
      ref = found >= 0 ? String(rows[found][col('Ref')]) : 'SCH-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
      const folder = sch_folder_();
      const make = function (f, no, tag) { return folder.createFile(Utilities.newBlob(f.bytes, f.mime, ref + '-' + no + tag + '-' + f.fname)); };
      const file1 = make(f1, d.examNo, '-1'), file2 = f2 ? make(f2, d.examNo2, '-2') : null;
      const vals = { Name: d.name, DateOfBirth: d.dob, Age: age, Email: d.email, WhatsApp: d.phone, State: d.state, School: d.school, Examination: d.body, Year: d.year,
        ExamNumber: d.examNo, Subjects: d.subjects, Course: d.course, University: d.uni, Guardian: d.guardian, GuardianPhone: d.gphone, ResultFile: file1.getUrl(),
        Sittings: two ? 2 : 1, Year2: d.year2, ExamNumber2: d.examNo2, ResultFile2: file2 ? file2.getUrl() : '' };
      if (found >= 0) {
        isNew = false;
        [rows[found][col('ResultFile')], rows[found][col('ResultFile2')]].forEach(function (u) {
          try { if (u) DriveApp.getFileById(String(u).replace(/^.*\/d\/([^\/]+).*$/, '$1')).setTrashed(true); } catch (e) {}
        });
        const row = rows[found].slice();
        Object.keys(vals).forEach(function (k) { row[col(k)] = vals[k]; });
        sh.getRange(found + 2, 1, 1, SCH_HEAD.length).setNumberFormat('@').setValues([row]);
      } else {
        const row = SCH_HEAD.map(function () { return ''; });
        row[col('Applied')] = iso_(new Date(), true); row[col('Ref')] = ref; row[col('Status')] = 'Received';
        Object.keys(vals).forEach(function (k) { row[col(k)] = vals[k]; });
        sh.getRange(last + 1, 1, 1, SCH_HEAD.length).setNumberFormat('@').setValues([row]);
      }
    } finally { lock.releaseLock(); }

    if (isNew) {
      try {
        if (MailApp.getRemainingDailyQuota() > 1) {
          MailApp.sendEmail({ to: d.email, name: SCHOOL_NAME, subject: SCHOOL_NAME + ' Scholarship: we received your application (' + ref + ')',
            body: 'Assalaamu alaykum ' + d.name.split(' ')[0] + ',\n\nThank you for applying for the Himaayah Schools Scholarship (free 2027 UTME form). Your reference is ' + ref + '.\n\n' +
                  'What happens next:\n1. We check your O\'level result' + (two ? 's' : '') + '. Every grade must be A1, B2 or B3' + (two ? ', and both sittings must be from the same examination body' : '') + '.\n2. If you qualify, we invite you to the scholarship exam, which is on ' + SCH_EXAM_DATE + ', InshAllah. We will send the time and details by email and WhatsApp.\n' +
                  '3. You must score above ' + SCH_PASS_ABOVE + ' (out of 400). The ' + SCH_PLACES + ' highest scorers who meet every requirement are awarded.\n\nYou can read the full requirements at https://www.himaayahschools.com/scholarship\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
        }
        if (SCH_NOTIFY_STAFF && MailApp.getRemainingDailyQuota() > 1) {
          const to = Session.getEffectiveUser().getEmail();
          if (to) MailApp.sendEmail({ to: to, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': new scholarship application (' + ref + ')',
            body: d.name + ' applied.\n' + d.body + ' ' + d.year + ', number ' + d.examNo + (two ? '\nSecond sitting: ' + d.body + ' ' + d.year2 + ', number ' + d.examNo2 : '') + ', ' + d.subjects + ' subjects in total.\nWhatsApp: ' + d.phone + '\nEmail: ' + d.email + '\nCourse: ' + d.course + ' (' + d.uni + ')\nAge: ' + age + '\nReference: ' + ref + '\nOpen the Scholarship tab to check the result' + (two ? 's' : '') + '.' });
        }
      } catch (err) { console.error(err); }
    }
    return { ok: true, ref: ref, updated: !isNew };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* Menu: email everyone marked Verified with the exam details, and mark them Invited */
function scholarshipEmailInvited() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Scholarship exam', 'Type the exam time and place exactly as students should read it. The date is ' + SCH_EXAM_DATE + ' (for example: Wednesday 30 December 2026, 10:00 am, Himaayah Schools online portal).', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK || !String(a.getResponseText()).trim()) { sch_say_('Cancelled. Nothing was sent.'); return; }
  const when = String(a.getResponseText()).trim();
  const sh = sch_sheet_(), last = sh.getLastRow();
  if (last < 2) { sch_say_('There are no applications yet.'); return; }
  const rows = sh.getRange(2, 1, last - 1, SCH_HEAD.length).getValues(), col = function (h) { return SCH_HEAD.indexOf(h); };
  let sent = 0, skipped = 0;
  rows.forEach(function (r, i) {
    if (String(r[col('Status')]) !== 'Verified') return;
    if (MailApp.getRemainingDailyQuota() < 1) { skipped++; return; }
    try {
      MailApp.sendEmail({ to: String(r[col('Email')]), name: SCHOOL_NAME, subject: SCHOOL_NAME + ' Scholarship: you are invited to the exam',
        body: 'Assalaamu alaykum ' + String(r[col('Name')]).split(' ')[0] + ',\n\nYour O\'level result has been verified and you are invited to the scholarship exam.\n\nExam: ' + when +
              '\n\nIt is scored out of 400. You need above ' + SCH_PASS_ABOVE + ' to qualify. The ' + SCH_PLACES + ' highest scorers who meet every requirement receive a free 2027 UTME form. You can sit the exam once.\n\nYour reference: ' + r[col('Ref')] + '\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
      sh.getRange(i + 2, col('Status') + 1).setValue('Invited');
      sh.getRange(i + 2, col('Notified') + 1).setNumberFormat('@').setValue(iso_(new Date(), true));
      sent++;
    } catch (err) { console.error(err); skipped++; }
  });
  sch_say_(sent ? 'Emailed ' + sent + ' applicant' + (sent === 1 ? '' : 's') + ' the exam details.' + (skipped ? ' ' + skipped + ' could not be sent; run it again tomorrow.' : '') : 'Nobody to email. Set Status to "Verified" for students whose result you have checked.');
}

/* Menu: after the exam, rank everyone who scored above the pass mark and mark the winners and reserves */
function scholarshipRank() {
  const sh = sch_sheet_(), last = sh.getLastRow();
  if (last < 2) { sch_say_('There are no applications yet.'); return; }
  const rows = sh.getRange(2, 1, last - 1, SCH_HEAD.length).getValues(), col = function (h) { return SCH_HEAD.indexOf(h); };
  const cands = [];
  rows.forEach(function (r, i) {
    const st = String(r[col('Status')]), score = Number(r[col('ExamScore')]);
    if (r[col('ExamScore')] === '' || isNaN(score) || st === 'Disqualified' || st === 'Received') return;   // needs a verified result and a score
    if (score > SCH_PASS_ABOVE) cands.push({ i: i, score: score, a1: Number(r[col('A1Count')]) || 0, applied: String(r[col('Applied')]) });
  });
  cands.sort(function (x, y) { return y.score - x.score || y.a1 - x.a1 || (x.applied < y.applied ? -1 : 1); });
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('Rank the scholarship exam', cands.length + ' student(s) scored above ' + SCH_PASS_ABOVE + '. The top ' + Math.min(SCH_PLACES, cands.length) + ' will be marked "Awarded", the next ' + SCH_RESERVES + ' "Reserve". Continue? (No emails are sent.)', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  cands.forEach(function (c, k) {
    const row = c.i + 2;
    sh.getRange(row, col('Rank') + 1).setValue(k + 1);
    sh.getRange(row, col('Status') + 1).setValue(k < SCH_PLACES ? 'Awarded' : k < SCH_PLACES + SCH_RESERVES ? 'Reserve' : 'Not selected');
  });
  rows.forEach(function (r, i) {   // everyone scored but not above the pass mark
    const score = Number(r[col('ExamScore')]), st = String(r[col('Status')]);
    if (r[col('ExamScore')] !== '' && !isNaN(score) && score <= SCH_PASS_ABOVE && st !== 'Disqualified') sh.getRange(i + 2, col('Status') + 1).setValue('Not selected');
  });
  sch_say_('Ranked ' + cands.length + ' student(s). Check the Rank and Status columns, then email the winners yourself.');
}

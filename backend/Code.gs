/**
 * Himaayah Student Dashboard API, version 2
 *
 * Adds to version 1:
 *   1. Assignments and student submissions
 *   2. Automatic payment updates (staff confirm a payment, the dashboard updates itself)
 *   3. Reminders (email, a ready-to-send WhatsApp list for staff, and a banner on the dashboard)
 *   4. Card payments from the website (Bachs), recorded by CardPayments.gs
 *   5. Academy and Skills School portals (Academy.gs, Skills.gs)
 *
 * This file replaces your current Code.gs. Keep a copy of the old one before you paste.
 * Setup steps are in SETUP.md.
 */

/* ===== SETTINGS ===== */
const SHEET_ID = '1noglfG4gtK9ZzDw94Bm6-p8yNrkKbHetNsXE3LAY7z0';                 // Leave empty if this script was opened from Extensions > Apps Script inside the sheet.
const SCHOOL_NAME = 'Himaayah Schools';
const DASHBOARD_URL = 'https://www.himaayahschools.com/dashboard.html';
/* The current Madrasah term, in English and Arabic. Change these lines when a new term begins; every Madrasah portal and exam page follows. */
const SCHOOL_TERM = { Name: 'Second Semester', Session: '2026/2027', Hijri: '1448/1449 AH',
  NameAr: '\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062f\u0631\u0627\u0633\u064a \u0627\u0644\u062b\u0627\u0646\u064a', SessionAr: '\u0662\u0660\u0662\u0666/\u0662\u0660\u0662\u0667', HijriAr: '\u0661\u0664\u0664\u0668/\u0661\u0664\u0664\u0669 \u0647\u0640' };
function schoolTerm_() {
  return { Name: SCHOOL_TERM.Name, Session: SCHOOL_TERM.Session, Hijri: SCHOOL_TERM.Hijri,
    Key: SCHOOL_TERM.Session + ' ' + SCHOOL_TERM.Name,                                              // what exams and the gradebook store, e.g. "2026/2027 Second Semester"
    Label: SCHOOL_TERM.Name + ' \u00b7 ' + SCHOOL_TERM.Session + ' \u00b7 ' + SCHOOL_TERM.Hijri,
    LabelAr: SCHOOL_TERM.NameAr + ' \u00b7 ' + SCHOOL_TERM.SessionAr + ' \u00b7 ' + SCHOOL_TERM.HijriAr };   // the same in Arabic, for the report card    // what people see
}
const LOCKOUT_TRIES = 5;             // wrong codes allowed
const LOCKOUT_SECONDS = 900;         // 15 minutes
const DUE_SOON_DAYS = 7;             // payment shows "Due" this many days before NextDue
const REMINDER_HOUR = 6;             // the daily job runs around this hour (spreadsheet time zone)
const SEND_EMAILS = true;            // set false to build the WhatsApp list only
const PAYMENT_REMINDER_DAYS = [7, 3, 0];   // days before the due date
const ASSIGNMENT_REMINDER_DAYS = [1, 0];   // days before the due date
const CLASS_REMINDER_DAYS = [1];           // days before the class
const KEEP_REMINDER_DAYS = 120;      // old rows in the Reminders tab are removed after this many days

/* ===== TABS AND COLUMNS ===== */
const SHEETS = {
  Students: ['StudentID', 'Name', 'AccessCode', 'Level', 'Plan', 'Teacher', 'PaymentStatus', 'NextDue', 'AttendancePresent', 'AttendanceTotal', 'NextClass', 'ClassLink', 'Juz', 'CurrentSurah', 'CurrentAyah', 'Active', 'Email', 'WhatsApp', 'MonthlyFee'],
  Hifdh: ['StudentID', 'Surah', 'Status'],
  Murajaah: ['StudentID', 'Day', 'Portion'],
  Results: ['StudentID', 'Date', 'Type', 'Subject', 'Score', 'OutOf'],
  Announcements: ['Date', 'Title', 'Body', 'Audience'],
  Materials: ['Title', 'URL', 'Level'],
  Assignments: ['AssignmentID', 'Title', 'Instructions', 'Subject', 'Level', 'Audience', 'Assigned', 'Due', 'Link', 'MaxScore', 'Active'],
  Submissions: ['SubmissionID', 'AssignmentID', 'StudentID', 'Submitted', 'Note', 'Link', 'Score', 'Feedback', 'Marked'],
  Payments: ['PaymentID', 'StudentID', 'Date', 'Amount', 'Months', 'Reference', 'Method', 'Status', 'Applied'],
  Reminders: ['Date', 'StudentID', 'Name', 'Type', 'Message', 'WhatsAppLink', 'EmailStatus', 'Done', 'Key']
};

/* ===== SMALL HELPERS ===== */
function ss_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }
function key_(v) { return String(v == null ? '' : v).trim().toUpperCase(); }

function table_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setupSheets.');
  const v = sh.getDataRange().getValues();
  const head = (v[0] || []).map(function (h) { return String(h).trim(); });
  const rows = [];
  for (let i = 1; i < v.length; i++) {
    const o = { _row: i + 1 };
    for (let c = 0; c < head.length; c++) if (head[c]) o[head[c]] = v[i][c];
    rows.push(o);
  }
  return { sh: sh, head: head, rows: rows };
}
function put_(t, row, field, val, asText) {
  if (field === 'AccessCode') val = code_store_(val);   // access codes are stored protected (Codes.gs)
  const c = t.head.indexOf(field);
  if (c < 0) throw new Error('Missing column "' + field + '" in ' + t.sh.getName() + '. Run setupSheets.');
  const r = t.sh.getRange(row, c + 1);
  if (asText) r.setNumberFormat('@');   // text format stops anything typed by a student being read as a formula
  r.setValue(val);
}
function append_(t, obj, textFields) {
  const row = t.sh.getLastRow() + 1;
  Object.keys(obj).forEach(function (k) { put_(t, row, k, obj[k], textFields && textFields.indexOf(k) >= 0); });
  return row;
}

/* Dates are handled as plain text: "2026-11-05" and "2026-11-05T17:00". */
function iso_(v, withTime) {
  if (v === '' || v == null) return '';
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
    if (m) return withTime ? m[1] + 'T' + (m[2] || '00:00') : m[1];
  }
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return String(v);
  return Utilities.formatDate(d, tz_(), withTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd');
}
/* The day starts at midnight for the person asking. Student pages send their browser's time zone (js/tz.js); anyone else
   gets the school's (spreadsheet) time zone. REQ_TZ_ is set per request in doPost. */
var REQ_TZ_ = '';
function validTz_(v) {
  v = String(v || '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,2}$/.test(v) || v.length > 64) return '';
  try { Utilities.formatDate(new Date(), v, 'yyyy'); return v; } catch (e) { return ''; }
}
function today_() { return Utilities.formatDate(new Date(), REQ_TZ_ || tz_(), 'yyyy-MM-dd'); }
function todayIn_(tz) { return Utilities.formatDate(new Date(), validTz_(tz) || tz_(), 'yyyy-MM-dd'); }
/* remember a student's time zone (Students tab, "Timezone" column) so reminder emails use their own day */
function tzRemember_(st, tz) {
  try {
    tz = validTz_(tz); if (!tz || !st || !st._row || String(st.Timezone || '') === tz) return;
    const sh = ss_().getSheetByName('Students'), n = sh.getLastColumn(), head = sh.getRange(1, 1, 1, n).getValues()[0].map(function (h) { return String(h).trim(); });
    let c = head.indexOf('Timezone') + 1;
    if (!c) { c = n + 1; sh.getRange(1, c).setValue('Timezone').setFontWeight('bold'); }
    sh.getRange(st._row, c).setValue(tz);
  } catch (e) {}
}
function dn_(isoDay) { const p = String(isoDay).slice(0, 10).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000; }
function addMonths_(isoDay, m) {
  const p = String(isoDay).slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1 + m, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(p[2], last));
  return d.toISOString().slice(0, 10);
}
function nice_(isoDay) {
  const p = String(isoDay).slice(0, 10).split('-').map(Number);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p[1] - 1];
  return wd + ' ' + p[2] + ' ' + mo + ' ' + p[0];
}
function naira_(n) { return '\u20A6' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function same_(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
/* A cell may be empty, "All", one value, or a list such as "HM-0001, HM-0002". */
function matches_(cell, allowed) {
  const parts = String(cell == null ? '' : cell).split(/[,;]+/).map(key_).filter(Boolean);
  if (!parts.length) return true;
  return parts.some(function (p) { return p === 'ALL' || allowed.indexOf(p) >= 0; });
}

/* Payment status is worked out from NextDue, so it is always right even before the daily job runs. */
function payStatus_(st) {
  const raw = String(st.PaymentStatus || '').trim();
  if (raw.toLowerCase() === 'exempt') return 'Exempt';
  const nd = iso_(st.NextDue);
  if (!nd) return raw || 'Due';
  const d = dn_(nd) - dn_(today_());
  return d < 0 ? 'Overdue' : d <= DUE_SOON_DAYS ? 'Due' : 'Paid';
}

/* ===== LOGIN ===== */
function auth_(id, code) {
  id = key_(id).slice(0, 40); code = String(code || '').trim();
  if (!id || !code) return { error: 'Enter your Student ID and access code.' };
  const cache = CacheService.getScriptCache(), lk = 'lock:' + id, fk = 'fail:' + id;
  if (cache.get(lk)) return { error: 'Too many attempts. Please try again in 15 minutes.' };
  const t = table_('Students');
  const st = t.rows.filter(function (r) { return key_(r.StudentID) === id; })[0];
  const ok = st && key_(st.Active) !== 'FALSE' && String(st.AccessCode).trim() !== '' && code_ok_(st.AccessCode, code);
  if (!ok) {
    const n = Number(cache.get(fk) || 0) + 1;
    if (n >= LOCKOUT_TRIES) { cache.put(lk, '1', LOCKOUT_SECONDS); cache.remove(fk); } else cache.put(fk, String(n), LOCKOUT_SECONDS);
    return { error: 'Wrong ID or access code.' };
  }
  cache.remove(fk);
  return { st: st };
}

/* A student changes their own access code from the dashboard (8 to 40 characters) */
function changeCode_(st, p) {
  const code = String(p.newCode || '').trim();
  if (code.length < 8 || code.length > 40) return { ok: false, error: 'Your new code must be 8 to 40 characters.' };
  if (/\s/.test(code)) return { ok: false, error: 'Your new code cannot contain spaces.' };
  if (code_ok_(st.AccessCode, code)) return { ok: false, error: 'Choose a code different from your current one.' };
  if (key_(code) === key_(st.StudentID)) return { ok: false, error: 'Do not use your Student ID as your code.' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { put_(table_('Students'), st._row, 'AccessCode', code, true); st.AccessCode = code_store_(code); }
  finally { lock.releaseLock(); }
  return { ok: true };
}

/* ===== WHAT THE STUDENT SEES (only their own rows) ===== */
function assignmentsFor_(st, A, S) {
  const id = key_(st.StudentID), lvl = key_(st.Level), today = today_();
  A = A || table_('Assignments'); S = S || table_('Submissions');
  const mine = {};
  S.rows.forEach(function (s) { if (key_(s.StudentID) === id) mine[String(s.AssignmentID)] = s; });
  return A.rows.filter(function (a) {
    return a.AssignmentID && a.Title && key_(a.Active) !== 'FALSE' && matches_(a.Level, [lvl]) && matches_(a.Audience, [id]);
  }).map(function (a) {
    const s = mine[String(a.AssignmentID)], due = iso_(a.Due);
    const scored = s && s.Score !== '' && s.Score != null;
    const status = scored ? 'Marked' : s ? 'Submitted' : (due && due < today) ? 'Overdue' : 'To do';
    return {
      AssignmentID: String(a.AssignmentID), Title: a.Title, Instructions: a.Instructions, Subject: a.Subject,
      Assigned: iso_(a.Assigned), Due: due, Link: a.Link, MaxScore: a.MaxScore, Status: status,
      Submission: s ? { Submitted: iso_(s.Submitted, true), Note: s.Note, Link: s.Link, Score: scored ? s.Score : '', Feedback: s.Feedback, Late: !!(due && iso_(s.Submitted) > due) } : null
    };
  }).sort(function (x, y) {
    const rx = x.Status === 'Marked' ? 1 : 0, ry = y.Status === 'Marked' ? 1 : 0;
    if (rx !== ry) return rx - ry;
    return (x.Due || '9999') < (y.Due || '9999') ? -1 : 1;
  });
}

function payload_(st) {
  const id = key_(st.StudentID), lvl = key_(st.Level);
  const mine = function (name) { return table_(name).rows.filter(function (r) { return key_(r.StudentID) === id; }); };
  return {
    ok: true, term: schoolTerm_(),
    student: {
      StudentID: String(st.StudentID).trim(), Name: st.Name, Level: st.Level, Plan: st.Plan, Teacher: st.Teacher,
      PaymentStatus: payStatus_(st), NextDue: iso_(st.NextDue), MonthlyFee: Number(st.MonthlyFee) || 0,
      AttendancePresent: Number(st.AttendancePresent) || 0, AttendanceTotal: Number(st.AttendanceTotal) || 0,
      NextClass: iso_(st.NextClass, true), ClassLink: st.ClassLink,
      Juz: Number(st.Juz) || 0, CurrentSurah: st.CurrentSurah, CurrentAyah: st.CurrentAyah
    },
    hifdh: mine('Hifdh').filter(function (r) { return r.Surah; }).map(function (r) { return { Surah: r.Surah, Status: r.Status }; }),
    murajaah: mine('Murajaah').filter(function (r) { return r.Day; }).map(function (r) { return { Day: r.Day, Portion: r.Portion }; }),
    results: mine('Results').filter(function (r) { return r.Subject; }).map(function (r) {
      return { Date: iso_(r.Date), Type: r.Type, Subject: r.Subject, Score: r.Score, OutOf: r.OutOf };
    }).sort(function (a, b) { return a.Date < b.Date ? -1 : 1; }),
    announcements: table_('Announcements').rows.filter(function (r) { return r.Title && matches_(r.Audience, ['MADRASAH', id]); }).map(function (r) {
      return { Date: iso_(r.Date), Title: r.Title, Body: r.Body };
    }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 20),
    timetable: typeof tt_forGroup_ === 'function' ? tt_forGroup_(st.Level) : [],   // weekly classes for the student's level (Timetable.gs)
    materials: table_('Materials').rows.filter(function (r) { return r.Title && matches_(r.Level, [lvl]); }).map(function (r) {
      return { Title: r.Title, URL: r.URL };
    }),
    assignments: assignmentsFor_(st),
    payments: mine('Payments').filter(function (p) { return String(p.Status).trim().toLowerCase() === 'confirmed'; }).map(function (p) {
      return { Date: iso_(p.Date), Amount: Number(p.Amount) || 0, Months: Number(p.Months) || 1, Reference: p.Reference };
    }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 12),
    recordings: typeof rec_forStudent_ === 'function' ? rec_forStudent_(st) : { enabled: false, items: [] },   // recitation recordings (Recordings.gs)
    routine: typeof rt_forStudent_ === 'function' ? rt_forStudent_(st) : { enabled: false }                   // daily hifdh routine (Routine.gs)
  };
}

/* ===== STUDENT SUBMITS AN ASSIGNMENT ===== */
function submit_(st, p) {
  const aid = String(p.assignmentId || '').trim();
  const a = assignmentsFor_(st).filter(function (x) { return x.AssignmentID === aid; })[0];
  if (!a) return { ok: false, error: 'Assignment not found.' };
  if (a.Status === 'Marked') return { ok: false, error: 'This assignment has already been marked.' };
  const note = String(p.note || '').trim().slice(0, 2000), link = String(p.link || '').trim().slice(0, 500);
  if (!note && !link) return { ok: false, error: 'Add a note or a link to your work.' };
  if (link && !/^https?:\/\//i.test(link)) return { ok: false, error: 'The link must start with http:// or https://' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = table_('Submissions'), id = key_(st.StudentID);
    const ex = t.rows.filter(function (r) { return String(r.AssignmentID) === aid && key_(r.StudentID) === id; })[0];
    const now = new Date();
    if (ex) {
      put_(t, ex._row, 'Submitted', now); put_(t, ex._row, 'Note', note, true); put_(t, ex._row, 'Link', link, true);
    } else {
      append_(t, { SubmissionID: 'S-' + Utilities.getUuid().slice(0, 8).toUpperCase(), AssignmentID: aid, StudentID: id, Submitted: now, Note: note, Link: link }, ['Note', 'Link']);
    }
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/* ===== WEB APP ===== */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ ok: true, service: 'Himaayah dashboard API', version: 2 }); }
function doPost(e) {
  let out;
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    REQ_TZ_ = /^(ow_|admin_|teacher_|rs_|lb_|examt$)/.test(String(p.action || '')) ? '' : validTz_(p.tz);   // staff pages always use the school's day
    if (p.action === 'enrol') return json_(enrolFromRequest(p));                         // new enrolments (Enrol.gs)
    if (/^ref_/.test(String(p.action || ''))) return json_(referralFromRequest(p));         // refer and earn (Referrals.gs)
    if (p.action === 'subscribe' || p.action === 'unsubscribe') return json_(newsletterFromRequest(p)); // newsletter (Newsletter.gs)
    if (p.action === 'calendar') return json_(calendarFromRequest(p));                   // school calendar page (Calendar.gs)
    if (p.action === 'scholarship') return json_(scholarshipFromRequest(p));            // scholarship applications (Scholarship.gs)
    if (p.action === 'scx') return json_(scholarshipExamFromRequest(p));                // scholarship entrance exam (ScholarshipExam.gs)
    if (p.action === 'waitlist') return json_(waitlistFromRequest(p));                   // waitlist for closed plans (Waitlist.gs)
    if (p.action === 'feeLookup' || p.action === 'feeQuote') return json_(feesFromRequest(p)); // Pay fees page (Fees.gs)
    if (/^amb_/.test(String(p.action || ''))) return json_(ambassadorsFromRequest(p));    // Himaayah Ambassadors (Ambassadors.gs)
    if (/^cm_/.test(String(p.action || ''))) return json_(commentsFromRequest(p));         // article comments (Comments.gs)
    if (/^tm_/.test(String(p.action || ''))) return json_(testimonialsFromRequest(p));     // testimonials (Testimonials.gs)
    if (/^tt_/.test(String(p.action || ''))) return json_(timetableFromRequest(p));        // class timetable (Timetable.gs)
    if (/^tr_/.test(String(p.action || ''))) return json_(trialsFromRequest(p));           // free trial classes (Trials.gs)
    if (/^pt_/.test(String(p.action || ''))) return json_(placementFromRequest(p));        // placement tests (PlacementTests.gs)
    if (/^sp_/.test(String(p.action || ''))) return json_(sponsorFromRequest(p));          // sponsor a student (Sponsors.gs)
    if (/^bc_/.test(String(p.action || ''))) return json_(bootcampFromRequest(p));         // Hadith Bootcamp (Bootcamp.gs)
    if (/^ow_/.test(String(p.action || ''))) return json_(ownerFromRequest(p));            // owner dashboard (Owner.gs)
    if (p.action === 'waChat') return json_(waChatFromRequest(p));                      // WhatsApp assistant (WhatsApp.gs)
    if (p.action === 'cardPayment') return json_(cardPaymentFromRequest(p));             // Bachs card payments from the website (CardPayments.gs)
    if (/^acd/.test(String(p.action || ''))) return json_(academyFromRequest(p));        // Academy portals (Academy.gs)
    if (/^sk(_|t_|a_)/.test(String(p.action || ''))) return json_(skillsFromRequest(p)); // Skills School portals (Skills.gs)
    if (/^teacher_/.test(String(p.action || ''))) return json_(teacherFromRequest(p));   // teacher dashboard (Teacher.gs)
    if (/^admin_/.test(String(p.action || ''))) return json_(adminFromRequest(p));       // admin portal (Admin.gs)
    if (/^tbc/.test(String(p.action || ''))) return json_(tbcFromRequest(p));            // Teenagers Building Circle (TBC.gs)
    if (/^lb_/.test(String(p.action || ''))) return json_(librarianFromRequest(p));        // librarian portal (Librarian.gs)
    if (p.action === 'cards') return json_(cardsRequest(p));                             // library and ID cards (Cards.gs)
    if (p.action === 'library') return json_(libraryRequest(p));                         // Madrasah library (Library.gs)
    if (p.action === 'tracker') return json_(trackerRequest(p));                         // daily revision tracker (Tracker.gs)
    if (/^rs_/.test(String(p.action || ''))) return json_(resetsFromRequest(p));          // reset access codes, admin portals (Resets.gs)
    if (p.action === 'exams') return json_(examsRequest(p));                             // Madrasah exams, student side (Exams.gs)
    if (p.action === 'examt') return json_(examtRequest(p));                             // Madrasah exams, teacher side (Exams.gs)
    if (p.action === 'quiz') return json_(quizRequest(p));                               // student quizzes (Quiz.gs)
    const a = auth_(p.id, p.code);
    if (a.error) out = { ok: false, error: a.error };
    else if (tzRemember_(a.st, p.tz), p.action === 'submit') { const r = submit_(a.st, p); out = r.ok ? payload_(a.st) : r; }
    else if (p.action === 'password') { const r = changeCode_(a.st, p); out = r.ok ? payload_(a.st) : r; }
    else if (/^rec_/.test(String(p.action || '')) && typeof recStudentRequest === 'function') out = recStudentRequest(a.st, p);   // recitation recordings (Recordings.gs)
    else if (/^rt_/.test(String(p.action || '')) && typeof rtStudentRequest === 'function') out = rtStudentRequest(a.st, p);       // daily hifdh routine (Routine.gs)
    else out = payload_(a.st);   // "login" and anything else
  } catch (err) {
    console.error(err);
    out = { ok: false, error: 'Something went wrong. Please try again.' };
  }
  return json_(out);
}

/* ===== AUTOMATIC PAYMENT UPDATES =====
   Staff add a row in Payments and set Status to Confirmed once the receipt is checked.
   The script then moves the student's NextDue forward and updates their status. */
function applyPayments_() {
  const done = [];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const pt = table_('Payments'), stt = table_('Students');
    pt.rows.forEach(function (p) {
      if (String(p.Status).trim().toLowerCase() !== 'confirmed' || p.Applied) return;
      const id = key_(p.StudentID);
      const s = stt.rows.filter(function (r) { return key_(r.StudentID) === id; })[0];
      if (!s) { put_(pt, p._row, 'Applied', 'No such student'); return; }
      const date = iso_(p.Date) || today_(), months = Math.max(1, Math.round(Number(p.Months) || 1));
      const cur = iso_(s.NextDue), base = (cur && cur >= date) ? cur : date;   // paid early: extend from the old date. Paid late: start from today.
      const nd = addMonths_(base, months);
      s.NextDue = nd; s.PaymentStatus = payStatus_(s);
      put_(stt, s._row, 'NextDue', nd); put_(stt, s._row, 'PaymentStatus', s.PaymentStatus);
      put_(pt, p._row, 'Applied', new Date());
      done.push({ s: s, amount: Number(p.Amount) || 0, nd: nd });
    });
  } finally { lock.releaseLock(); }
  done.forEach(function (d) {   // thank-you email (installable triggers only)
    const first = String(d.s.Name).split(' ')[0];
    sendEmail_(d.s, SCHOOL_NAME + ': payment received',
      'Assalaamu alaykum ' + first + '. We have received your payment' + (d.amount ? ' of ' + naira_(d.amount) : '') + '. Your next payment is due on ' + nice_(d.nd) + '. Jazakumullahu khayran.');
  });
  return done.length;
}

function refreshStatuses_() {
  const t = table_('Students');
  let n = 0;
  t.rows.forEach(function (s) {
    if (!s.StudentID) return;
    const want = payStatus_(s);
    if (want !== String(s.PaymentStatus || '').trim() && String(s.PaymentStatus).trim().toLowerCase() !== 'exempt') { put_(t, s._row, 'PaymentStatus', want); n++; }
  });
  return n;
}

/* ===== REMINDERS ===== */
function validEmail_(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').trim()); }
function sendEmail_(s, subject, body) {
  if (!SEND_EMAILS) return 'Off';
  if (!validEmail_(s.Email)) return 'No email';
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return 'Quota reached';
    MailApp.sendEmail({ to: String(s.Email).trim(), subject: subject, body: body + '\n\n' + SCHOOL_NAME + '\n' + DASHBOARD_URL, name: SCHOOL_NAME });
    return 'Sent';
  } catch (err) { console.error(err); return 'Error'; }
}
function waLink_(num, msg) {
  let n = String(num || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.charAt(0) === '0' && n.length === 11) n = '234' + n.slice(1);
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg);
}
/* Pay fees page link (Fees.gs). Works even before Fees.gs is added. */
function payLink_(id) { return 'https://www.himaayahschools.com/pay.html?id=' + encodeURIComponent(String(id || '').trim()); }
function when_(d) { return d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'; }

function runReminders_() {
  const today = today_(), now = dn_(today);
  const stt = table_('Students'), A = table_('Assignments'), S = table_('Submissions'), R = table_('Reminders');
  const seen = {};
  R.rows.forEach(function (r) { if (r.Key) seen[String(r.Key)] = true; });
  const todo = [];
  stt.rows.forEach(function (s) {
    if (!s.StudentID || key_(s.Active) === 'FALSE') return;
    const id = key_(s.StudentID), first = String(s.Name).split(' ')[0];
    const add = function (type, ref, msg) {
      const key = today + '|' + id + '|' + type + '|' + ref;
      if (seen[key]) return;
      seen[key] = true;
      todo.push({ s: s, type: type, msg: msg, key: key });
    };
    const hello = 'Assalaamu alaykum ' + first + '. ';
    const nd = iso_(s.NextDue);
    if (nd && String(s.PaymentStatus).trim().toLowerCase() !== 'exempt') {
      const d = dn_(nd) - now, fee = Number(s.MonthlyFee) ? ' (' + naira_(s.MonthlyFee) + ')' : '';
      if (PAYMENT_REMINDER_DAYS.indexOf(d) >= 0) {
        add('Payment due', nd + '/' + d, hello + 'A reminder that your fee' + fee + ' is due ' + when_(d) + ' (' + nice_(nd) + '). Pay by card here and your dashboard updates straight away: ' + payLink_(s.StudentID) + ' . If you pay by bank transfer, please send your receipt on WhatsApp. Jazakumullahu khayran.');
      } else if (d < 0 && (d === -1 || d === -3 || d === -7 || (d < -7 && d % 7 === 0))) {
        add('Payment overdue', nd + '/' + d, hello + 'Your fee' + fee + ' was due on ' + nice_(nd) + ' and is now ' + (-d) + ' day' + (d === -1 ? '' : 's') + ' overdue. Pay by card here: ' + payLink_(s.StudentID) + ' , or pay by transfer and send your receipt on WhatsApp. Message us if there is a problem.');
      }
    }
    const nc = iso_(s.NextClass, true);
    if (nc && CLASS_REMINDER_DAYS.indexOf(dn_(nc) - now) >= 0) {
      add('Class', nc, hello + 'Your next class is ' + when_(dn_(nc) - now) + ', ' + nice_(nc) + ' at ' + nc.slice(11) + '.' + (/^https?:\/\//i.test(String(s.ClassLink || '')) ? ' Join here: ' + s.ClassLink : ''));
    }
    assignmentsFor_(s, A, S).forEach(function (a) {
      if ((a.Status !== 'To do' && a.Status !== 'Overdue') || !a.Due) return;
      const d = dn_(a.Due) - now;
      if (ASSIGNMENT_REMINDER_DAYS.indexOf(d) >= 0) add('Assignment due', a.AssignmentID + '/' + d, hello + 'Your assignment "' + a.Title + '" is due ' + when_(d) + '. Please submit it on your dashboard: ' + DASHBOARD_URL);
      else if (d === -1) add('Assignment overdue', a.AssignmentID + '/late', hello + 'Your assignment "' + a.Title + '" was due yesterday and has not been submitted yet. Please submit it on your dashboard: ' + DASHBOARD_URL);
    });
  });
  if (!todo.length) return 0;
  const rows = todo.map(function (x) {
    const status = sendEmail_(x.s, SCHOOL_NAME + ': ' + x.type.toLowerCase() + ' reminder', x.msg);
    const cells = { Date: today, StudentID: x.s.StudentID, Name: x.s.Name, Type: x.type, Message: x.msg, WhatsAppLink: waLink_(x.s.WhatsApp, x.msg), EmailStatus: status, Done: '', Key: x.key };
    return R.head.map(function (h) { return cells[h] === undefined ? '' : cells[h]; });
  });
  R.sh.getRange(R.sh.getLastRow() + 1, 1, rows.length, R.head.length).setValues(rows);
  return rows.length;
}

function trimReminders_() {
  const t = table_('Reminders'), limit = dn_(today_()) - KEEP_REMINDER_DAYS;
  let n = 0;
  while (n < t.rows.length && t.rows[n].Date && dn_(iso_(t.rows[n].Date)) < limit) n++;
  if (n > 0) t.sh.deleteRows(2, n);
}

/* ===== AUTOMATION ===== */
function dailyJob() {
  applyPayments_();
  refreshStatuses_();
  runReminders_();
  if (typeof acd_dailyJob_ === 'function') { try { acd_dailyJob_(); } catch (e) { console.error(e); } }   // Academy.gs
  if (typeof sk_dailyJob_ === 'function') { try { sk_dailyJob_(); } catch (e) { console.error(e); } }     // Skills.gs
  if (typeof nl_dailyJob_ === 'function') { try { nl_dailyJob_(); } catch (e) { console.error(e); } }     // Newsletter.gs
  if (typeof rp_dailyJob_ === 'function') { try { rp_dailyJob_(); } catch (e) { console.error(e); } }     // monthly progress reports (Reports.gs)
  if (typeof rc_dailyJob_ === 'function') { try { rc_dailyJob_(); } catch (e) { console.error(e); } }     // term report cards still queued (ReportCards.gs)
  if (typeof tr_dailyJob_ === 'function') { try { tr_dailyJob_(); } catch (e) { console.error(e); } }     // trial class reminders and follow-ups (Trials.gs)
  trimReminders_();
}
function fillIds_(name, idField, prefix, needField) {
  const t = table_(name);
  t.rows.forEach(function (r) { if (r[needField] && !r[idField]) put_(t, r._row, idField, prefix + Utilities.getUuid().slice(0, 6).toUpperCase()); });
}
function onSheetEdit(e) {   // installed by installTriggers
  try {
    const name = e.range.getSheet().getName();
    if (name === 'Payments') { fillIds_('Payments', 'PaymentID', 'P-', 'StudentID'); applyPayments_(); }
    else if (name === 'Assignments') fillIds_('Assignments', 'AssignmentID', 'A-', 'Title');
    else { if (typeof credOnEdit_ === 'function') credOnEdit_(name); if (typeof ambOnEdit_ === 'function') ambOnEdit_(name); }   // Credentials.gs, Ambassadors.gs
  } catch (err) { console.error(err); }
}
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'dailyJob' || f === 'onSheetEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(REMINDER_HOUR).create();
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss_()).onEdit().create();
  try { ss_().toast('Automatic jobs installed.', SCHOOL_NAME); } catch (e) {}
}

/* ===== SETUP AND ADMIN MENU ===== */
function dropdown_(ss, name, field, list, strict) {
  const sh = ss.getSheetByName(name), c = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String).indexOf(field);
  if (c < 0) return;
  sh.getRange(2, c + 1, 998, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(!strict).build());
}
function setupSheets() {
  const ss = ss_();
  Object.keys(SHEETS).forEach(function (name) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name), want = SHEETS[name];
    const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    if (!have.some(Boolean)) sh.getRange(1, 1, 1, want.length).setValues([want]);
    else want.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h); } });
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  });
  dropdown_(ss, 'Students', 'PaymentStatus', ['Paid', 'Due', 'Overdue', 'Exempt'], false);
  dropdown_(ss, 'Payments', 'Status', ['Pending', 'Confirmed'], true);
  dropdown_(ss, 'Assignments', 'Active', ['TRUE', 'FALSE'], true);
  try { ss.toast('Tabs are ready. Next, run installTriggers once.', SCHOOL_NAME); } catch (e) {}
}
function testEmail() {
  const to = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(to, SCHOOL_NAME + ': test email', 'Assalaamu alaykum. This is a test from your dashboard script. Reminders will be sent the same way.');
  try { ss_().toast('Test email sent to ' + to, SCHOOL_NAME); } catch (e) {}
}
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Himaayah')
      .addItem('Set up or upgrade tabs', 'setupSheets')
      .addItem('Protect access codes (one time)', 'codesProtect')
      .addItem('Install automatic jobs', 'installTriggers')
      .addItem('Run the daily job now', 'dailyJob')
      .addItem('Set up the Admins tab', 'adminSetup')
      .addItem('Set up the Teenagers Circle tabs', 'tbcSetup')
      .addItem('Set up the Academy tabs', 'academySetup')
      .addItem('Set up the Skills School tabs', 'skillsSetup')
      .addItem('Set up the Library, Tracker and Quiz tabs', 'setupStudentTools')
      .addItem('Set up the Librarians tab', 'librarianSetup')
      .addItem('Set up the exam portal', 'examSetup')
      .addItem('Scholarship: email verified applicants the exam date', 'scholarshipEmailInvited')
      .addItem('Scholarship: rank the exam (top 20)', 'scholarshipRank')
      .addItem('Scholarship exam: mark unsubmitted attempts', 'scholarshipExamFinalise')
      .addItem('Email the waitlist (reopened plans)', 'emailWaitlist')
      .addItem('Email the waitlist automatically every day', 'setupWaitlistAuto')
      .addItem('Progress reports: send me a sample', 'reportSample')
      .addItem("Progress reports: send this month's now", 'reportsSendNow')
      .addItem('Term report cards: send me a sample', 'reportCardSample')
      .addItem('Term report cards: send to parents', 'reportCardsSend')
      .addItem('Set up the owner dashboard', 'ownerSetup')
      .addItem('Set up sponsorship tabs', 'sponsorSetup')
      .addItem('Set up the timetable', 'timetableSetup')
      .addItem('Set up trial classes', 'trialSetup')
      .addItem('Set up placement tests', 'placementSetup')
      .addItem('Send test codes (placement tests)', 'placementSendCodes')
      .addItem('Set up the Hadith Bootcamp', 'bootcampSetup')
      .addItem('Bootcamp: send missing logins', 'bootcampSendLogins')
      .addItem('Ask families for a testimonial', 'askForTestimonials')
      .addItem('Match card payments to enrolments', 'matchCardPayments')
      .addItem('Email referrers about payouts', 'emailReferralPayouts')
      .addItem('Set up the newsletter tabs', 'newsletterSetup')
      .addItem('Send me a test of the newsletter', 'newsletterTest')
      .addItem('Send ready newsletters', 'newsletterSend')
      .addItem('Send me a test email', 'testEmail')
      .addToUi();
  } catch (e) {}
}
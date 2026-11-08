/**
 * Himaayah Schools: automatic student accounts (Stage 1).
 * Add this file to the SAME Apps Script project as Code.gs. See SETUP-ENROL.md.
 *
 * Flow:  enroll.html  ->  "Enrolments" tab (Status: Receipt sent, or Awaiting card payment for card)
 *        staff check the receipt and set Status = Confirmed
 *        (card payments: CardPayments.gs confirms the row itself when the amount matches the plan)
 *        -> a Students row is created (next ID + random access code), a payment is logged,
 *           and the login details are emailed (to the student if 18+, otherwise to the parent/guardian).
 */

const EN_DASHBOARD_URL = 'https://www.himaayahschools.com/dashboard.html';
const EN_SCHOOL = 'Himaayah Schools';
const EN_TAB = 'Enrolments';
const EN_ID_PREFIX = 'HM-';
const EN_SCHOOL_WA = '2347047226487';   // the school's WhatsApp number, used for the student's "message us" button
const EN_STAFF_EMAILS = [];        // extra staff emails to alert when a new student pays (the script owner is always alerted)
const EN_ADULT_AGE = 18;
const EN_MAX_PER_HOUR = 8;       // new submissions allowed per email address per hour (retries of the same Ref don't count)
const EN_CLOSED_PLANS = ['Madrasah \u2014 Hifdh Only (Group)', 'Madrasah \u2014 Full Madrasah (Group)', 'Madrasah \u2014 Full Madrasah (Group, hifdh completed elsewhere)', 'Madrasah \u2014 One-Year Hifdh'];   // keep in step with enroll.html
const EN_INVITES = { 'Madrasah \u2014 One-Year Hifdh': 'HIFDH-1Y7K' };   // invite code that opens a closed plan for current students (keep in step with api/checkout.mjs)

const EN_OPENS = {};   // plan name -> 'YYYY-MM-DD' it opens (West Africa time). Before then it cannot be enrolled in. Keep in step with enroll.html and api/checkout.mjs. Example: { 'Skills School \u2014 Graphic Design': '2026-12-01' }

const EN_REG_FEE = 3000;   // one-time registration fee on the first payment (waived for invited returning students); keep in step with enroll.html and api/checkout.mjs

const EN_HEADERS = ['Ref', 'Submitted', 'Status', 'StudentName', 'DOB', 'Age', 'GradeLevel', 'Programme', 'Plan', 'Amount', 'Period', 'Periods',
  'KinName', 'KinRelationship', 'KinPhone', 'KinEmail', 'StudentEmail', 'LoginTo', 'LoginEmail', 'StudentID', 'AccountCreated', 'WhatsAppLink', 'Notes',
  'PayMethod', 'CardPayment', 'Referral', 'PaidUntil', 'RegFee', 'ProgrammeDetails'];

const EN_PLANS = {
  'Teenagers Building Circle \u2014 Full Programme': [40000, '/mo'],
  'Madrasah \u2014 Hifdh Only (Group)': [12000, '/mo'], 'Madrasah \u2014 Full Madrasah (Group)': [20000, '/mo'], 'Madrasah \u2014 Full Madrasah (Group, hifdh completed elsewhere)': [15000, '/mo'],
  'Madrasah \u2014 Hifdh Only (Personal)': [20000, '/mo'], 'Madrasah \u2014 Full Madrasah (Personal)': [35000, '/mo'],
  'Madrasah \u2014 One-Year Hifdh': [19000, '/mo'],
  'Madrasah \u2014 Muraajah (Group)': [14000, '/mo'], 'Madrasah \u2014 Muraajah (Personal)': [20000, '/mo'],
  'Academy \u2014 UTME': [10000, '/mo'], 'Academy \u2014 Post-UTME': [10000, '/mo'], 'Academy \u2014 A-Levels': [10000, '/mo'], 'Academy \u2014 O-Levels': [10000, '/mo'],
  'Skills School \u2014 Public Speaking': [25000, ''], 'Skills School \u2014 Graphic Design': [35000, ''], 'Skills School \u2014 Data Analysis': [80000, '/2mo'],
};

/* ------------------------------------------------------------------ */
/* 1. Receive an enrolment from enroll.html (called from doPost)       */
/* ------------------------------------------------------------------ */
function enrolFromRequest(req) {
  try {
    if (String(req.website || '').trim()) return { ok: true };                 // honeypot: bots fill this in
    const d = {
      ref: en_str(req.ref, 20).toUpperCase(), name: en_str(req.studentName, 120), dob: en_str(req.dob, 12), grade: en_str(req.gradeLevel, 60),
      programme: en_str(req.programme, 60), plan: en_str(req.plan, 120), kinName: en_str(req.kinName, 120), kinRel: en_str(req.kinRelationship, 30),
      kinPhone: en_str(req.kinPhone, 30), kinEmail: en_str(req.kinEmail, 120).toLowerCase(), studentEmail: en_str(req.studentEmail, 120).toLowerCase(),
    };
    const mail = /^\S+@\S+\.\S+$/;
    if (!/^ENR-[A-Z0-9]{4,12}$/.test(d.ref)) return { ok: false, error: 'Bad reference.' };
    if (!d.name || !d.kinName || !d.kinPhone || !mail.test(d.kinEmail)) return { ok: false, error: 'Missing details.' };
    if (d.studentEmail && !mail.test(d.studentEmail)) return { ok: false, error: 'Bad student email.' };
    const plan = EN_PLANS[d.plan];
    if (!plan) return { ok: false, error: 'Unknown plan.' };
    const invited = EN_INVITES[d.plan] && en_str(req.invite, 30).toUpperCase() === EN_INVITES[d.plan];
    if (EN_CLOSED_PLANS.indexOf(d.plan) >= 0 && !invited) return { ok: false, error: 'Admission for this plan is closed.' };

    if (EN_OPENS[d.plan] && Utilities.formatDate(new Date(), 'Africa/Lagos', 'yyyy-MM-dd') < EN_OPENS[d.plan]) return { ok: false, error: 'This programme has not opened yet. It opens on ' + EN_OPENS[d.plan] + '.' };

    const periods = plan[1] === '/mo' && req.payMethod !== 'Already paid' && [1, 2, 3, 6, 12].indexOf(Number(req.periods)) >= 0 ? Number(req.periods) : 1;   // months paid ahead (monthly plans only); keep in step with enroll.html and api/checkout.mjs
    const card = req.payMethod === 'Card';
    const prepaid = req.payMethod === 'Already paid';                                   // current student who paid before the website (invite link only)
    let paidUntil = '';
    if (prepaid) {
      if (!invited) return { ok: false, error: 'Please choose card or bank transfer.' };
      paidUntil = en_str(req.paidUntil, 10);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paidUntil), now = new Date();
      const due = m ? new Date(+m[1], +m[2] - 1, +m[3]) : null, days = due ? (due - now) / 86400000 : NaN;
      if (!(days > -8 && days < 71)) return { ok: false, error: 'Enter the date your next fee is due (within the next two months).' };
    }
    const cache = CacheService.getScriptCache(), key = 'enrol_' + d.kinEmail;
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const sh = en_sheet();
      if (en_findRow(sh, 'Ref', d.ref)) return { ok: true, ref: d.ref };       // already recorded (page retried)
      const n = Number(cache.get(key) || 0);
      if (n >= EN_MAX_PER_HOUR) return { ok: false, error: 'Too many submissions from this email. Please wait an hour and try again.' };
      cache.put(key, String(n + 1), 3600);
      const referral = typeof ref_forEnrolment_ === 'function' && req.referral ? ref_forEnrolment_(en_str(req.referral, 20), d) : '';   // Referrals.gs
      if (referral && en_headers(sh).indexOf('Referral') < 0) sh.getRange(1, sh.getLastColumn() + 1).setValue('Referral').setFontWeight('bold');
      if (en_headers(sh).indexOf('RegFee') < 0) sh.getRange(1, sh.getLastColumn() + 1).setValue('RegFee').setFontWeight('bold');
      if (prepaid && en_headers(sh).indexOf('PaidUntil') < 0) sh.getRange(1, sh.getLastColumn() + 1).setValue('PaidUntil').setFontWeight('bold');
      const details = Array.isArray(req.extra) ? req.extra.slice(0, 16).filter(p => Array.isArray(p)).map(p => en_str(p[0], 70) + ': ' + en_str(p[1], 220)).join(' | ') : '';   // programme-specific answers from the enrol form
      if (en_headers(sh).indexOf('Periods') < 0) sh.getRange(1, sh.getLastColumn() + 1).setValue('Periods').setFontWeight('bold');
      if (details && en_headers(sh).indexOf('ProgrammeDetails') < 0) sh.getRange(1, sh.getLastColumn() + 1).setValue('ProgrammeDetails').setFontWeight('bold');
      const regpass = en_str(req.regpass, 30).toUpperCase();                  // test code: the registration fee was already paid (PlacementTests.gs)
      const passPaid = !invited && regpass && typeof pt_passRedeem_ === 'function' && pt_passRedeem_(regpass, d.ref, true);
      const age = en_age(d.dob), adult = age !== null && age >= EN_ADULT_AGE;
      const loginTo = adult && d.studentEmail ? d.studentEmail : d.kinEmail;
      en_append(sh, {
        Ref: d.ref, Submitted: en_stamp(new Date()), Status: card ? 'Awaiting card payment' : prepaid ? 'Already paid (check)' : 'Receipt sent', PayMethod: card ? 'Card' : prepaid ? 'Paid before website' : 'Bank transfer', PaidUntil: paidUntil, StudentName: d.name, DOB: d.dob, Age: age === null ? '' : age, GradeLevel: d.grade,
        RegFee: (invited || passPaid) ? 0 : EN_REG_FEE, Programme: d.programme, Plan: d.plan, Amount: plan[0], Period: plan[1], Periods: periods, KinName: d.kinName, KinRelationship: d.kinRel, KinPhone: d.kinPhone,
        KinEmail: d.kinEmail, StudentEmail: d.studentEmail, LoginTo: adult ? 'Student (18+)' : 'Parent or guardian', LoginEmail: loginTo, Referral: referral, ProgrammeDetails: details, Notes: invited ? 'Returning student (invite link)' + (prepaid ? '. Says the fee was paid before the website; next due ' + paidUntil + '. Check the old payment, then set Status to Confirmed.' : '') : (passPaid ? 'Registration fee already paid with test code ' + regpass : ''),
      });
    } finally { lock.releaseLock(); }
    if (card && typeof card_rematch_ === 'function') { try { card_rematch_(d.ref); } catch (e) { console.error(e); } }   // payment arrived first (CardPayments.gs)
    return { ok: true, ref: d.ref };
  } catch (err) {
    return { ok: false, error: 'Could not save the enrolment.' };
  }
}

/* ------------------------------------------------------------------ */
/* 2. Staff set Status = Confirmed  ->  create the account             */
/* ------------------------------------------------------------------ */
function onEditEnrol(e) {                                // installable "on edit" trigger (made by setupEnrolments)
  try {
    const r = e && e.range; if (!r) return;
    const sh = r.getSheet(); if (sh.getName() !== EN_TAB || r.getRow() < 2) return;
    const col = en_headers(sh).indexOf('Status') + 1;
    if (r.getColumn() === col && r.getNumRows() === 1 && String(e.value) === 'Confirmed') en_createAccount(sh, r.getRow());
  } catch (err) { /* never block the sheet */ }
}

/** Safety net: run from the menu or the editor to process every row marked Confirmed that has no account yet. */
function processConfirmedEnrolments() {
  const sh = en_sheet(), head = en_headers(sh), last = sh.getLastRow();
  let made = 0;
  for (let row = 2; row <= last; row++) {
    const status = String(sh.getRange(row, head.indexOf('Status') + 1).getValue()).trim();
    const id = String(sh.getRange(row, head.indexOf('StudentID') + 1).getValue()).trim();
    if (status === 'Confirmed' && !id) { en_createAccount(sh, row); made++; }
  }
  return made;
}

function en_createAccount(sh, row) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const head = en_headers(sh), get = h => head.indexOf(h) < 0 ? '' : String(sh.getRange(row, head.indexOf(h) + 1).getValue()).trim();
    const set = (h, v) => { if (head.indexOf(h) >= 0) sh.getRange(row, head.indexOf(h) + 1).setValue(v); };
    if (get('StudentID')) return;                                             // never create twice
    const plan = EN_PLANS[get('Plan')];
    if (!plan) { set('Notes', 'Unknown plan: cannot create account'); return; }

    const unit = plan[0], per = plan[1];
    const periods = per === '/mo' ? (Number(get('Periods')) || 1) : 1;                  // months paid ahead on the first payment
    const amount = unit * periods;                                                      // what was actually paid for the programme (registration fee not included)
    const months = (per === '/mo' ? 1 : per === '/2mo' ? 2 : 0) * periods;
    const today = new Date(), prepaid = get('PayMethod') === 'Paid before website';
    const paidUntil = /^\d{4}-\d{2}-\d{2}$/.test(get('PaidUntil')) ? get('PaidUntil') : '';   // staff can correct this date before confirming
    const nextDue = prepaid && paidUntil ? paidUntil : months ? en_date(en_addMonths(today, months)) : '';
    const programme = get('Programme'), planShort = get('Plan').split('\u2014').pop().trim();
    const phone = get('KinPhone').replace(/\D/g, '').replace(/^0/, '234');
    const method = get('CardPayment') ? 'Card' : prepaid ? 'Paid before website' : 'Bank transfer';
    const info = { name: get('StudentName'), plan: get('Plan'), amount: amount, unit: unit, months: months, email: get('LoginEmail'), phone: phone, ref: get('Ref'), method: method };
    let id, code, dash = EN_DASHBOARD_URL;

    if (programme === 'Academy' && typeof acd_createAccount_ === 'function') {          // Academy.gs
      const r = acd_createAccount_(info); id = r.id; code = r.code; dash = ACD_DASHBOARD_URL;
    } else if (programme === 'Skills School' && typeof sk_createAccount_ === 'function') {   // Skills.gs
      const r = sk_createAccount_(info); id = r.id; code = r.code; dash = SK_DASHBOARD_URL;
    } else {
      const students = en_book().getSheetByName('Students');
      if (!students) { set('Notes', 'Students tab not found'); return; }
      id = en_nextId(students); code = en_code();
      const level = programme === 'Madrasah' ? 'Awaiting placement' : programme;
      en_append(students, {
        StudentID: id, Name: get('StudentName'), AccessCode: code, Level: level, Plan: planShort, Teacher: '', PaymentStatus: 'Paid', NextDue: nextDue,
        AttendancePresent: 0, AttendanceTotal: 0, NextClass: '', ClassLink: '', Juz: 0, CurrentSurah: '', CurrentAyah: '', Active: 'TRUE',
        Email: get('LoginEmail'), WhatsApp: phone, MonthlyFee: per === '/mo' ? unit : '',
      });
      const pay = en_book().getSheetByName('Payments');                         // payment history (skipped if the tab is missing)
      if (pay) en_append(pay, { PaymentID: 'P-' + Utilities.getUuid().slice(0, 6).toUpperCase(), StudentID: id, Date: en_date(today), Amount: amount, Months: months || 1, Reference: get('Ref'), Method: method, Status: 'Confirmed', Applied: (prepaid ? 'Paid before website, recorded ' : 'New enrolment ') + en_stamp(today) });
    }

    const toStudent = get('LoginTo').indexOf('Student') === 0;
    const msg = en_message(get('StudentName'), id, code, planShort, toStudent, programme, dash);
    let note = '';
    try {
      MailApp.sendEmail({ to: get('LoginEmail'), subject: 'Your ' + EN_SCHOOL + ' student login', htmlBody: msg.html, body: msg.text, name: EN_SCHOOL });
    } catch (mailErr) { note = 'Email failed: ' + mailErr.message + ' (send the WhatsApp link instead)'; }
    en_alertStaff_(get('StudentName'), id, programme, planShort, phone, get('LoginEmail'), method, get('Ref'), get('KinName'));
    if (get('Referral') && typeof ref_award_ === 'function') { const rn = ref_award_(get('Referral'), info, get('Ref'), programme); if (rn) note = note ? note + ' · ' + rn : rn; }   // Referrals.gs
    if (typeof cr_mark_ === 'function') cr_mark_(programme === 'Academy' ? 'AcademyStudents' : programme === 'Skills School' ? 'SkillsStudents' : 'Students', id, 'Emailed (enrolment)');   // Credentials.gs
    set('StudentID', id); set('AccountCreated', en_stamp(today)); set('Status', 'Account created');
    set('WhatsAppLink', phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg.text) : '');
    set('Notes', note);
  } catch (err) {
    try { sh.getRange(row, en_headers(sh).indexOf('Notes') + 1).setValue('Error: ' + err.message); } catch (e2) {}
  } finally { lock.releaseLock(); }
}

/** wa.me link to the school, with the student's details already typed in. */
function en_schoolWa_(name, id, plan, programme) {
  const text = 'Assalaamu alaykum. I have just paid and received my login. Student: ' + name + ' (' + id + '), ' + programme + ', ' + plan + '. Please assign my teacher and share the class details. Jazakumullahu khayran.';
  return 'https://wa.me/' + EN_SCHOOL_WA + '?text=' + encodeURIComponent(text);
}

/** Tells staff a new student has paid and still needs a teacher/placement. Never blocks account creation. */
function en_alertStaff_(name, id, programme, plan, phone, email, method, ref, parent) {
  try {
    const to = [Session.getEffectiveUser().getEmail()].concat(EN_STAFF_EMAILS).filter(String).filter((v, i, a) => a.indexOf(v) === i).join(',');
    if (!to) return;
    const wa = phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent('Assalaamu alaykum. This is ' + EN_SCHOOL + '. We have received payment for ' + name + ' (' + id + ', ' + plan + '). We are assigning a teacher and will share the details shortly.') : '(no phone given)';
    MailApp.sendEmail({ to: to, name: EN_SCHOOL, subject: 'New paid student needs a teacher: ' + name + ' (' + id + ')',
      body: ['A new student has paid and now has a login.', '', 'Student: ' + name + ' (' + id + ')', 'Programme: ' + programme, 'Plan: ' + plan, 'Paid by: ' + method + (ref ? ' (ref ' + ref + ')' : ''),
        'Contact: ' + (parent || '') + ' ' + (phone ? '+' + phone : '') + ' ' + (email || ''), '',
        'To do: assign a teacher in the Students tab (Teacher column), then message them:', wa].join('\n') });
  } catch (e) {}
}

function en_message(name, id, code, plan, toStudent, programme, dash) {
  dash = dash || EN_DASHBOARD_URL;
  const waLink = en_schoolWa_(name, id, plan, programme);
  const madrasah = programme === 'Madrasah';
  const hello = toStudent ? 'Assalaamu alaykum ' + name.split(' ')[0] + ',' : 'Assalaamu alaykum,';
  const lines = [
    hello, '',
    'Welcome to ' + EN_SCHOOL + '. Your payment has been confirmed and ' + (toStudent ? 'you are' : name + ' is') + ' now enrolled on the ' + plan + ' plan.', '',
    (toStudent ? 'Your' : 'The student\u2019s') + ' dashboard login:',
    'Student ID: ' + id, 'Access code: ' + code, 'Sign in at: ' + dash, '',
    madrasah ? 'A teacher will arrange a short placement conversation to confirm the starting level, then share the class timetable.'
      : programme === 'Academy' ? 'Your tutor will be in touch to agree class times. Your dashboard shows your mock results, reading club, classes and payments.'
      : programme === 'Skills School' ? 'Your tutor will be in touch with your start date and class times. Your dashboard shows your course progress, projects, classes and payments.'
      : 'Your teacher will share the class timetable and join link soon.',
    '', 'Please keep the access code private.', '',
    'Tap this link to message the school on WhatsApp (your details are already filled in): ' + waLink, '',
    'Know someone who would benefit? Share your own referral link and earn 10% of their fee: https://www.himaayahschools.com/refer.html', '', 'Jazakumullahu khayran,', EN_SCHOOL,
  ];
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0E2A3D;max-width:520px">' +
    lines.map(l => l === '' ? '<br>' : l.indexOf('Tap this link to message') === 0 ? '<a href="' + waLink + '" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Message the school on WhatsApp</a><br><span style="font-size:13px;color:#5B6E7F">Your name, Student ID and plan are already filled in. Just tap Send.</span>' : esc(l).replace(/(Student ID|Access code): (.*)/, '$1: <b style="font-size:17px;color:#094570">$2</b>').replace(dash, '<a href="' + dash + '">' + dash + '</a>')).join('<br>') + '</div>';
  return { text: lines.join('\n'), html: html };
}

/* ------------------------------------------------------------------ */
/* 3. One-time setup: run setupEnrolments() from the editor            */
/* ------------------------------------------------------------------ */
function setupEnrolments() {
  const ss = en_book();
  const sh = ss.getSheetByName(EN_TAB) || ss.insertSheet(EN_TAB);
  sh.getRange(1, 1, 1, EN_HEADERS.length).setValues([EN_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const col = EN_HEADERS.indexOf('Status') + 1;
  sh.getRange(2, col, 1000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Receipt sent', 'Awaiting card payment', 'Card paid', 'Already paid (check)', 'Confirmed', 'Account created', 'Rejected', 'Refunded'], true).build());
  const has = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'onEditEnrol');
  if (!has) ScriptApp.newTrigger('onEditEnrol').forSpreadsheet(ss).onEdit().create();
  return 'Enrolments tab ready' + (has ? '' : ' and trigger installed');
}

/* ------------------------- helpers (en_ prefix) ---------------------- */
function en_book() { return typeof ss_ === 'function' ? ss_() : SpreadsheetApp.getActive(); }   // ss_() is Code.gs's own opener, so SHEET_ID is respected
function en_tz() { return typeof tz_ === 'function' ? tz_() : Session.getScriptTimeZone(); }
function en_sheet() { const s = en_book().getSheetByName(EN_TAB); if (!s) throw new Error('Run setupEnrolments first'); return s; }
function en_headers(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim()); }
function en_str(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function en_stamp(d) { return Utilities.formatDate(d, en_tz(), 'yyyy-MM-dd HH:mm'); }
function en_date(d) { return Utilities.formatDate(d, en_tz(), 'yyyy-MM-dd'); }
function en_addMonths(d, n) { const r = new Date(d.getTime()), day = r.getDate(); r.setMonth(r.getMonth() + n); if (r.getDate() !== day) r.setDate(0); return r; }
function en_age(dob) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob); if (!m) return null;
  const b = new Date(+m[1], +m[2] - 1, +m[3]), t = new Date();
  let a = t.getFullYear() - b.getFullYear(); if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}
function en_findRow(sh, header, value) {
  const c = en_headers(sh).indexOf(header) + 1, last = sh.getLastRow(); if (c < 1 || last < 2) return 0;
  const v = sh.getRange(2, c, last - 1, 1).getValues();
  for (let i = 0; i < v.length; i++) if (String(v[i][0]).trim() === value) return i + 2;
  return 0;
}
function en_nextId(students) {
  const head = en_headers(students), c = head.indexOf('StudentID') + 1, last = students.getLastRow();
  let max = 0;
  if (last > 1) students.getRange(2, c, last - 1, 1).getValues().forEach(r => { const m = new RegExp('^' + EN_ID_PREFIX + '(\\d+)$', 'i').exec(String(r[0]).trim()); if (m) max = Math.max(max, +m[1]); });
  return EN_ID_PREFIX + String(max + 1).padStart(4, '0');
}
function en_code() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';       // no 0/O/1/I so codes are easy to read out
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now() + Math.random());
  let s = ''; for (let i = 0; i < 6; i++) s += A.charAt((bytes[i] & 255) % A.length);
  return s;
}
/** Append a row by header name. Text-like columns are stored as plain text so nothing is parsed as a formula or date. */
function en_append(sh, obj) {
  const head = en_headers(sh), r = sh.getLastRow() + 1, numeric = ['Amount', 'Months', 'Age', 'AttendancePresent', 'AttendanceTotal', 'Juz', 'MonthlyFee'];
  head.forEach((h, i) => { if (numeric.indexOf(h) < 0) sh.getRange(r, i + 1).setNumberFormat('@'); });
  sh.getRange(r, 1, 1, head.length).setValues([head.map(h => Object.prototype.hasOwnProperty.call(obj, h) ? (h === 'AccessCode' ? code_store_(obj[h]) : obj[h]) : '')]);
  return r;
}
/**
 * Himaayah Reminders for the daily routine and recitations (Nudges.gs)
 *
 * Add this as a NEW file next to Code.gs, Teacher.gs, Recordings.gs and Routine.gs. Every name starts with "ng" or "NG_".
 * Uses Code.gs helpers (ss_, table_, iso_, today_, key_, dn_, nice_, sendEmail_, waLink_, validEmail_),
 * Teacher.gs (tchSplit_, tchAdmin_) and Routine.gs (rt_eligible_, rt_kind_, rt_ids_, rt_full_).
 *
 * What it does
 *   Evening (NG_EVENING_HOUR): every Madrasah student with the routine card who has not started today's routine
 *   gets a short, kind reminder by email, worded around their streak if they have one. A student who has started
 *   but not finished, and has a streak of 2 days or more, is reminded to finish so the streak is kept.
 *   After NG_STOP_AFTER reminders in a row with no ticks, the reminders pause until the student ticks again,
 *   so nobody is emailed every night for weeks.
 *   Morning (NG_MORNING_HOUR): every teacher with recitations waiting longer than NG_WAIT_DAYS gets one email listing
 *   them. Recordings from students with no teacher in the Students tab go to the admins (Role = Admin).
 *   Every reminder is also written to the Reminders tab, with a ready-to-send WhatsApp link where there is a number.
 *
 * Setup (once): run setupNudges from the editor. It installs the two daily triggers. Run it again after changing the hours.
 * Try it first with testNudges: it lists who WOULD get a reminder today, without sending anything.
 */

/* ===== SETTINGS ===== */
const NG_EVENING_HOUR = 19;          // student routine reminders, around 7 pm (script time zone)
const NG_MORNING_HOUR = 7;           // teacher recitation reminders, around 7 am
const NG_STUDENTS_ON = true;         // set false to stop the student reminders
const NG_TEACHERS_ON = true;         // set false to stop the teacher reminders
const NG_STUDENT_EMAIL = true;       // set false to only fill the Reminders tab (no student emails), e.g. if the email quota is tight
const NG_STOP_AFTER = 5;             // pause a student's reminders after this many in a row with no ticks
const NG_WAIT_DAYS = 2;              // a recording waiting longer than this many days is "late" for the teacher
const NG_SKIP_DAYS = [];             // days with no student reminders, e.g. [5] for Friday (0 = Sunday ... 6 = Saturday)
const NG_TEACHER_URL = 'https://www.himaayahschools.com/teacher';
const NG_TYPE_STUDENT = 'Routine reminder';
const NG_TYPE_TEACHER = 'Recitations to mark';

/* ===== SETUP ===== */
function setupNudges() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'ngEveningJob' || f === 'ngMorningJob') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ngEveningJob').timeBased().everyDays(1).atHour(NG_EVENING_HOUR).create();
  ScriptApp.newTrigger('ngMorningJob').timeBased().everyDays(1).atHour(NG_MORNING_HOUR).create();
  try { ss_().toast('Reminders installed: students around ' + NG_EVENING_HOUR + ':00, teachers around ' + NG_MORNING_HOUR + ':00.', SCHOOL_NAME); } catch (e) {}
}
/* Lists who would get a reminder today, without sending or saving anything. See View > Execution log. */
function testNudges() {
  const s = ng_studentList_(), t = ng_teacherList_(), out = [];
  out.push('STUDENTS who would get a routine reminder tonight (' + s.length + '):');
  s.forEach(function (x) { out.push('  ' + x.s.StudentID + ' · ' + x.s.Name + ' · ' + (validEmail_(x.s.Email) ? x.s.Email : 'no email') + ' · ' + x.msg); });
  out.push('', 'TEACHERS who would get a recitations reminder (' + t.length + '):');
  t.forEach(function (x) { out.push('  ' + x.t.Name + ' · ' + (validEmail_(x.t.Email) ? x.t.Email : 'no email') + ' · ' + x.n + ' waiting'); });
  out.push('', 'Emails left today on this account: ' + MailApp.getRemainingDailyQuota());
  console.log(out.join('\n'));
  return out.join('\n');
}

/* ===== JOBS (run by the triggers) ===== */
function ngEveningJob() {
  if (!NG_STUDENTS_ON || NG_SKIP_DAYS.indexOf(new Date().getDay()) >= 0) return 0;
  return ng_save_(ng_studentList_(), function (x) {
    const email = NG_STUDENT_EMAIL ? sendEmail_(x.s, x.subject, x.msg + '\n\nOpen your routine: ' + DASHBOARD_URL + '#routine') : 'Off';
    return { StudentID: x.s.StudentID, Name: x.s.Name, Type: NG_TYPE_STUDENT, Message: x.msg, WhatsAppLink: waLink_(x.s.WhatsApp, x.msg + ' ' + DASHBOARD_URL), EmailStatus: email, Key: x.key };
  });
}
function ngMorningJob() {
  if (!NG_TEACHERS_ON) return 0;
  return ng_save_(ng_teacherList_(), function (x) {
    const email = sendEmail_({ Email: x.t.Email }, x.subject, x.msg + '\n\nOpen your dashboard: ' + NG_TEACHER_URL);
    return { StudentID: String(x.t.TeacherID || ''), Name: x.t.Name, Type: NG_TYPE_TEACHER, Message: x.msg, WhatsAppLink: x.t.WhatsApp ? waLink_(x.t.WhatsApp, x.msg + ' ' + NG_TEACHER_URL) : '', EmailStatus: email, Key: x.key };
  });
}
function ng_save_(list, build) {
  if (!list.length) return 0;
  const R = table_('Reminders'), today = today_();
  const rows = list.map(function (x) {
    const cells = Object.assign({ Date: today, Done: '' }, build(x));
    return R.head.map(function (h) { return cells[h] === undefined ? '' : cells[h]; });
  });
  R.sh.getRange(R.sh.getLastRow() + 1, 1, rows.length, R.head.length).setValues(rows);
  return rows.length;
}

/* ===== WHO GETS A STUDENT REMINDER ===== */
function ng_studentList_() {
  const today = today_();
  const R = table_('Reminders'), seen = {}, sentDays = {};
  R.rows.forEach(function (r) {
    if (r.Key) seen[String(r.Key)] = true;
    if (String(r.Type) === NG_TYPE_STUDENT && r.StudentID) (sentDays[key_(r.StudentID)] = sentDays[key_(r.StudentID)] || []).push(dn_(iso_(r.Date)));
  });
  const byStudent = {};
  if (ss_().getSheetByName(RT_TAB)) table_(RT_TAB).rows.forEach(function (r) {
    if (!r.StudentID || !r.Date) return;
    (byStudent[key_(r.StudentID)] = byStudent[key_(r.StudentID)] || {})[dn_(iso_(r.Date))] = r;
  });
  const out = [];
  table_('Students').rows.forEach(function (s) {
    if (!s.StudentID || key_(s.Active) === 'FALSE' || !rt_eligible_(s)) return;
    const id = key_(s.StudentID), key = today + '|' + id + '|' + NG_TYPE_STUDENT;
    if (seen[key]) return;
    const now = dn_(todayIn_(s.Timezone));                                // the student's own "today" (their time zone, if known)
    const days = byStudent[id] || {}, t = days[now], ticked = t ? rt_ids_(t.Done).length : 0;
    if (t && rt_full_(t)) return;                                         // finished today
    let streak = 0, d = now - 1;                                         // full days in a row up to yesterday
    while (days[d] && rt_full_(days[d])) { streak++; d--; }
    if (ticked > 0 && streak < 2) return;                                 // started today, and no real streak at stake
    // pause after NG_STOP_AFTER reminders in a row with no ticks since
    const ticks = Object.keys(days).map(Number).filter(function (n) { return rt_ids_(days[n].Done).length > 0; });
    const lastTick = ticks.length ? Math.max.apply(null, ticks) : -1;
    const since = (sentDays[id] || []).filter(function (n) { return n > lastTick && n < now; }).length;
    if (ticked === 0 && since >= NG_STOP_AFTER) return;
    const first = String(s.Name || '').trim().split(' ')[0] || 'dear student', what = rt_kind_(s) === 'muraajah' ? 'revision routine' : 'hifdh routine';
    let msg, subject;
    if (ticked > 0) {
      subject = 'Finish today’s routine to keep your ' + streak + '-day streak';
      msg = 'Assalaamu alaykum ' + first + '. You have started today’s ' + what + ' (' + ticked + ' step' + (ticked === 1 ? '' : 's') + ' done). Finish the rest tonight to keep your ' + streak + '-day streak going, in sha Allah.';
    } else if (streak >= 1) {
      subject = 'Keep your ' + streak + '-day streak going';
      msg = 'Assalaamu alaykum ' + first + '. You are on a ' + streak + '-day streak, ma sha Allah. You have not started today’s ' + what + ' yet. There is still time tonight, even a short sitting with the Qur’an keeps you on track.';
    } else {
      subject = 'Your ' + what + ' for today';
      msg = 'Assalaamu alaykum ' + first + '. A gentle reminder: you have not started today’s ' + what + ' yet. Even a short sitting with the Qur’an tonight keeps your hifdh firm. May Allah make it easy for you.';
    }
    out.push({ s: s, key: key, subject: SCHOOL_NAME + ': ' + subject, msg: msg });
  });
  return out;
}

/* ===== WHO GETS A TEACHER REMINDER ===== */
function ng_teacherList_() {
  if (!ss_().getSheetByName(REC_TAB) || !ss_().getSheetByName('Teachers')) return [];
  const today = today_(), now = dn_(today), seen = {};
  table_('Reminders').rows.forEach(function (r) { if (r.Key) seen[String(r.Key)] = true; });
  const students = {};
  table_('Students').rows.forEach(function (s) { if (s.StudentID) students[key_(s.StudentID)] = s; });
  const late = table_(REC_TAB).rows.filter(function (r) {
    return r.RecID && !String(r.Result || '').trim() && r.Submitted && now - dn_(iso_(r.Submitted)) > NG_WAIT_DAYS && students[key_(r.StudentID)];
  });
  if (!late.length) return [];
  const teachers = table_('Teachers').rows.filter(function (t) { return t.TeacherID && key_(t.Active) !== 'FALSE'; });
  const out = [];
  teachers.forEach(function (t) {
    const key = today + '|' + key_(t.TeacherID) + '|' + NG_TYPE_TEACHER;
    if (seen[key]) return;
    const admin = tchAdmin_(t);
    const mine = late.filter(function (r) {
      const s = students[key_(r.StudentID)];
      const named = tchSplit_(s.Teacher).some(function (p) { return key_(p) === key_(t.Name) || key_(p) === key_(t.TeacherID); });
      return named || (admin && !String(s.Teacher || '').trim());       // own students, and for admins also students with no teacher
    });
    if (!mine.length) return;
    mine.sort(function (a, b) { return iso_(a.Submitted) < iso_(b.Submitted) ? -1 : 1; });
    const lines = mine.slice(0, 15).map(function (r) {
      const s = students[key_(r.StudentID)], d = now - dn_(iso_(r.Submitted));
      return '• ' + s.Name + ': ' + (r.Portion || r.Surah) + ' (' + r.Type + '), sent ' + nice_(iso_(r.Submitted)) + ', ' + d + ' days ago';
    });
    if (mine.length > 15) lines.push('• and ' + (mine.length - 15) + ' more');
    const first = String(t.Name || '').trim().split(' ')[0] || 'Ustadh';
    const unassigned = mine.filter(function (r) { return !String(students[key_(r.StudentID)].Teacher || '').trim(); }).length;
    const msg = 'Assalaamu alaykum ' + first + '. You have ' + mine.length + ' recitation' + (mine.length === 1 ? '' : 's') + ' that have been waiting more than ' + NG_WAIT_DAYS + ' days' +
      (unassigned ? ' (' + unassigned + ' from students with no teacher in the Students tab: please assign them)' : '') + ':\n' + lines.join('\n') + '\n\nStudents are waiting for your mark and comment. Jazakumullahu khayran.';
    out.push({ t: t, n: mine.length, key: key, subject: SCHOOL_NAME + ': ' + mine.length + ' recitation' + (mine.length === 1 ? '' : 's') + ' waiting for you', msg: msg });
  });
  return out;
}

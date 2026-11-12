/**
 * Himaayah Academy backend (UTME, Post-UTME, A-Levels, O-Levels)
 *
 * Serves the three Academy portals on the website:
 *   academy-dashboard.html  students   acd_login, acd_reading, acd_task, acd_cbt_start, acd_cbt_submit, acd_cbt_review
 *   academy-tutor.html      mentors    acdt_login, acdt_mock, acdt_goals, acdt_class, acdt_password, acdt_attendance,
 *                                      acdt_task, acdt_task_close, acdt_mark, acdt_cbt, acdt_cbt_close, acdt_student
 *   academy-admin.html      admins     acda_login, acda_payment, acda_assign, acda_password, acda_student_save,
 *                                      acda_student_remove, acda_student_restore, acda_student_code, acda_tutor_save,
 *                                      acda_tutor_remove, acda_tutor_code, acda_group_save, acda_student
 *
 * Add this file to the SAME Apps Script project as Code.gs (it uses Code.gs helpers:
 * ss_, table_, put_, append_, iso_, today_, dn_, addMonths_, nice_, naira_, same_,
 * matches_, payStatus_, key_, sendEmail_, waLink_, dropdown_) and Enrol.gs (en_code).
 *
 * SETUP (once, and again after updating this file): Himaayah menu → Set up the Academy tabs.
 * Missing tabs and columns are also added automatically the first time they are needed.
 *
 * Students sign in with their Student ID (AC-0001) or their matric number, plus their access code.
 * Class links (Google Meet and Telegram, per class group) only show while fees are not overdue.
 */

/* ===== SETTINGS ===== */
const ACD_DASHBOARD_URL = 'https://www.himaayahschools.com/academy-dashboard.html';
const ACD_ID_PREFIX = 'AC-';
const ACD_TUTOR_PREFIX = 'AT-';
const ACD_READING_UNIT = 'pages';
const ACD_GROUPS = ['Batch 1', 'Batch 2'];    // class groups offered in the admin portal (any group already used is added too)
const ACD_MOCK_TYPES = ['Daily mock', 'Weekly mock', 'Sunday mock'];
const ACD_SUBJECTS = ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Government', 'Literature', 'CRS/IRS', 'Geography', 'Commerce', 'Accounting', 'Further Mathematics', 'Agricultural Science'];
const ACD_PAYMENT_REMINDER_DAYS = [7, 3, 0];
const ACD_ATTENDANCE = ['Present', 'Late', 'Absent', 'Excused'];
const ACD_TEST_KINDS = ['Practice', 'Sunday mock'];
const ACD_LEADERBOARD_DAYS = 30;              // the leaderboard counts the last 30 days
const ACD_LEADERBOARD_SIZE = 10;
// Leaderboard weights (any part with no data yet is left out and the rest are scaled up)
const ACD_WEIGHTS = { mocks: 35, tasks: 25, attendance: 20, cbt: 10, reading: 10 };

/* ===== TABS AND COLUMNS ===== */
const ACD = {
  Students: 'AcademyStudents', Tutors: 'AcademyTutors', Admins: 'AcademyAdmins', Mocks: 'AcademyMocks', Reading: 'AcademyReading',
  Payments: 'AcademyPayments', Announcements: 'AcademyAnnouncements', Attendance: 'AcademyAttendance', Tasks: 'AcademyTasks',
  TaskSubs: 'AcademyTaskSubmissions', Tests: 'AcademyTests', Questions: 'AcademyQuestions', Attempts: 'AcademyAttempts', Groups: 'AcademyGroups',
  Families: 'AcademyFamilies', Posts: 'AcademyFamilyPosts', Sessions: 'AcademySessions', MockBank: 'AcademyMockBank'
};
const ACD_SHEETS = {
  AcademyStudents: ['StudentID', 'Matric', 'Name', 'AccessCode', 'Track', 'Group', 'Family', 'TutorID', 'PaymentStatus', 'NextDue', 'MonthlyFee', 'ExamDate', 'TargetPercent', 'NextClass', 'ClassLink', 'Email', 'WhatsApp', 'Active', 'Enrolled', 'Ref'],
  AcademyTutors: ['TutorID', 'Name', 'AccessCode', 'Role', 'Email', 'WhatsApp', 'Active'],
  AcademyAdmins: ['AdminID', 'Name', 'AccessCode', 'Email', 'Active'],
  AcademyMocks: ['StudentID', 'Date', 'Type', 'Subject', 'Score', 'OutOf', 'TutorID', 'Recorded'],
  AcademyReading: ['StudentID', 'Week', 'Target', 'Done', 'Updated'],
  AcademyPayments: ['PaymentID', 'StudentID', 'Date', 'Amount', 'Months', 'Reference', 'Method', 'ConfirmedBy', 'Recorded'],
  AcademyAnnouncements: ['Date', 'Title', 'Body', 'Audience'],
  AcademyAttendance: ['Date', 'Session', 'StudentID', 'Status', 'TutorID', 'Recorded'],
  AcademyTasks: ['TaskID', 'Created', 'Title', 'Instructions', 'Subject', 'Audience', 'Due', 'MaxScore', 'TutorID', 'Active'],
  AcademyTaskSubmissions: ['SubmissionID', 'TaskID', 'StudentID', 'Submitted', 'Answer', 'Link', 'Score', 'Feedback', 'Marked', 'MarkedBy'],
  AcademyTests: ['TestID', 'Title', 'Subject', 'Kind', 'Audience', 'Opens', 'Closes', 'Minutes', 'Questions', 'TutorID', 'Active', 'Created', 'Series', 'Combo'],
  AcademyQuestions: ['TestID', 'No', 'Question', 'A', 'B', 'C', 'D', 'E', 'Answer', 'Explanation', 'Subj'],
  AcademyMockBank: ['BankID', 'Subject', 'Passage', 'Question', 'Right', 'Wrong1', 'Wrong2', 'Wrong3', 'Explanation', 'Uses', 'LastUsed', 'Active'],
  AcademyAttempts: ['AttemptID', 'TestID', 'StudentID', 'Started', 'Submitted', 'Score', 'OutOf', 'Percent', 'Answers'],
  AcademyGroups: ['Group', 'MeetLink', 'TelegramLink', 'Timetable', 'Active'],
  AcademyFamilies: ['FamilyID', 'Name', 'MentorID', 'Motto', 'Active', 'Created'],
  AcademyFamilyPosts: ['PostID', 'FamilyID', 'ParentID', 'Kind', 'AuthorType', 'AuthorID', 'AuthorName', 'Title', 'Body', 'Link', 'Pinned', 'Hidden', 'Created'],
  AcademySessions: ['SessionID', 'Group', 'Date', 'Start', 'End', 'Subject', 'Topic', 'TutorID', 'MeetLink', 'Notes', 'MaterialLink', 'RecordingLink', 'Created']
};
const ACD_POSTS_PER_DAY = 30;     // posts and replies a student can add to their family board in a day
const ACD_POST_KINDS = ['Post', 'Announcement', 'Resource'];

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function academyFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (/^acd_/.test(a)) {
      const au = acd_studentAuth_(p);
      if (au.error) return { ok: false, error: au.error };
      let r = { ok: true }, extra = {};
      if (a === 'acd_reading') r = acd_saveReading_(au.row, p);
      else if (a === 'acd_task') r = acd_submitTask_(au.row, p);
      else if (a === 'acd_cbt_start') return acd_cbtStart_(au.row, p);
      else if (a === 'acd_cbt_submit') { r = acd_cbtSubmit_(au.row, p); extra.result = r.result; }
      else if (a === 'acd_cbt_review') return acd_cbtReview_(au.row, p);
      else if (a === 'acd_post') r = acd_savePost_({ type: 'student', id: String(au.row.StudentID).trim(), name: String(au.row.Name || ''), row: au.row }, p);
      else if (a === 'acd_post_delete') r = acd_deletePost_({ type: 'student', id: String(au.row.StudentID).trim(), row: au.row }, p);
      else if (a !== 'acd_login') r = { ok: false, error: 'Unknown action.' };
      if (!r.ok) return r;
      return Object.assign(acd_studentPayload_(acd_reload_(ACD.Students, 'StudentID', au.row.StudentID)), extra);
    }
    if (/^acdt_/.test(a)) {
      const au = acd_auth_(ACD.Tutors, 'TutorID', p);
      if (au.error) return { ok: false, error: au.error };
      if (a === 'acdt_student') return acd_viewStudent_(au.row, p.studentId, false);
      let r = { ok: true };
      if (a === 'acdt_mock') r = acd_saveMock_(au.row, p);
      else if (a === 'acdt_goals') r = acd_saveGoals_(au.row, p);
      else if (a === 'acdt_class') r = acd_saveClass_(au.row, p);
      else if (a === 'acdt_password') r = acd_setCode_(au.t, au.row, p.newCode);
      else if (a === 'acdt_attendance') r = acd_saveAttendance_(au.row, p);
      else if (a === 'acdt_task') r = acd_saveTask_(au.row, p);
      else if (a === 'acdt_task_close') r = acd_closeTask_(au.row, p);
      else if (a === 'acdt_mark') r = acd_markTask_(au.row, p);
      else if (a === 'acdt_cbt') r = acd_saveTest_(au.row, p);
      else if (a === 'acdt_cbt_close') r = acd_closeTest_(au.row, p);
      else if (a === 'acdt_post') r = acd_savePost_({ type: 'mentor', id: String(au.row.TutorID).trim(), name: String(au.row.Name || ''), tu: au.row }, p);
      else if (a === 'acdt_post_hide') r = acd_hidePost_({ type: 'mentor', tu: au.row }, p);
      else if (a === 'acdt_post_pin') r = acd_pinPost_({ type: 'mentor', tu: au.row }, p);
      else if (a === 'acdt_session') r = acd_saveSession_(au.row, p);
      else if (a === 'acdt_session_delete') r = acd_deleteSession_(au.row, p);
      else if (a !== 'acdt_login') r = { ok: false, error: 'Unknown action.' };
      if (!r.ok) return r;
      return acd_tutorPayload_(acd_reload_(ACD.Tutors, 'TutorID', au.row.TutorID));
    }
    if (/^acda_/.test(a)) {
      const au = acd_auth_(ACD.Admins, 'AdminID', p);
      if (au.error) return { ok: false, error: au.error };
      if (a === 'acda_student') return acd_viewStudent_(null, p.studentId, true);
      if (a === 'acda_analytics') return acm_analytics_(p.series);   // read-only: how the Sunday mock went, question by question (AcademyAnalytics.gs)
      let r = { ok: true };
      if (a === 'acda_payment') r = acd_confirmPayment_(au.row, p);
      else if (a === 'acda_assign') r = acd_assign_(p);
      else if (a === 'acda_password') r = acd_setCode_(au.t, au.row, p.newCode);
      else if (a === 'acda_student_save') r = acd_saveStudent_(p);
      else if (a === 'acda_student_remove' || a === 'acda_student_restore') r = acd_setActive_(ACD.Students, 'StudentID', p.studentId, a === 'acda_student_restore');
      else if (a === 'acda_student_code') r = acd_resetCode_(ACD.Students, 'StudentID', p.studentId, p.email);
      else if (a === 'acda_tutor_save') r = acd_saveTutor_(p);
      else if (a === 'acda_tutor_remove' || a === 'acda_tutor_restore') r = acd_setActive_(ACD.Tutors, 'TutorID', p.tutorId, a === 'acda_tutor_restore');
      else if (a === 'acda_tutor_code') r = acd_resetCode_(ACD.Tutors, 'TutorID', p.tutorId, p.email);
      else if (a === 'acda_group_save') r = acd_saveGroup_(p);
      else if (a === 'acda_family_save') r = acd_saveFamily_(p);
      else if (a === 'acda_family_remove' || a === 'acda_family_restore') r = acd_setActive_(ACD.Families, 'FamilyID', p.familyId, a === 'acda_family_restore');
      else if (a === 'acda_post') r = acd_savePost_({ type: 'admin', id: String(au.row.AdminID).trim(), name: String(au.row.Name || 'Admin'), admin: true }, p);
      else if (a === 'acda_post_hide') r = acd_hidePost_({ type: 'admin', admin: true }, p);
      else if (a === 'acda_post_pin') r = acd_pinPost_({ type: 'admin', admin: true }, p);
      else if (a !== 'acda_login') r = { ok: false, error: 'Unknown action.' };
      if (!r.ok) return r;
      const out = acd_adminPayload_(acd_reload_(ACD.Admins, 'AdminID', au.row.AdminID));
      if (r.created) out.created = r.created;
      return out;
    }
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: /Missing tab|Missing column/.test(String(err.message)) ? 'The Academy is not set up yet. Please contact the school.' : 'Something went wrong. Please try again.' };
  }
}

/* ===== TABS: created or upgraded automatically the first time they are needed ===== */
const ACD_CHECKED_ = {};
function acd_t_(name) {
  if (!ACD_SHEETS[name]) return table_(name);   // other portals (Skills.gs) share the login helpers
  if (!ACD_CHECKED_[name]) {
    const ss = ss_(), want = ACD_SHEETS[name];
    let sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, want.length).setValues([want]).setFontWeight('bold'); sh.setFrozenRows(1); }
    else {
      const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
      if (!have.some(Boolean)) sh.getRange(1, 1, 1, want.length).setValues([want]).setFontWeight('bold');
      else want.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h).setFontWeight('bold'); } });
    }
    ACD_CHECKED_[name] = true;
  }
  return table_(name);
}

/* ===== LOGIN (with the same lockout as the Madrasah dashboard) ===== */
function acd_auth_(tab, idField, p) {
  const id = key_(p.id).slice(0, 40), code = String(p.code || '').trim();
  if (!id || !code) return { error: 'Enter your ID and access code.' };
  const cache = CacheService.getScriptCache(), lk = 'lock:' + tab + ':' + id, fk = 'fail:' + tab + ':' + id;
  if (cache.get(lk)) return { error: 'Too many attempts. Please try again in 15 minutes.' };
  const t = acd_t_(tab);
  const row = t.rows.filter(function (r) { return key_(r[idField]) === id || (idField === 'StudentID' && r.Matric && key_(r.Matric) === id); })[0];
  const ok = row && key_(row.Active) !== 'FALSE' && String(row.AccessCode).trim() !== '' && code_ok_(row.AccessCode, code);
  if (!ok) {
    const n = Number(cache.get(fk) || 0) + 1;
    if (n >= LOCKOUT_TRIES) { cache.put(lk, '1', LOCKOUT_SECONDS); cache.remove(fk); } else cache.put(fk, String(n), LOCKOUT_SECONDS);
    return { error: 'Wrong ID or access code.' };
  }
  cache.remove(fk);
  return { t: t, row: row };
}
function acd_studentAuth_(p) { return acd_auth_(ACD.Students, 'StudentID', p); }
function acd_reload_(tab, idField, id) {
  return acd_t_(tab).rows.filter(function (r) { return key_(r[idField]) === key_(id); })[0];
}
function acd_setCode_(t, row, code) {
  code = String(code || '');
  if (code.length < 8 || code.length > 40) return { ok: false, error: 'Your new code must be 8 to 40 characters.' };
  put_(t, row._row, 'AccessCode', code, true);
  return { ok: true };
}

/* ===== SMALL HELPERS ===== */
function acd_monday_(isoDay) {
  const n = dn_(isoDay), dow = new Date(n * 86400000).getUTCDay();
  return new Date((n - (dow + 6) % 7) * 86400000).toISOString().slice(0, 10);
}
function acd_isDay_(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function acd_isWhen_(v) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(v || '')); }
function acd_now_() { return iso_(new Date(), true); }
function acd_wa_(num) { const n = String(num || '').replace(/\D/g, ''); return n.charAt(0) === '0' && n.length === 11 ? '234' + n.slice(1) : n; }
function acd_txt_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n); }
function acd_id_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(); }
function acd_tutorNames_() {
  const m = {};
  acd_t_(ACD.Tutors).rows.forEach(function (t) { if (t.TutorID) m[key_(t.TutorID)] = String(t.Name || ''); });
  return m;
}
function acd_isLead_(tu) { return !!tu && String(tu.Role || '').trim().toLowerCase() === 'admin'; }
function acd_short_(name) {   // "Fatima Yusuf" → "Fatima Y." for the leaderboard
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  return p.length ? p[0] + (p.length > 1 ? ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.' : '') : '';
}
function acd_keys_(s) {   // who a task, test or announcement can be meant for
  return ['ALL', 'ACADEMY', key_(s.Track), key_(s.Group), key_(s.StudentID), s.TutorID ? 'TUTOR:' + key_(s.TutorID) : ''].filter(Boolean);
}
function acd_groups_() {
  const out = ACD_GROUPS.slice();
  acd_t_(ACD.Groups).rows.forEach(function (g) { const n = String(g.Group || '').trim(); if (n && out.indexOf(n) < 0) out.push(n); });
  acd_t_(ACD.Students).rows.forEach(function (s) { const n = String(s.Group || '').trim(); if (n && out.indexOf(n) < 0) out.push(n); });
  return out;
}

/* Each sitting = one date + type; its percentage is the total score over the total possible */
function acd_sittings_(M, id) {
  const g = {};
  M.rows.forEach(function (r) {
    if (key_(r.StudentID) !== id || !r.Subject) return;
    const d = iso_(r.Date), k = d + '|' + r.Type;
    (g[k] = g[k] || { Date: d, Type: String(r.Type), Subjects: [] }).Subjects.push({ Subject: String(r.Subject), Score: Number(r.Score) || 0, OutOf: Number(r.OutOf) || 0 });
  });
  return Object.keys(g).map(function (k) {
    const s = g[k];
    const sc = s.Subjects.reduce(function (a, x) { return a + x.Score; }, 0), out = s.Subjects.reduce(function (a, x) { return a + x.OutOf; }, 0);
    s.Percent = out ? Math.round(1000 * sc / out) / 10 : 0;
    return s;
  }).sort(function (a, b) { return a.Date < b.Date ? 1 : a.Date > b.Date ? -1 : 0; });
}
function acd_reading_(R, id, week) {
  const rows = R.rows.filter(function (r) { return key_(r.StudentID) === id && r.Week; })
    .map(function (r) { return { Week: iso_(r.Week), Target: Number(r.Target) || 0, Done: Number(r.Done) || 0 }; })
    .sort(function (a, b) { return a.Week < b.Week ? -1 : 1; });
  const cur = rows.filter(function (r) { return r.Week === week; })[0] || { Week: week, Target: 0, Done: 0 };
  const hist = rows.filter(function (r) { return r.Week < week; }).slice(-7).concat([cur]);
  return { Week: week, Target: cur.Target, Done: cur.Done, History: hist };
}

/* ===== PERFORMANCE: one context per request, metrics per student ===== */
function acd_ctx_() {
  const memo = {}, idx = {};
  const C = { get: function (name) { return memo[name] || (memo[name] = acd_t_(name)); } };
  C.by = function (name) {   // rows grouped by StudentID, so per-student work stays fast
    if (idx[name]) return idx[name];
    const m = {};
    C.get(name).rows.forEach(function (r) { const k = key_(r.StudentID); if (k) (m[k] = m[k] || []).push(r); });
    return (idx[name] = m);
  };
  return C;
}
function acd_r1_(x) { return x == null ? null : Math.round(10 * x) / 10; }
function acd_metrics_(C, s, days) {
  const id = key_(s.StudentID), today = today_(), since = days ? new Date((dn_(today) - days) * 86400000).toISOString().slice(0, 10) : '0000-00-00';
  const keys = acd_keys_(s);
  // mocks
  const sit = acd_sittings_({ rows: C.by(ACD.Mocks)[id] || [] }, id).filter(function (x) { return x.Date >= since; });
  const mocks = sit.length ? sit.reduce(function (a, x) { return a + x.Percent; }, 0) / sit.length : null;
  // attendance
  let pres = 0, tot = 0;
  (C.by(ACD.Attendance)[id] || []).forEach(function (r) {
    if (iso_(r.Date) < since) return;
    const st = String(r.Status || '');
    if (st === 'Excused' || !st) return;
    tot++; if (st === 'Present' || st === 'Late') pres++;
  });
  const attendance = tot ? 100 * pres / tot : null;
  // daily tasks: marked = score %, missed after the due date = 0, waiting to be marked = left out
  const subs = {};
  (C.by(ACD.TaskSubs)[id] || []).forEach(function (r) { subs[String(r.TaskID)] = r; });
  let tSum = 0, tN = 0, tDone = 0, tSet = 0;
  C.get(ACD.Tasks).rows.forEach(function (t) {
    if (!t.TaskID || key_(t.Active) === 'FALSE' || !matches_(t.Audience, keys)) return;
    const due = iso_(t.Due), created = iso_(t.Created);
    if ((due || created) < since) return;
    const sb = subs[String(t.TaskID)];
    if (due && due > today && !sb) return;   // not due yet
    tSet++;
    if (sb) tDone++;
    if (sb && sb.Marked !== '' && sb.Score !== '' && Number(t.MaxScore) > 0) { tSum += 100 * Number(sb.Score) / Number(t.MaxScore); tN++; }
    else if (!sb && due && due < today) tN++;
  });
  const tasks = tN ? tSum / tN : null;
  // practice CBT (Sunday mocks already count as mocks)
  const kinds = {};
  C.get(ACD.Tests).rows.forEach(function (x) { kinds[String(x.TestID)] = String(x.Kind); });
  let cSum = 0, cN = 0;
  (C.by(ACD.Attempts)[id] || []).forEach(function (r) {
    if (!r.Submitted || iso_(r.Submitted) < since || kinds[String(r.TestID)] === 'Sunday mock') return;
    cSum += Number(r.Percent) || 0; cN++;
  });
  const cbt = cN ? cSum / cN : null;
  // reading club: last 4 weeks with a target
  const rd = (C.by(ACD.Reading)[id] || []).filter(function (r) { return Number(r.Target) > 0 && iso_(r.Week) >= since; })
    .sort(function (a, b) { return iso_(a.Week) < iso_(b.Week) ? -1 : 1; }).map(function (r) { return Math.min(100, 100 * (Number(r.Done) || 0) / Number(r.Target)); }).slice(-4);
  const reading = rd.length ? rd.reduce(function (a, x) { return a + x; }, 0) / rd.length : null;
  // overall
  const parts = { mocks: mocks, tasks: tasks, attendance: attendance, cbt: cbt, reading: reading };
  let w = 0, sum = 0;
  Object.keys(ACD_WEIGHTS).forEach(function (k) { if (parts[k] != null) { w += ACD_WEIGHTS[k]; sum += ACD_WEIGHTS[k] * parts[k]; } });
  return { mocks: acd_r1_(mocks), mockCount: sit.length, attendance: acd_r1_(attendance), present: pres, sessions: tot, tasks: acd_r1_(tasks),
           tasksDone: tDone, tasksSet: tSet, cbt: acd_r1_(cbt), cbtCount: cN, reading: acd_r1_(reading), overall: w ? acd_r1_(sum / w) : null };
}
function acd_board_(C) {   // everyone active, best first
  const list = C.get(ACD.Students).rows.filter(function (s) { return s.StudentID && key_(s.Active) !== 'FALSE'; })
    .map(function (s) { return { s: s, m: acd_metrics_(C, s, ACD_LEADERBOARD_DAYS) }; })
    .filter(function (x) { return x.m.overall != null; })
    .sort(function (a, b) { return b.m.overall - a.m.overall || String(a.s.Name).localeCompare(String(b.s.Name)); });
  let rank = 0, last = null;
  list.forEach(function (x, i) { if (x.m.overall !== last) { rank = i + 1; last = x.m.overall; } x.rank = rank; });
  return list;
}

/* ===== STUDENT ===== */
function acd_studentPayload_(st, viewer) {
  const C = acd_ctx_(), id = key_(st.StudentID), track = String(st.Track || ''), group = String(st.Group || ''), keys = acd_keys_(st);
  const tutors = acd_tutorNames_(), status = payStatus_(st), today = today_(), now = acd_now_();
  // class links for the student's group, shown only while fees are not overdue
  const g = C.get(ACD.Groups).rows.filter(function (r) { return key_(r.Group) === key_(group) && key_(r.Active) !== 'FALSE'; })[0] || {};
  const locked = status === 'Overdue';
  const meet = String(st.ClassLink || g.MeetLink || ''), tg = String(g.TelegramLink || '');
  // attendance
  const att = C.get(ACD.Attendance).rows.filter(function (r) { return key_(r.StudentID) === id && r.Date; })
    .map(function (r) { return { Date: iso_(r.Date), Session: String(r.Session || ''), Status: String(r.Status || '') }; })
    .sort(function (a, b) { return a.Date < b.Date ? 1 : -1; });
  // tasks
  const subs = {};
  C.get(ACD.TaskSubs).rows.forEach(function (r) { if (key_(r.StudentID) === id) subs[String(r.TaskID)] = r; });
  const from = new Date((dn_(today) - 45) * 86400000).toISOString().slice(0, 10);
  const tasks = C.get(ACD.Tasks).rows.filter(function (t) { return t.TaskID && key_(t.Active) !== 'FALSE' && matches_(t.Audience, keys) && ((iso_(t.Due) || iso_(t.Created)) >= from); })
    .map(function (t) {
      const sb = subs[String(t.TaskID)], due = iso_(t.Due), marked = sb && sb.Marked !== '' && sb.Score !== '';
      return { TaskID: String(t.TaskID), Title: String(t.Title), Instructions: String(t.Instructions || ''), Subject: String(t.Subject || ''), Due: due, MaxScore: Number(t.MaxScore) || 0,
               Status: marked ? 'Marked' : sb ? 'Submitted' : (due && due < today ? 'Missed' : 'To do'),
               Answer: sb ? String(sb.Answer || '') : '', Link: sb ? String(sb.Link || '') : '', Submitted: sb ? iso_(sb.Submitted, true) : '',
               Score: marked ? Number(sb.Score) : null, Feedback: sb ? String(sb.Feedback || '') : '' };
    }).sort(function (a, b) { const o = { 'To do': 0, Submitted: 1, Missed: 2, Marked: 3 }; return (o[a.Status] - o[b.Status]) || String(a.Due).localeCompare(String(b.Due)); });
  // CBT
  const attempts = C.get(ACD.Attempts).rows.filter(function (r) { return key_(r.StudentID) === id; });
  const tests = C.get(ACD.Tests).rows.filter(function (x) { return x.TestID && key_(x.Active) !== 'FALSE' && matches_(x.Audience, keys); }).map(function (x) {
    const mine = attempts.filter(function (r) { return String(r.TestID) === String(x.TestID); });
    const done = mine.filter(function (r) { return r.Submitted; }), open = mine.filter(function (r) { return !r.Submitted; })[0];
    const opens = iso_(x.Opens, true), closes = iso_(x.Closes, true), sunday = String(x.Kind) === 'Sunday mock';
    const sibIds = x.Series ? C.get(ACD.Tests).rows.filter(function (r) { return String(r.Series) === String(x.Series) && String(r.TestID) !== String(x.TestID); }).map(function (r) { return String(r.TestID); }) : [];
    const locked = !!sibIds.length && attempts.some(function (r) { return sibIds.indexOf(String(r.TestID)) >= 0; });
    const state = opens && now < opens ? 'Upcoming' : closes && now > closes ? 'Closed' : (sunday && done.length ? 'Done' : 'Open');
    const best = done.reduce(function (b, r) { return Math.max(b, Number(r.Percent) || 0); }, -1);
    return { TestID: String(x.TestID), Title: String(x.Title), Subject: String(x.Subject || ''), Kind: String(x.Kind), Opens: opens, Closes: closes, Minutes: Number(x.Minutes) || 0,
             Questions: Number(x.Questions) || 0, State: state, InProgress: !!open, Attempts: done.length, Best: best >= 0 ? best : null, Series: String(x.Series || ''), Combo: String(x.Combo || ''), Locked: locked && !done.length,
             Last: done.length ? done.sort(function (a, b) { return String(a.Submitted) < String(b.Submitted) ? 1 : -1; }).map(function (r) {
               return { AttemptID: String(r.AttemptID), Percent: Number(r.Percent) || 0, Score: Number(r.Score) || 0, OutOf: Number(r.OutOf) || 0, Submitted: iso_(r.Submitted, true),
                        Review: !sunday || (closes && now > closes) };
             })[0] : null };
  }).filter(function (x) { return x.State !== 'Closed' || x.Attempts; })
    .sort(function (a, b) { const o = { Open: 0, Upcoming: 1, Done: 2, Closed: 3 }; return (o[a.State] - o[b.State]) || String(a.Closes || '9').localeCompare(String(b.Closes || '9')); });
  // leaderboard
  let board = null;
  const cache = CacheService.getScriptCache(), cached = cache.get('acd_board');
  let rows = cached ? JSON.parse(cached) : null;
  if (!rows) {
    rows = acd_board_(C).map(function (x) { return { id: key_(x.s.StudentID), n: acd_short_(x.s.Name), g: String(x.s.Group || ''), t: String(x.s.Track || ''), f: key_(x.s.Family), o: x.m.overall, r: x.rank }; });
    try { cache.put('acd_board', JSON.stringify(rows), 600); } catch (e) {}
  }
  const me = rows.filter(function (x) { return x.id === id; })[0];
  board = { days: ACD_LEADERBOARD_DAYS, total: rows.length, top: rows.slice(0, ACD_LEADERBOARD_SIZE).map(function (x) { return { Rank: x.r, Name: x.n, Group: x.g, Track: x.t, Score: x.o, Me: x.id === id }; }),
            me: me ? { Rank: me.r, Score: me.o } : null };
  // mentorship family
  const famRow = st.Family ? acd_familyRow_(C, st.Family) : null;
  const famAgg = {};
  rows.forEach(function (x) { if (x.f) (famAgg[x.f] = famAgg[x.f] || []).push(x.o); });
  const families = C.get(ACD.Families).rows.filter(function (f) { return f.FamilyID && key_(f.Active) !== 'FALSE'; }).map(function (f) {
    const v = famAgg[key_(f.FamilyID)] || [];
    return { FamilyID: String(f.FamilyID), Name: String(f.Name || ''), Score: v.length ? acd_r1_(v.reduce(function (a, x) { return a + x; }, 0) / v.length) : null, Ranked: v.length, Me: !!famRow && key_(f.FamilyID) === key_(famRow.FamilyID) };
  }).sort(function (a, b) { return (b.Score == null ? -1 : b.Score) - (a.Score == null ? -1 : a.Score) || a.Name.localeCompare(b.Name); });
  families.forEach(function (x, i) { x.Rank = x.Score == null ? null : i + 1; });
  const scoreOf = {}; rows.forEach(function (x) { scoreOf[x.id] = x.o; });
  const family = famRow ? {
    FamilyID: String(famRow.FamilyID), Name: String(famRow.Name || ''), Motto: String(famRow.Motto || ''), Mentor: tutors[key_(famRow.MentorID)] || '',
    Members: C.get(ACD.Students).rows.filter(function (m) { return m.StudentID && key_(m.Active) !== 'FALSE' && key_(m.Family) === key_(famRow.FamilyID); })
      .map(function (m) { return { Name: acd_short_(m.Name), Me: key_(m.StudentID) === id, Score: scoreOf[key_(m.StudentID)] == null ? null : scoreOf[key_(m.StudentID)] }; })
      .sort(function (a, b) { return (b.Score == null ? -1 : b.Score) - (a.Score == null ? -1 : a.Score); }),
    Posts: acd_board__(C, famRow.FamilyID, false, viewer ? '' : id)
  } : null;
  // classes for the student's group
  const groupMeet = String(g.MeetLink || '');
  const cls = group ? acd_sessionList_(C, [group], tutors, today, acd_shift_(today, -30), acd_shift_(today, 30)) : acd_sessionList_(C, [], tutors, today, acd_shift_(today, -30), acd_shift_(today, 30));
  cls.forEach(function (c) { c.Join = locked ? '' : (c.MeetLink || String(st.ClassLink || '') || groupMeet); delete c.MeetLink; delete c.TutorID; });
  const upcoming = cls.filter(function (c) { return c.Date >= today; }), past = cls.filter(function (c) { return c.Date < today; }).reverse();
  const nextFromSessions = upcoming.filter(function (c) { return c.Date > today || (c.End || c.Start) >= now.slice(11); })[0];
  return {
    ok: true, today: today, view: viewer || '',
    family: family, families: families, classes: { upcoming: upcoming.slice(0, 20), past: past.slice(0, 20), locked: locked },
    student: {
      StudentID: String(st.StudentID).trim(), Matric: String(st.Matric || ''), Name: st.Name, Track: track, Group: group, Tutor: tutors[key_(st.TutorID)] || '',
      IsUtme: key_(track) === 'UTME', PaymentStatus: status, NextDue: iso_(st.NextDue), MonthlyFee: Number(st.MonthlyFee) || 0,
      ExamDate: iso_(st.ExamDate), TargetPercent: Number(st.TargetPercent) || 0,
      NextClass: (function () { const nc = iso_(st.NextClass, true); if (nc && nc >= now) return nc; return nextFromSessions ? nextFromSessions.Date + 'T' + nextFromSessions.Start : nc; })(),
      ClassLink: locked ? '' : meet
    },
    links: { locked: locked && !!(meet || tg), meet: locked ? '' : meet, telegram: locked ? '' : tg, timetable: String(g.Timetable || '') },
    readingUnit: ACD_READING_UNIT,
    mocks: acd_sittings_(C.get(ACD.Mocks), id).slice(0, 30),
    reading: acd_reading_(C.get(ACD.Reading), id, acd_monday_(today)),
    metrics: acd_metrics_(C, st, ACD_LEADERBOARD_DAYS),
    attendance: att.slice(0, 20),
    tasks: tasks, tests: tests, leaderboard: board, mockBoard: acm_board_(C, st),
    announcements: acd_t_(ACD.Announcements).rows.filter(function (r) { return r.Title && matches_(r.Audience, keys); })
      .map(function (r) { return { Date: iso_(r.Date), Title: r.Title, Body: r.Body }; })
      .sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 20),
    payments: acd_t_(ACD.Payments).rows.filter(function (r) { return key_(r.StudentID) === id; })
      .map(function (r) { return { Date: iso_(r.Date), Amount: Number(r.Amount) || 0, Months: Number(r.Months) || 1, Reference: r.Reference }; })
      .sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 12)
  };
}
function acd_saveReading_(st, p) {
  const target = Number(p.target), done = Number(p.done);
  if (!(target >= 1 && target <= 100000 && Math.floor(target) === target)) return { ok: false, error: 'Enter a whole-number reading target for this week.' };
  if (!(done >= 0 && done <= 1000000 && Math.floor(done) === done)) return { ok: false, error: 'Enter how much you have read so far (0 or more).' };
  const week = acd_monday_(today_()), id = key_(st.StudentID);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const R = acd_t_(ACD.Reading);
    const ex = R.rows.filter(function (r) { return key_(r.StudentID) === id && iso_(r.Week) === week; })[0];
    if (ex) { put_(R, ex._row, 'Target', target); put_(R, ex._row, 'Done', done); put_(R, ex._row, 'Updated', new Date()); }
    else append_(R, { StudentID: String(st.StudentID).trim(), Week: week, Target: target, Done: done, Updated: new Date() }, ['StudentID', 'Week']);
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('acd_board');
  return { ok: true };
}
function acd_submitTask_(st, p) {
  const tid = String(p.taskId || ''), answer = acd_txt_(p.answer, 5000), link = acd_txt_(p.link, 500);
  if (!answer && !link) return { ok: false, error: 'Write your answer or add a link to your work.' };
  if (link && !/^https?:\/\//i.test(link)) return { ok: false, error: 'The link must start with http:// or https://' };
  const t = acd_t_(ACD.Tasks).rows.filter(function (r) { return String(r.TaskID) === tid && key_(r.Active) !== 'FALSE'; })[0];
  if (!t || !matches_(t.Audience, acd_keys_(st))) return { ok: false, error: 'This task is not available.' };
  const id = key_(st.StudentID);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const TS = acd_t_(ACD.TaskSubs);
    const ex = TS.rows.filter(function (r) { return String(r.TaskID) === tid && key_(r.StudentID) === id; })[0];
    if (ex && ex.Marked !== '' && ex.Score !== '') return { ok: false, error: 'This task has already been marked.' };
    if (ex) { put_(TS, ex._row, 'Answer', answer, true); put_(TS, ex._row, 'Link', link, true); put_(TS, ex._row, 'Submitted', acd_now_(), true); }
    else append_(TS, { SubmissionID: acd_id_('TS-'), TaskID: tid, StudentID: String(st.StudentID).trim(), Submitted: acd_now_(), Answer: answer, Link: link, Score: '', Feedback: '', Marked: '', MarkedBy: '' },
                 ['SubmissionID', 'TaskID', 'StudentID', 'Submitted', 'Answer', 'Link']);
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('acd_board');
  return { ok: true };
}

/* ----- CBT for students ----- */
function acd_testFor_(st, testId) {
  const x = acd_t_(ACD.Tests).rows.filter(function (r) { return String(r.TestID) === String(testId) && key_(r.Active) !== 'FALSE'; })[0];
  if (!x || !matches_(x.Audience, acd_keys_(st))) return null;
  return x;
}
function acd_questions_(testId) {
  return acd_t_(ACD.Questions).rows.filter(function (q) { return String(q.TestID) === String(testId) && q.Question; })
    .sort(function (a, b) { return Number(a.No) - Number(b.No); });
}
function acd_opts_(q) { const o = {}; ['A', 'B', 'C', 'D', 'E'].forEach(function (k) { if (String(q[k] || '').trim()) o[k] = String(q[k]); }); return o; }
function acd_cbtStart_(st, p) {
  const x = acd_testFor_(st, p.testId);
  if (!x) return { ok: false, error: 'This test is not available.' };
  const now = acd_now_(), opens = iso_(x.Opens, true), closes = iso_(x.Closes, true), sunday = String(x.Kind) === 'Sunday mock';
  if (opens && now < opens) return { ok: false, error: 'This test opens on ' + nice_(opens) + ' at ' + opens.slice(11) + '.' };
  if (closes && now > closes) return { ok: false, error: 'This test has closed.' };
  const qs = acd_questions_(x.TestID);
  if (!qs.length) return { ok: false, error: 'This test has no questions yet.' };
  const id = key_(st.StudentID), minutes = Number(x.Minutes) || 0;
  let att = null;
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const AT = acd_t_(ACD.Attempts);
    const mine = AT.rows.filter(function (r) { return String(r.TestID) === String(x.TestID) && key_(r.StudentID) === id; });
    if (sunday && mine.some(function (r) { return r.Submitted; })) return { ok: false, error: 'You have already sat this Sunday mock. Your result is in the CBT tab.' };
    if (sunday && String(x.Series || '')) {   // one subject combination per week: sitting one locks the others
      const sibs = {}; acd_t_(ACD.Tests).rows.forEach(function (r) { if (String(r.Series) === String(x.Series) && String(r.TestID) !== String(x.TestID)) sibs[String(r.TestID)] = 1; });
      if (AT.rows.some(function (r) { return sibs[String(r.TestID)] && key_(r.StudentID) === id; })) return { ok: false, error: 'You already chose a different subject combination for this week\'s mock. You can only sit one.' };
    }
    const open = mine.filter(function (r) { return !r.Submitted; })[0];
    if (open && (!minutes || (Date.now() - acd_ms_(open.Started)) < (minutes + 2) * 60000)) att = { AttemptID: String(open.AttemptID), Started: String(open.Started) };
    else {
      att = { AttemptID: acd_id_('CA-'), Started: new Date().toISOString() };
      append_(AT, { AttemptID: att.AttemptID, TestID: String(x.TestID), StudentID: String(st.StudentID).trim(), Started: att.Started, Submitted: '', Score: '', OutOf: '', Percent: '', Answers: '' },
              ['AttemptID', 'TestID', 'StudentID', 'Started', 'Answers']);
    }
  } finally { lock.releaseLock(); }
  const left = minutes ? Math.max(0, Math.round((acd_ms_(att.Started) + minutes * 60000 - Date.now()) / 1000)) : null;
  return { ok: true, attempt: { AttemptID: att.AttemptID, TestID: String(x.TestID), Title: String(x.Title), Subject: String(x.Subject || ''), Kind: String(x.Kind),
    Minutes: minutes, SecondsLeft: left, Questions: qs.map(function (q) { return { No: Number(q.No), Question: String(q.Question), Options: acd_opts_(q), Subj: String(q.Subj || '') }; }) } };
}
function acd_breakdown_(qs, answers) {   // UTME scoring: each subject is out of 100, so four subjects make 400
  const order = [], per = {};
  qs.forEach(function (q) { const s = String(q.Subj || 'General'); if (!per[s]) { per[s] = { c: 0, n: 0 }; order.push(s); } per[s].n++; if (answers[String(Number(q.No))] && answers[String(Number(q.No))] === String(q.Answer || '').trim().toUpperCase()) per[s].c++; });
  const items = order.map(function (s) { return { Subject: s, Correct: per[s].c, Of: per[s].n, Score: Math.round(1000 * per[s].c / per[s].n) / 10 }; });
  const total = Math.round(10 * items.reduce(function (a, i) { return a + i.Score; }, 0)) / 10;
  return { items: items, total: total, outOf: 100 * items.length };
}
function acd_ms_(v) { const d = v instanceof Date ? v : new Date(String(v)); return isNaN(d) ? 0 : d.getTime(); }
function acd_review_(qs, answers) {
  return qs.map(function (q) {
    return { No: Number(q.No), Question: String(q.Question), Options: acd_opts_(q), Answer: String(q.Answer || '').trim().toUpperCase(),
             Yours: String((answers || {})[String(q.No)] || ''), Explanation: String(q.Explanation || ''), Subj: String(q.Subj || '') };
  });
}
function acd_cbtSubmit_(st, p) {
  const aid = String(p.attemptId || ''), id = key_(st.StudentID);
  const answers = {};
  Object.keys(p.answers || {}).slice(0, 300).forEach(function (k) { const v = String(p.answers[k] || '').toUpperCase(); if (/^[A-E]$/.test(v)) answers[String(Number(k))] = v; });
  let result = null, x = null, qs = [];
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const AT = acd_t_(ACD.Attempts);
    const a = AT.rows.filter(function (r) { return String(r.AttemptID) === aid && key_(r.StudentID) === id; })[0];
    if (!a) return { ok: false, error: 'This test attempt was not found.' };
    if (a.Submitted) return { ok: false, error: 'This test has already been submitted.' };
    x = acd_t_(ACD.Tests).rows.filter(function (r) { return String(r.TestID) === String(a.TestID); })[0];
    if (!x) return { ok: false, error: 'This test is not available.' };
    qs = acd_questions_(x.TestID);
    let score = 0;
    qs.forEach(function (q) { if (answers[String(Number(q.No))] && answers[String(Number(q.No))] === String(q.Answer || '').trim().toUpperCase()) score++; });
    let outOf = qs.length, breakdown = null;
    if (String(x.Series || '')) { breakdown = acd_breakdown_(qs, answers); score = breakdown.total; outOf = breakdown.outOf; }
    const pct = outOf ? Math.round(1000 * score / outOf) / 10 : 0, now = acd_now_();
    put_(AT, a._row, 'Submitted', now, true); put_(AT, a._row, 'Score', score); put_(AT, a._row, 'OutOf', outOf); put_(AT, a._row, 'Percent', pct);
    put_(AT, a._row, 'Answers', JSON.stringify(answers), true);
    const sunday = String(x.Kind) === 'Sunday mock', closes = iso_(x.Closes, true);
    if (sunday) {   // a Sunday mock also goes on the student's mock record
      append_(acd_t_(ACD.Mocks), { StudentID: String(st.StudentID).trim(), Date: today_(), Type: 'Sunday mock', Subject: String(x.Series ? 'UTME mock · ' + (x.Combo || x.Subject) : (x.Subject || x.Title)).slice(0, 60), Score: score, OutOf: outOf, TutorID: 'CBT', Recorded: new Date() },
              ['StudentID', 'Date', 'Type', 'Subject', 'TutorID']);
    }
    const reviewNow = !sunday || (closes && now > closes);
    result = { Title: String(x.Title), Kind: String(x.Kind), Score: score, OutOf: outOf, Percent: pct, Scaled: !!breakdown, Breakdown: breakdown ? breakdown.items : null, Review: reviewNow ? acd_review_(qs, answers) : null };
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('acd_board');
  return { ok: true, result: result };
}
function acd_cbtReview_(st, p) {
  const a = acd_t_(ACD.Attempts).rows.filter(function (r) { return String(r.AttemptID) === String(p.attemptId) && key_(r.StudentID) === key_(st.StudentID) && r.Submitted; })[0];
  if (!a) return { ok: false, error: 'This result was not found.' };
  const x = acd_t_(ACD.Tests).rows.filter(function (r) { return String(r.TestID) === String(a.TestID); })[0];
  if (!x) return { ok: false, error: 'This test is not available.' };
  const closes = iso_(x.Closes, true);
  if (String(x.Kind) === 'Sunday mock' && !(closes && acd_now_() > closes)) return { ok: false, error: 'Answers for this Sunday mock are shown after it closes' + (closes ? ' (' + nice_(closes) + ' at ' + closes.slice(11) + ')' : '') + '.' };
  let answers = {}; try { answers = JSON.parse(String(a.Answers || '{}')); } catch (e) {}
  const rq = acd_questions_(x.TestID), bd = String(x.Series || '') ? acd_breakdown_(rq, answers) : null;
  return { ok: true, result: { Title: String(x.Title), Kind: String(x.Kind), Score: Number(a.Score) || 0, OutOf: Number(a.OutOf) || 0, Percent: Number(a.Percent) || 0, Scaled: !!bd, Breakdown: bd ? bd.items : null, Review: acd_review_(rq, answers) } };
}

/* ===== MENTOR (tutor) ===== */
function acd_mine_(tu) {
  const lead = acd_isLead_(tu);
  return acd_t_(ACD.Students).rows.filter(function (s) {
    return s.StudentID && key_(s.Active) !== 'FALSE' && (lead || key_(s.TutorID) === key_(tu.TutorID));
  });
}
function acd_tutorPayload_(tu) {
  const lead = acd_isLead_(tu), C = acd_ctx_(), week = acd_monday_(today_()), today = today_();
  const mine = acd_mine_(tu), M = C.get(ACD.Mocks), R = C.get(ACD.Reading);
  let board = {};
  acd_board_(C).forEach(function (x) { board[key_(x.s.StudentID)] = x.rank; });
  const students = mine.map(function (s) {
    const id = key_(s.StudentID), sit = acd_sittings_(M, id), l5 = sit.slice(0, 5), m = acd_metrics_(C, s, ACD_LEADERBOARD_DAYS);
    return {
      StudentID: String(s.StudentID).trim(), Matric: String(s.Matric || ''), Name: s.Name, Track: String(s.Track || ''), Group: String(s.Group || ''), Family: String(s.Family || ''), IsUtme: key_(s.Track) === 'UTME',
      ExamDate: iso_(s.ExamDate), TargetPercent: Number(s.TargetPercent) || '', NextClass: iso_(s.NextClass, true), ClassLink: String(s.ClassLink || ''),
      Wa: acd_wa_(s.WhatsApp), PaymentStatus: payStatus_(s),
      Sittings: sit.length, Last: sit[0] ? { Date: sit[0].Date, Type: sit[0].Type, Percent: sit[0].Percent } : null,
      Avg5: l5.length ? Math.round(10 * l5.reduce(function (a, x) { return a + x.Percent; }, 0) / l5.length) / 10 : null,
      Reading: acd_reading_(R, id, week), Metrics: m, Rank: board[id] || null
    };
  }).sort(function (a, b) { return String(a.Name).localeCompare(String(b.Name)); });
  const ids = {}; students.forEach(function (s) { ids[key_(s.StudentID)] = s; });
  const avg = function (f) { const v = students.map(f).filter(function (x) { return x != null; }); return v.length ? acd_r1_(v.reduce(function (a, x) { return a + x; }, 0) / v.length) : null; };
  // attendance in the last 60 days for these students (to pre-fill the register)
  const from60 = new Date((dn_(today) - 60) * 86400000).toISOString().slice(0, 10);
  const attendance = C.get(ACD.Attendance).rows.filter(function (r) { return ids[key_(r.StudentID)] && iso_(r.Date) >= from60; })
    .map(function (r) { return { Date: iso_(r.Date), Session: String(r.Session || ''), StudentID: String(r.StudentID).trim(), Status: String(r.Status || '') }; });
  // tasks this mentor set (all tasks for a lead mentor), with their students' submissions
  const subsBy = {};
  C.get(ACD.TaskSubs).rows.forEach(function (r) { if (r.TaskID) (subsBy[String(r.TaskID)] = subsBy[String(r.TaskID)] || []).push(r); });
  const from45 = new Date((dn_(today) - 45) * 86400000).toISOString().slice(0, 10);
  const tasks = C.get(ACD.Tasks).rows.filter(function (t) { return t.TaskID && (lead || key_(t.TutorID) === key_(tu.TutorID)) && (iso_(t.Due) || iso_(t.Created)) >= from45; })
    .map(function (t) {
      const expected = mine.filter(function (s) { return matches_(t.Audience, acd_keys_(s)); }).length;
      const subs = (subsBy[String(t.TaskID)] || []).filter(function (r) { return ids[key_(r.StudentID)]; }).map(function (r) {
        return { SubmissionID: String(r.SubmissionID), StudentID: String(r.StudentID).trim(), Name: ids[key_(r.StudentID)].Name, Submitted: iso_(r.Submitted, true),
                 Answer: String(r.Answer || ''), Link: String(r.Link || ''), Score: r.Score === '' ? null : Number(r.Score), Feedback: String(r.Feedback || ''), Marked: r.Marked !== '' && r.Score !== '' };
      });
      return { TaskID: String(t.TaskID), Created: iso_(t.Created), Title: String(t.Title), Instructions: String(t.Instructions || ''), Subject: String(t.Subject || ''), Audience: String(t.Audience || ''),
               Due: iso_(t.Due), MaxScore: Number(t.MaxScore) || 0, Active: key_(t.Active) !== 'FALSE', Expected: expected, Submissions: subs };
    }).sort(function (a, b) { return a.Created < b.Created ? 1 : -1; });
  // tests
  const atBy = {};
  C.get(ACD.Attempts).rows.forEach(function (r) { if (r.Submitted) (atBy[String(r.TestID)] = atBy[String(r.TestID)] || []).push(r); });
  const tests = C.get(ACD.Tests).rows.filter(function (x) { return x.TestID && (lead || key_(x.TutorID) === key_(tu.TutorID)); }).map(function (x) {
    const at = (atBy[String(x.TestID)] || []).filter(function (r) { return lead || ids[key_(r.StudentID)]; });
    const byStu = {};
    at.forEach(function (r) { const k = key_(r.StudentID); if (!byStu[k] || Number(r.Percent) > byStu[k].Percent) byStu[k] = { StudentID: String(r.StudentID).trim(), Name: (ids[k] || {}).Name || String(r.StudentID), Percent: Number(r.Percent) || 0, Score: Number(r.Score) || 0, OutOf: Number(r.OutOf) || 0 }; });
    const best = Object.keys(byStu).map(function (k) { return byStu[k]; }).sort(function (a, b) { return b.Percent - a.Percent; });
    return { TestID: String(x.TestID), Title: String(x.Title), Subject: String(x.Subject || ''), Kind: String(x.Kind), Audience: String(x.Audience || ''), Opens: iso_(x.Opens, true), Closes: iso_(x.Closes, true),
             Minutes: Number(x.Minutes) || 0, Questions: Number(x.Questions) || 0, Active: key_(x.Active) !== 'FALSE', Created: iso_(x.Created),
             Attempts: at.length, Students: best.length, Average: best.length ? acd_r1_(best.reduce(function (a, b) { return a + b.Percent; }, 0) / best.length) : null, Results: best };
  }).sort(function (a, b) { return a.Created < b.Created ? 1 : -1; });
  const groups = [];
  students.forEach(function (s) { if (s.Group && groups.indexOf(s.Group) < 0) groups.push(s.Group); });
  // mentorship families this mentor leads (a lead mentor sees all)
  const tnames = acd_tutorNames_();
  const famScores = {}; acd_familyScores_(C, acd_board_(C)).forEach(function (x) { famScores[key_(x.FamilyID)] = x; });
  const families = C.get(ACD.Families).rows.filter(function (fm) { return fm.FamilyID && key_(fm.Active) !== 'FALSE' && (lead || key_(fm.MentorID) === key_(tu.TutorID)); }).map(function (fm) {
    const sc = famScores[key_(fm.FamilyID)] || {};
    return { FamilyID: String(fm.FamilyID), Name: String(fm.Name || ''), Motto: String(fm.Motto || ''), Mentor: tnames[key_(fm.MentorID)] || '', Score: sc.Score == null ? null : sc.Score, Rank: sc.Rank || null,
             Members: C.get(ACD.Students).rows.filter(function (m) { return m.StudentID && key_(m.Active) !== 'FALSE' && key_(m.Family) === key_(fm.FamilyID); }).map(function (m) { return { StudentID: String(m.StudentID).trim(), Name: String(m.Name || '') }; }),
             Posts: acd_board__(C, fm.FamilyID, true, String(tu.TutorID)) };
  });
  // classes for this mentor's groups
  const sgroups = acd_sessionGroups_(tu);
  const sessions = acd_sessionList_(C, lead ? ['*'] : sgroups, tnames, today, acd_shift_(today, -30), acd_shift_(today, 60));
  sessions.forEach(function (x) { x.Mine = key_(x.TutorID) === key_(tu.TutorID) || lead; });
  return {
    families: families, familyCount: C.get(ACD.Families).rows.filter(function (fm) { return fm.FamilyID && key_(fm.Active) !== 'FALSE'; }).length,
    sessions: sessions, sessionGroups: sgroups,
    ok: true, today: today, now: acd_now_(), teacher: { TeacherID: String(tu.TutorID).trim(), Name: tu.Name, Role: lead ? 'Admin' : 'Tutor' },
    students: students, types: ACD_MOCK_TYPES, subjects: ACD_SUBJECTS, readingUnit: ACD_READING_UNIT, week: week,
    overview: { students: students.length, mocks: avg(function (s) { return s.Metrics.mocks; }), attendance: avg(function (s) { return s.Metrics.attendance; }),
                tasks: avg(function (s) { return s.Metrics.tasks; }), overall: avg(function (s) { return s.Metrics.overall; }),
                atRisk: students.filter(function (s) { const m = s.Metrics; return (m.overall != null && m.overall < 50) || (m.attendance != null && m.attendance < 60); }).map(function (s) { return s.StudentID; }) },
    attendance: attendance, statuses: ACD_ATTENDANCE, tasks: tasks, tests: tests, kinds: ACD_TEST_KINDS, groups: groups, tracks: ['UTME', 'Post-UTME', 'A-Levels', 'O-Levels']
  };
}
function acd_pickMine_(tu, ids) {
  const mine = {}; acd_mine_(tu).forEach(function (s) { mine[key_(s.StudentID)] = s; });
  ids = (Array.isArray(ids) ? ids : []).map(key_);
  if (!ids.length) return { error: 'Tick at least one student.' };
  const out = ids.map(function (i) { return mine[i]; });
  if (out.some(function (x) { return !x; })) return { error: 'One of those students is not assigned to you.' };
  return { list: out };
}
function acd_saveMock_(tu, p) {
  const subject = String(p.subject || '').trim().slice(0, 40), type = String(p.type || ''), date = String(p.date || ''), outOf = Number(p.outOf);
  if (!subject) return { ok: false, error: 'Enter the subject.' };
  if (ACD_MOCK_TYPES.indexOf(type) < 0) return { ok: false, error: 'Choose the type of mock.' };
  if (!acd_isDay_(date) || date > today_()) return { ok: false, error: 'Choose a valid date that is not in the future.' };
  if (!(outOf > 0 && outOf <= 1000)) return { ok: false, error: 'Enter what the mock was out of.' };
  const scores = Array.isArray(p.scores) ? p.scores : [];
  if (!scores.length) return { ok: false, error: 'Enter at least one score.' };
  const pick = acd_pickMine_(tu, scores.map(function (x) { return x.studentId; }));
  if (pick.error) return { ok: false, error: pick.error };
  for (let i = 0; i < scores.length; i++) {
    const sc = Number(scores[i].score);
    if (!(sc >= 0 && sc <= outOf)) return { ok: false, error: 'Each score must be between 0 and ' + outOf + '.' };
  }
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const M = acd_t_(ACD.Mocks);
    scores.forEach(function (x) {
      const id = key_(x.studentId);
      const ex = M.rows.filter(function (r) { return key_(r.StudentID) === id && iso_(r.Date) === date && String(r.Type) === type && key_(r.Subject) === key_(subject); })[0];
      if (ex) { put_(M, ex._row, 'Score', Number(x.score)); put_(M, ex._row, 'OutOf', outOf); put_(M, ex._row, 'TutorID', String(tu.TutorID), true); put_(M, ex._row, 'Recorded', new Date()); }
      else {
        const row = append_(M, { StudentID: id, Date: date, Type: type, Subject: subject, Score: Number(x.score), OutOf: outOf, TutorID: String(tu.TutorID), Recorded: new Date() }, ['StudentID', 'Date', 'Type', 'Subject', 'TutorID']);
        M.rows.push({ _row: row, StudentID: id, Date: date, Type: type, Subject: subject });
      }
    });
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('acd_board');
  return { ok: true };
}
function acd_saveGoals_(tu, p) {
  const exam = String(p.examDate || ''), target = String(p.target == null ? '' : p.target).trim();
  if (!exam && !target) return { ok: false, error: 'Enter an exam date or a target score.' };
  if (exam && !acd_isDay_(exam)) return { ok: false, error: 'Choose a valid exam date.' };
  if (target && !(Number(target) >= 1 && Number(target) <= 100)) return { ok: false, error: 'The target is a percentage from 1 to 100.' };
  const pick = acd_pickMine_(tu, p.studentIds);
  if (pick.error) return { ok: false, error: pick.error };
  const S = acd_t_(ACD.Students);
  pick.list.forEach(function (s) {
    if (exam) put_(S, s._row, 'ExamDate', exam, true);
    if (target) put_(S, s._row, 'TargetPercent', Number(target));
  });
  return { ok: true };
}
function acd_saveClass_(tu, p) {
  const when = String(p.nextClass || ''), link = String(p.link || '').trim().slice(0, 500);
  if (!when && !link) return { ok: false, error: 'Enter a date and time, or a link.' };
  if (when && !acd_isWhen_(when)) return { ok: false, error: 'Choose a valid date and time.' };
  if (link && !/^https?:\/\//i.test(link)) return { ok: false, error: 'The class link must start with http:// or https://' };
  const pick = acd_pickMine_(tu, p.studentIds);
  if (pick.error) return { ok: false, error: pick.error };
  const S = acd_t_(ACD.Students);
  pick.list.forEach(function (s) {
    if (when) put_(S, s._row, 'NextClass', when, true);
    if (link) put_(S, s._row, 'ClassLink', link, true);
  });
  return { ok: true };
}
function acd_saveAttendance_(tu, p) {
  const date = String(p.date || ''), session = acd_txt_(p.session, 60) || 'Class';
  if (!acd_isDay_(date) || date > today_()) return { ok: false, error: 'Choose a valid date that is not in the future.' };
  const marks = (Array.isArray(p.marks) ? p.marks : []).filter(function (m) { return ACD_ATTENDANCE.indexOf(String(m.status)) >= 0; });
  if (!marks.length) return { ok: false, error: 'Mark at least one student.' };
  const pick = acd_pickMine_(tu, marks.map(function (m) { return m.studentId; }));
  if (pick.error) return { ok: false, error: pick.error };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const A = acd_t_(ACD.Attendance);
    marks.forEach(function (m) {
      const id = key_(m.studentId);
      const ex = A.rows.filter(function (r) { return key_(r.StudentID) === id && iso_(r.Date) === date && key_(r.Session) === key_(session); })[0];
      if (ex) { put_(A, ex._row, 'Status', String(m.status)); put_(A, ex._row, 'TutorID', String(tu.TutorID), true); put_(A, ex._row, 'Recorded', new Date()); }
      else {
        const row = append_(A, { Date: date, Session: session, StudentID: id, Status: String(m.status), TutorID: String(tu.TutorID), Recorded: new Date() }, ['Date', 'Session', 'StudentID', 'TutorID']);
        A.rows.push({ _row: row, Date: date, Session: session, StudentID: id });
      }
    });
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('acd_board');
  return { ok: true };
}
function acd_audienceOk_(tu, aud) {   // a mentor can set work for: all their students, a class group, a track, or (lead mentor) everyone
  if (aud === 'TUTOR:' + key_(tu.TutorID)) return true;
  if (aud === 'ACADEMY') return acd_isLead_(tu);
  const mine = acd_mine_(tu);
  return mine.some(function (s) { return key_(s.Group) === key_(aud) || key_(s.Track) === key_(aud); });
}
function acd_saveTask_(tu, p) {
  const title = acd_txt_(p.title, 120), instr = acd_txt_(p.instructions, 3000), subject = acd_txt_(p.subject, 40), due = String(p.due || ''), max = Number(p.maxScore);
  const aud = acd_txt_(p.audience, 60) || 'TUTOR:' + key_(tu.TutorID);
  if (!title) return { ok: false, error: 'Enter a title for the task.' };
  if (!acd_isDay_(due)) return { ok: false, error: 'Choose the due date.' };
  if (!(max >= 1 && max <= 1000)) return { ok: false, error: 'Enter the maximum score (1 to 1000).' };
  if (!acd_audienceOk_(tu, aud)) return { ok: false, error: 'Choose who the task is for.' };
  append_(acd_t_(ACD.Tasks), { TaskID: acd_id_('TK-'), Created: today_(), Title: title, Instructions: instr, Subject: subject, Audience: aud, Due: due, MaxScore: max, TutorID: String(tu.TutorID), Active: 'TRUE' },
          ['TaskID', 'Created', 'Title', 'Instructions', 'Subject', 'Audience', 'Due', 'TutorID']);
  return { ok: true };
}
function acd_closeTask_(tu, p) {
  const T = acd_t_(ACD.Tasks), t = T.rows.filter(function (r) { return String(r.TaskID) === String(p.taskId); })[0];
  if (!t || (!acd_isLead_(tu) && key_(t.TutorID) !== key_(tu.TutorID))) return { ok: false, error: 'Task not found.' };
  put_(T, t._row, 'Active', p.reopen ? 'TRUE' : 'FALSE');
  CacheService.getScriptCache().remove('acd_board');
  return { ok: true };
}
function acd_markTask_(tu, p) {
  const TS = acd_t_(ACD.TaskSubs), sb = TS.rows.filter(function (r) { return String(r.SubmissionID) === String(p.submissionId); })[0];
  if (!sb) return { ok: false, error: 'Submission not found.' };
  const t = acd_t_(ACD.Tasks).rows.filter(function (r) { return String(r.TaskID) === String(sb.TaskID); })[0];
  if (!t) return { ok: false, error: 'Task not found.' };
  const mineOk = acd_isLead_(tu) || key_(t.TutorID) === key_(tu.TutorID) || acd_mine_(tu).some(function (s) { return key_(s.StudentID) === key_(sb.StudentID); });
  if (!mineOk) return { ok: false, error: 'This submission is not from one of your students.' };
  const score = Number(p.score), max = Number(t.MaxScore) || 0;
  if (!(score >= 0 && score <= max)) return { ok: false, error: 'The score must be between 0 and ' + max + '.' };
  put_(TS, sb._row, 'Score', score); put_(TS, sb._row, 'Feedback', acd_txt_(p.feedback, 1000), true);
  put_(TS, sb._row, 'Marked', acd_now_(), true); put_(TS, sb._row, 'MarkedBy', String(tu.TutorID), true);
  CacheService.getScriptCache().remove('acd_board');
  return { ok: true };
}

/* ----- CBT tests, written in a simple text format -----
   1. Question text (it can run over several lines)
   A. option
   B. option
   C. option
   D. option
   Answer: B
   Explanation: optional
   (a blank line between questions) */
function acd_parseQuestions_(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean);
  const out = [], errors = [];
  blocks.forEach(function (b, i) {
    const q = { Question: '', A: '', B: '', C: '', D: '', E: '', Answer: '', Explanation: '' }, lines = b.split('\n');
    let last = 'Question';
    lines.forEach(function (raw) {
      const l = raw.trim(); let m;
      if (!l) return;
      if ((m = /^\(?([A-Ea-e])[.)]\s+(.*)$/.exec(l)) && last !== 'Explanation') { q[m[1].toUpperCase()] = m[2].trim(); last = m[1].toUpperCase(); }
      else if ((m = /^(?:answer|ans|correct)\s*[:\-]\s*\(?([A-Ea-e])\)?\b/i.exec(l))) { q.Answer = m[1].toUpperCase(); last = 'Answer'; }
      else if ((m = /^(?:explanation|why|note)\s*[:\-]\s*(.*)$/i.exec(l))) { q.Explanation = m[1].trim(); last = 'Explanation'; }
      else if (last === 'Question') q.Question += (q.Question ? ' ' : '') + l.replace(/^(?:q(?:uestion)?\s*)?\d+\s*[.):-]\s*/i, '');
      else if (last === 'Explanation') q.Explanation += ' ' + l;
      else if (/^[A-E]$/.test(last)) q[last] += ' ' + l;
    });
    const n = i + 1, opts = ['A', 'B', 'C', 'D', 'E'].filter(function (k) { return q[k]; });
    if (!q.Question) errors.push('Question ' + n + ' has no question text.');
    else if (opts.length < 2) errors.push('Question ' + n + ' needs at least two options (A. and B.).');
    else if (!q.Answer) errors.push('Question ' + n + ' has no "Answer:" line.');
    else if (!q[q.Answer]) errors.push('Question ' + n + ': the answer ' + q.Answer + ' is not one of its options.');
    q.Question = q.Question.slice(0, 1500); opts.forEach(function (k) { q[k] = q[k].slice(0, 500); }); q.Explanation = q.Explanation.slice(0, 1000);
    out.push(q);
  });
  return { questions: out, errors: errors };
}
function acd_saveTest_(tu, p) {
  const title = acd_txt_(p.title, 120), subject = acd_txt_(p.subject, 40), kind = String(p.kind || ''), aud = acd_txt_(p.audience, 60) || 'TUTOR:' + key_(tu.TutorID);
  const opens = String(p.opens || ''), closes = String(p.closes || ''), minutes = Math.round(Number(p.minutes) || 0);
  if (!title) return { ok: false, error: 'Enter a title for the test.' };
  if (ACD_TEST_KINDS.indexOf(kind) < 0) return { ok: false, error: 'Choose Practice or Sunday mock.' };
  if (opens && !acd_isWhen_(opens)) return { ok: false, error: 'Choose a valid opening date and time.' };
  if (closes && !acd_isWhen_(closes)) return { ok: false, error: 'Choose a valid closing date and time.' };
  if (opens && closes && closes <= opens) return { ok: false, error: 'The test must close after it opens.' };
  if (kind === 'Sunday mock' && (!opens || !closes)) return { ok: false, error: 'A Sunday mock needs an opening and a closing time.' };
  if (!(minutes >= 0 && minutes <= 300)) return { ok: false, error: 'The time limit must be between 0 (no limit) and 300 minutes.' };
  if (!acd_audienceOk_(tu, aud)) return { ok: false, error: 'Choose who the test is for.' };
  const parsed = acd_parseQuestions_(p.questions);
  if (!parsed.questions.length) return { ok: false, error: 'Paste at least one question.' };
  if (parsed.errors.length) return { ok: false, error: parsed.errors.slice(0, 3).join(' ') };
  if (parsed.questions.length > 200) return { ok: false, error: 'A test can have up to 200 questions.' };
  const tid = acd_id_('CB-');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    append_(acd_t_(ACD.Tests), { TestID: tid, Title: title, Subject: subject, Kind: kind, Audience: aud, Opens: opens, Closes: closes, Minutes: minutes, Questions: parsed.questions.length,
                                TutorID: String(tu.TutorID), Active: 'TRUE', Created: today_() }, ['TestID', 'Title', 'Subject', 'Kind', 'Audience', 'Opens', 'Closes', 'TutorID', 'Created']);
    const Q = acd_t_(ACD.Questions), head = Q.head;
    const rows = parsed.questions.map(function (q, i) {
      const o = { TestID: tid, No: i + 1, Question: q.Question, A: q.A, B: q.B, C: q.C, D: q.D, E: q.E, Answer: q.Answer, Explanation: q.Explanation };
      return head.map(function (h) { return o[h] === undefined ? '' : o[h]; });
    });
    Q.sh.getRange(Q.sh.getLastRow() + 1, 1, rows.length, head.length).setNumberFormat('@').setValues(rows);
  } finally { lock.releaseLock(); }
  return { ok: true };
}
function acd_closeTest_(tu, p) {
  const X = acd_t_(ACD.Tests), x = X.rows.filter(function (r) { return String(r.TestID) === String(p.testId); })[0];
  if (!x || (!acd_isLead_(tu) && key_(x.TutorID) !== key_(tu.TutorID))) return { ok: false, error: 'Test not found.' };
  put_(X, x._row, 'Active', p.reopen ? 'TRUE' : 'FALSE');
  return { ok: true };
}

/* A mentor (their own students) or an admin (anyone) opens a student's full dashboard */
function acd_viewStudent_(tu, studentId, admin) {
  const s = acd_reload_(ACD.Students, 'StudentID', studentId);
  if (!s || !s.StudentID) return { ok: false, error: 'Student not found.' };
  if (!admin && !acd_isLead_(tu) && key_(s.TutorID) !== key_(tu.TutorID)) return { ok: false, error: 'This student is not assigned to you.' };
  return acd_studentPayload_(s, admin ? 'admin' : 'mentor');
}

/* ===== ADMIN ===== */
function acd_adminPayload_(ad) {
  const C = acd_ctx_(), tutors = acd_tutorNames_(), S = C.get(ACD.Students), names = {}, today = today_();
  const boardList = acd_board_(C), rank = {};
  boardList.forEach(function (x) { rank[key_(x.s.StudentID)] = x.rank; });
  const all = S.rows.filter(function (s) { return s.StudentID; }).map(function (s) {
    names[key_(s.StudentID)] = s.Name;
    const active = key_(s.Active) !== 'FALSE';
    return {
      StudentID: String(s.StudentID).trim(), Matric: String(s.Matric || ''), Name: s.Name, Level: String(s.Group || ''), Family: String(s.Family || ''), Plan: String(s.Track || ''), MonthlyFee: Number(s.MonthlyFee) || 0,
      PaymentStatus: payStatus_(s), NextDue: iso_(s.NextDue), TeacherID: String(s.TutorID || '').trim(), Teacher: tutors[key_(s.TutorID)] || '',
      NextClass: iso_(s.NextClass, true), ClassLink: String(s.ClassLink || ''), Active: active, Email: String(s.Email || ''), WhatsApp: String(s.WhatsApp || ''),
      ExamDate: iso_(s.ExamDate), Enrolled: iso_(s.Enrolled), Metrics: active ? acd_metrics_(C, s, ACD_LEADERBOARD_DAYS) : null, Rank: rank[key_(s.StudentID)] || null
    };
  });
  const students = all.filter(function (s) { return s.Active; });
  const levels = acd_groups_();
  // reports
  const avg = function (list, f) { const v = list.map(f).filter(function (x) { return x != null; }); return v.length ? acd_r1_(v.reduce(function (a, x) { return a + x; }, 0) / v.length) : null; };
  const summarise = function (list) {
    return { students: list.length, overall: avg(list, function (s) { return s.Metrics.overall; }), mocks: avg(list, function (s) { return s.Metrics.mocks; }),
             attendance: avg(list, function (s) { return s.Metrics.attendance; }), tasks: avg(list, function (s) { return s.Metrics.tasks; }),
             reading: avg(list, function (s) { return s.Metrics.reading; }), overdue: list.filter(function (s) { return s.PaymentStatus === 'Overdue'; }).length };
  };
  const byGroup = levels.map(function (g) { const l = students.filter(function (s) { return s.Level === g; }); return Object.assign({ name: g }, summarise(l)); }).filter(function (x) { return x.students; });
  const noGroup = students.filter(function (s) { return !s.Level; });
  if (noGroup.length) byGroup.push(Object.assign({ name: 'No class group' }, summarise(noGroup)));
  const tlist = acd_t_(ACD.Tutors).rows.filter(function (t) { return t.TutorID; });
  const byTutor = tlist.filter(function (t) { return key_(t.Active) !== 'FALSE'; }).map(function (t) {
    const l = students.filter(function (s) { return key_(s.TeacherID) === key_(t.TutorID); }); return Object.assign({ name: String(t.Name), id: String(t.TutorID) }, summarise(l));
  });
  const trackNames = ['UTME', 'Post-UTME', 'A-Levels', 'O-Levels'];
  const byTrack = trackNames.map(function (k) { const l = students.filter(function (s) { return key_(s.Plan) === key_(k); }); return Object.assign({ name: k }, summarise(l)); }).filter(function (x) { return x.students; });
  // weekly averages for the last 8 weeks: mocks and attendance
  const weeks = [];
  for (let i = 7; i >= 0; i--) weeks.push(new Date((dn_(acd_monday_(today)) - 7 * i) * 86400000).toISOString().slice(0, 10));
  const activeIds = {}; students.forEach(function (s) { activeIds[key_(s.StudentID)] = true; });
  const wkOf = function (d) { return acd_monday_(d); };
  const mk = {}, at = {};
  C.get(ACD.Mocks).rows.forEach(function (r) { if (!activeIds[key_(r.StudentID)] || !r.Date || !(Number(r.OutOf) > 0)) return; const w = wkOf(iso_(r.Date)); (mk[w] = mk[w] || [0, 0]); mk[w][0] += Number(r.Score) || 0; mk[w][1] += Number(r.OutOf); });
  C.get(ACD.Attendance).rows.forEach(function (r) { if (!activeIds[key_(r.StudentID)] || !r.Date || r.Status === 'Excused') return; const w = wkOf(iso_(r.Date)); (at[w] = at[w] || [0, 0]); at[w][1]++; if (r.Status === 'Present' || r.Status === 'Late') at[w][0]++; });
  const trend = weeks.map(function (w) { return { Week: w, Mocks: mk[w] ? acd_r1_(100 * mk[w][0] / mk[w][1]) : null, Attendance: at[w] ? acd_r1_(100 * at[w][0] / at[w][1]) : null }; });
  const subs = C.get(ACD.TaskSubs).rows.filter(function (r) { return r.SubmissionID; }), atts = C.get(ACD.Attempts).rows.filter(function (r) { return r.Submitted; });
  const since30 = new Date((dn_(today) - 30) * 86400000).toISOString().slice(0, 10);
  const reports = Object.assign(summarise(students), {
    days: ACD_LEADERBOARD_DAYS, byGroup: byGroup, byTutor: byTutor, byTrack: byTrack, trend: trend,
    taskSubs30: subs.filter(function (r) { return iso_(r.Submitted) >= since30; }).length, cbtAttempts30: atts.filter(function (r) { return iso_(r.Submitted) >= since30; }).length,
    paid: students.filter(function (s) { return s.PaymentStatus === 'Paid'; }).length, due: students.filter(function (s) { return s.PaymentStatus === 'Due'; }).length,
    atRisk: students.filter(function (s) { const m = s.Metrics; return (m.overall != null && m.overall < 50) || (m.attendance != null && m.attendance < 60); })
      .map(function (s) { return { StudentID: s.StudentID, Name: s.Name, Group: s.Level, Teacher: s.Teacher, Overall: s.Metrics.overall, Attendance: s.Metrics.attendance }; })
  });
  const gtab = C.get(ACD.Groups).rows.filter(function (g) { return g.Group; }).map(function (g) {
    return { Group: String(g.Group), MeetLink: String(g.MeetLink || ''), TelegramLink: String(g.TelegramLink || ''), Timetable: String(g.Timetable || ''), Active: key_(g.Active) !== 'FALSE' };
  });
  levels.forEach(function (l) { if (!gtab.some(function (g) { return key_(g.Group) === key_(l); })) gtab.push({ Group: l, MeetLink: '', TelegramLink: '', Timetable: '', Active: true }); });
  const famScores = {}; acd_familyScores_(C, boardList).forEach(function (x) { famScores[key_(x.FamilyID)] = x; });
  const families = C.get(ACD.Families).rows.filter(function (fm) { return fm.FamilyID; }).map(function (fm) {
    const sc = famScores[key_(fm.FamilyID)] || {}, active = key_(fm.Active) !== 'FALSE';
    return { FamilyID: String(fm.FamilyID), Name: String(fm.Name || ''), Motto: String(fm.Motto || ''), MentorID: String(fm.MentorID || ''), Mentor: tutors[key_(fm.MentorID)] || '', Active: active,
             Score: sc.Score == null ? null : sc.Score, Rank: sc.Rank || null, Members: students.filter(function (st) { return key_(st.Family) === key_(fm.FamilyID); }).map(function (st) { return { StudentID: st.StudentID, Name: st.Name }; }),
             Posts: active ? acd_board__(C, fm.FamilyID, true, String(ad.AdminID)) : [] };
  });
  return {
    families: families,
    ok: true, today: today, admin: { AdminID: String(ad.AdminID).trim(), Name: ad.Name },
    students: students, removed: all.filter(function (s) { return !s.Active; }).map(function (s) { return { StudentID: s.StudentID, Name: s.Name, Plan: s.Plan, Level: s.Level }; }),
    teachers: tlist.filter(function (t) { return key_(t.Active) !== 'FALSE'; }).map(function (t) { return { TeacherID: String(t.TutorID).trim(), Name: t.Name }; }),
    tutors: tlist.map(function (t) { return { TutorID: String(t.TutorID).trim(), Name: String(t.Name || ''), Role: String(t.Role || 'Tutor') || 'Tutor', Email: String(t.Email || ''), WhatsApp: String(t.WhatsApp || ''), Active: key_(t.Active) !== 'FALSE',
      Students: students.filter(function (s) { return key_(s.TeacherID) === key_(t.TutorID); }).length }; }),
    levels: levels, tracks: trackNames, groups: gtab, reports: reports,
    payments: acd_t_(ACD.Payments).rows.filter(function (r) { return r.StudentID; }).map(function (r) {
      return { Date: iso_(r.Date), StudentID: String(r.StudentID).trim(), Name: names[key_(r.StudentID)] || '', Amount: Number(r.Amount) || 0, Months: Number(r.Months) || 1, Reference: r.Reference };
    }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 20)
  };
}
function acd_confirmPayment_(ad, p) {
  const id = key_(p.studentId), amount = Number(p.amount), months = Math.round(Number(p.months)), date = String(p.date || ''), ref = String(p.reference || '').trim().slice(0, 60);
  if (!(amount > 0)) return { ok: false, error: 'Enter the amount received.' };
  if (!(months >= 1 && months <= 24)) return { ok: false, error: 'Months must be between 1 and 24.' };
  if (!acd_isDay_(date) || date > today_()) return { ok: false, error: 'The date cannot be in the future.' };
  let s = null, nd = '';
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const S = acd_t_(ACD.Students);
    s = S.rows.filter(function (r) { return key_(r.StudentID) === id; })[0];
    if (!s) return { ok: false, error: 'Student not found.' };
    const cur = iso_(s.NextDue), base = (cur && cur >= date) ? cur : date;
    nd = addMonths_(base, months);
    s.NextDue = nd; s.PaymentStatus = 'Paid'; s.PaymentStatus = payStatus_(s);
    put_(S, s._row, 'NextDue', nd, true); put_(S, s._row, 'PaymentStatus', s.PaymentStatus);
    append_(acd_t_(ACD.Payments), {
      PaymentID: 'P-' + Utilities.getUuid().slice(0, 6).toUpperCase(), StudentID: String(s.StudentID).trim(), Date: date, Amount: amount, Months: months,
      Reference: ref, Method: 'Bank transfer', ConfirmedBy: String(ad.AdminID), Recorded: new Date()
    }, ['StudentID', 'Date', 'Reference', 'ConfirmedBy']);
  } finally { lock.releaseLock(); }
  sendEmail_(s, SCHOOL_NAME + ': payment received', 'Assalaamu alaykum ' + String(s.Name).split(' ')[0] + '. We have received your Academy payment of ' + naira_(amount) +
    '. Your next payment is due on ' + nice_(nd) + '. Jazakumullahu khayran.\n\n' + ACD_DASHBOARD_URL);
  return { ok: true };
}
function acd_assign_(p) {
  const tid = String(p.teacherId || '').trim(), level = String(p.level || '').trim().slice(0, 40), fam = String(p.familyId || '').trim();
  const ids = (Array.isArray(p.studentIds) ? p.studentIds : []).map(key_);
  if (!ids.length) return { ok: false, error: 'Tick at least one student.' };
  if (!tid && !level && !fam) return { ok: false, error: 'Choose a mentor, class group or family to apply.' };
  if (fam && fam !== 'NONE' && !acd_t_(ACD.Families).rows.some(function (f) { return key_(f.FamilyID) === key_(fam); })) return { ok: false, error: 'Family not found.' };
  if (tid && !acd_t_(ACD.Tutors).rows.some(function (t) { return key_(t.TutorID) === key_(tid); })) return { ok: false, error: 'Tutor not found.' };
  const S = acd_t_(ACD.Students);
  const rows = ids.map(function (i) { return S.rows.filter(function (r) { return key_(r.StudentID) === i; })[0]; });
  if (rows.some(function (r) { return !r; })) return { ok: false, error: 'Student not found.' };
  rows.forEach(function (s) {
    if (tid) put_(S, s._row, 'TutorID', tid, true);
    if (level) put_(S, s._row, 'Group', level, true);
    if (fam) put_(S, s._row, 'Family', fam === 'NONE' ? '' : fam, true);
  });
  CacheService.getScriptCache().remove('acd_board');
  return { ok: true };
}
function acd_nextId_(rows, field, prefix, width) {
  let max = 0;
  rows.forEach(function (r) { const m = new RegExp('^' + prefix + '(\\d+)$', 'i').exec(String(r[field] || '').trim()); if (m) max = Math.max(max, +m[1]); });
  return prefix + String(max + 1).padStart(width, '0');
}
function acd_loginEmail_(to, name, id, code, page, what) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to || ''))) return 'No email address';
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return 'Email limit reached';
    MailApp.sendEmail({ to: String(to).trim(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': your ' + what + ' login',
      body: 'Assalaamu alaykum ' + String(name).split(' ')[0] + ',\n\nHere are your login details for the Himaayah Academy ' + what + ' portal.\n\nID: ' + id + '\nAccess code: ' + code + '\n\nSign in here: ' + page +
            '\n\nKeep the access code private. You can change it after signing in.\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
    return 'Emailed';
  } catch (e) { console.error(e); return 'Email failed'; }
}
function acd_saveStudent_(p) {
  const name = acd_txt_(p.name, 100), matric = acd_txt_(p.matric, 40), track = String(p.track || ''), group = acd_txt_(p.group, 40), tid = String(p.tutorId || '').trim();
  const email = acd_txt_(p.email, 200), wa = acd_txt_(p.whatsapp, 30), fee = String(p.monthlyFee == null ? '' : p.monthlyFee).trim(), nd = String(p.nextDue || ''), exam = String(p.examDate || '');
  if (!name) return { ok: false, error: 'Enter the student’s full name.' };
  if (['UTME', 'Post-UTME', 'A-Levels', 'O-Levels'].indexOf(track) < 0) return { ok: false, error: 'Choose the track.' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Check the email address.' };
  if (fee && !(Number(fee) >= 0)) return { ok: false, error: 'The monthly fee must be a number.' };
  if (nd && !acd_isDay_(nd)) return { ok: false, error: 'Choose a valid next due date.' };
  if (exam && !acd_isDay_(exam)) return { ok: false, error: 'Choose a valid exam date.' };
  if (tid && !acd_t_(ACD.Tutors).rows.some(function (t) { return key_(t.TutorID) === key_(tid); })) return { ok: false, error: 'Mentor not found.' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let created = null;
  try {
    const S = acd_t_(ACD.Students);
    if (matric && S.rows.some(function (r) { return key_(r.Matric) === key_(matric) && key_(r.StudentID) !== key_(p.studentId); })) return { ok: false, error: 'Another student already has that matric number.' };
    if (matric && S.rows.some(function (r) { return key_(r.StudentID) === key_(matric); })) return { ok: false, error: 'A matric number cannot be the same as a Student ID.' };
    const vals = { Matric: matric, Name: name, Track: track, Group: group, TutorID: tid, Email: email, WhatsApp: wa, MonthlyFee: fee === '' ? '' : Number(fee), NextDue: nd, ExamDate: exam };
    const textF = ['Matric', 'Name', 'Track', 'Group', 'TutorID', 'Email', 'WhatsApp', 'NextDue', 'ExamDate'];
    if (p.studentId) {
      const s = S.rows.filter(function (r) { return key_(r.StudentID) === key_(p.studentId); })[0];
      if (!s) return { ok: false, error: 'Student not found.' };
      Object.keys(vals).forEach(function (k) { put_(S, s._row, k, vals[k], textF.indexOf(k) >= 0); });
    } else {
      const id = acd_nextId_(S.rows, 'StudentID', ACD_ID_PREFIX, 4), code = en_code();
      append_(S, Object.assign({ StudentID: id, AccessCode: code, PaymentStatus: nd ? '' : 'Due', Active: 'TRUE', Enrolled: today_(), Ref: 'Added by admin', TargetPercent: '', NextClass: '', ClassLink: '' }, vals),
              textF.concat(['StudentID', 'AccessCode', 'Enrolled', 'Ref']));
      created = { kind: 'student', id: id, code: code, name: name, emailed: p.sendEmail ? acd_loginEmail_(email, name, id, code, ACD_DASHBOARD_URL, 'student') : '' };
    }
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('acd_board');
  return { ok: true, created: created };
}
function acd_setActive_(tab, field, id, on) {
  const T = acd_t_(tab), r = T.rows.filter(function (x) { return key_(x[field]) === key_(id); })[0];
  if (!r) return { ok: false, error: 'Not found.' };
  put_(T, r._row, 'Active', on ? 'TRUE' : 'FALSE');
  CacheService.getScriptCache().remove('acd_board');
  return { ok: true };
}
function acd_resetCode_(tab, field, id, sendEmail) {
  const T = acd_t_(tab), r = T.rows.filter(function (x) { return key_(x[field]) === key_(id); })[0];
  if (!r) return { ok: false, error: 'Not found.' };
  const code = en_code();
  put_(T, r._row, 'AccessCode', code, true);
  const student = tab === ACD.Students;
  return { ok: true, created: { kind: student ? 'student' : 'mentor', reset: true, id: String(r[field]).trim(), code: code, name: String(r.Name || ''),
    emailed: sendEmail ? acd_loginEmail_(r.Email, r.Name, String(r[field]).trim(), code, student ? ACD_DASHBOARD_URL : ACD_DASHBOARD_URL.replace('academy-dashboard', 'academy-tutor'), student ? 'student' : 'mentor') : '' } };
}
function acd_saveTutor_(p) {
  const name = acd_txt_(p.name, 100), role = String(p.role || 'Tutor') === 'Admin' ? 'Admin' : 'Tutor', email = acd_txt_(p.email, 200), wa = acd_txt_(p.whatsapp, 30);
  if (!name) return { ok: false, error: 'Enter the mentor’s name.' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Check the email address.' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let created = null;
  try {
    const T = acd_t_(ACD.Tutors);
    if (p.tutorId) {
      const t = T.rows.filter(function (r) { return key_(r.TutorID) === key_(p.tutorId); })[0];
      if (!t) return { ok: false, error: 'Mentor not found.' };
      put_(T, t._row, 'Name', name, true); put_(T, t._row, 'Role', role); put_(T, t._row, 'Email', email, true); put_(T, t._row, 'WhatsApp', wa, true);
    } else {
      const id = acd_nextId_(T.rows, 'TutorID', ACD_TUTOR_PREFIX, 3), code = en_code() + en_code();
      append_(T, { TutorID: id, Name: name, AccessCode: code, Role: role, Email: email, WhatsApp: wa, Active: 'TRUE' }, ['TutorID', 'Name', 'AccessCode', 'Email', 'WhatsApp']);
      created = { kind: 'mentor', id: id, code: code, name: name, emailed: p.sendEmail ? acd_loginEmail_(email, name, id, code, ACD_DASHBOARD_URL.replace('academy-dashboard', 'academy-tutor'), 'mentor') : '' };
    }
  } finally { lock.releaseLock(); }
  return { ok: true, created: created };
}
function acd_saveGroup_(p) {
  const g = acd_txt_(p.group, 40), meet = acd_txt_(p.meetLink, 500), tg = acd_txt_(p.telegramLink, 500), tt = acd_txt_(p.timetable, 500);
  if (!g) return { ok: false, error: 'Enter the class group name.' };
  if (meet && !/^https?:\/\//i.test(meet)) return { ok: false, error: 'The Google Meet link must start with https://' };
  if (tg && !/^https?:\/\//i.test(tg)) return { ok: false, error: 'The Telegram link must start with https://' };
  const G = acd_t_(ACD.Groups), r = G.rows.filter(function (x) { return key_(x.Group) === key_(g); })[0];
  const vals = { Group: g, MeetLink: meet, TelegramLink: tg, Timetable: tt, Active: p.active === false ? 'FALSE' : 'TRUE' };
  if (r) Object.keys(vals).forEach(function (k) { put_(G, r._row, k, vals[k], k !== 'Active'); });
  else append_(G, vals, ['Group', 'MeetLink', 'TelegramLink', 'Timetable']);
  return { ok: true };
}

/* ===== STAGE 2: MENTORSHIP FAMILIES AND CLASSES =====
   A family is a small group of students with one mentor. Each family has a private board in the
   portals: announcements and resources from the mentor, and posts and replies from members.
   Classes are scheduled sessions for a class group: time, subject, topic, notes, materials and a
   recording link afterwards. The live class itself still runs on Google Meet. */
function acd_familyRow_(C, id) {
  return C.get(ACD.Families).rows.filter(function (f) { return f.FamilyID && key_(f.FamilyID) === key_(id) && key_(f.Active) !== 'FALSE'; })[0] || null;
}
function acd_familyScores_(C, boardRows) {   // average overall score of each family's active members
  const by = {};
  boardRows.forEach(function (x) { const f = key_(x.s.Family); if (!f) return; (by[f] = by[f] || []).push(x.m.overall); });
  const fams = C.get(ACD.Families).rows.filter(function (f) { return f.FamilyID && key_(f.Active) !== 'FALSE'; });
  const counts = {};
  C.get(ACD.Students).rows.forEach(function (s) { if (s.StudentID && key_(s.Active) !== 'FALSE' && s.Family) counts[key_(s.Family)] = (counts[key_(s.Family)] || 0) + 1; });
  const out = fams.map(function (f) {
    const v = by[key_(f.FamilyID)] || [];
    return { FamilyID: String(f.FamilyID), Name: String(f.Name || ''), Members: counts[key_(f.FamilyID)] || 0, Score: v.length ? acd_r1_(v.reduce(function (a, x) { return a + x; }, 0) / v.length) : null };
  }).sort(function (a, b) { return (b.Score == null ? -1 : b.Score) - (a.Score == null ? -1 : a.Score) || a.Name.localeCompare(b.Name); });
  let rank = 0; out.forEach(function (x, i) { x.Rank = x.Score == null ? null : (rank = i + 1); });
  return out;
}
function acd_board__(C, famId, staff, viewerId) {
  const rows = C.get(ACD.Posts).rows.filter(function (r) { return r.PostID && key_(r.FamilyID) === key_(famId); });
  const vis = function (r) { const h = String(r.Hidden || ''); return !h || (staff && h !== 'Deleted'); };
  const mk = function (r) {
    return { PostID: String(r.PostID), Kind: String(r.Kind || 'Post'), AuthorType: String(r.AuthorType || ''), AuthorName: String(r.AuthorName || ''), Mine: !!viewerId && key_(r.AuthorID) === key_(viewerId),
             Title: String(r.Title || ''), Body: String(r.Body || ''), Link: String(r.Link || ''), Pinned: key_(r.Pinned) === 'TRUE', Hidden: !!String(r.Hidden || ''), Created: iso_(r.Created, true) };
  };
  const tops = rows.filter(function (r) { return !r.ParentID && vis(r); }).map(mk);
  const replies = {};
  rows.filter(function (r) { return r.ParentID && vis(r); }).forEach(function (r) { (replies[String(r.ParentID)] = replies[String(r.ParentID)] || []).push(mk(r)); });
  tops.forEach(function (t) { t.Replies = (replies[t.PostID] || []).sort(function (a, b) { return a.Created < b.Created ? -1 : 1; }); });
  tops.sort(function (a, b) { return (b.Pinned - a.Pinned) || (a.Created < b.Created ? 1 : -1); });
  return tops.slice(0, 60);
}
function acd_canFamily_(actor, fam) {
  if (!fam) return false;
  if (actor.admin) return true;
  if (actor.type === 'student') return key_(actor.row.Family) === key_(fam.FamilyID);
  return acd_isLead_(actor.tu) || key_(fam.MentorID) === key_(actor.tu.TutorID);
}
function acd_savePost_(actor, p) {
  const C = acd_ctx_();
  const famId = actor.type === 'student' ? String(actor.row.Family || '') : String(p.familyId || '');
  const fam = acd_familyRow_(C, famId);
  if (!fam) return { ok: false, error: actor.type === 'student' ? 'You are not in a mentorship family yet.' : 'Family not found.' };
  if (!acd_canFamily_(actor, fam)) return { ok: false, error: 'You cannot post in this family.' };
  const body = acd_txt_(p.body, 2000), link = acd_txt_(p.link, 500), title = acd_txt_(p.title, 120), parent = String(p.parentId || '');
  let kind = actor.type === 'student' ? 'Post' : (ACD_POST_KINDS.indexOf(String(p.kind)) >= 0 ? String(p.kind) : 'Post');
  if (parent) kind = 'Post';
  if (link && !/^https?:\/\//i.test(link)) return { ok: false, error: 'The link must start with http:// or https://' };
  if (kind === 'Resource' && (!title || !link)) return { ok: false, error: 'A resource needs a title and a link.' };
  if (!body && !(kind === 'Resource')) return { ok: false, error: 'Write something first.' };
  const P = acd_t_(ACD.Posts);
  if (parent) {
    const top = P.rows.filter(function (r) { return String(r.PostID) === parent && key_(r.FamilyID) === key_(fam.FamilyID) && !r.ParentID; })[0];
    if (!top || String(top.Hidden || '')) return { ok: false, error: 'That post is no longer available.' };
  }
  if (actor.type === 'student') {
    const today = today_();
    const n = P.rows.filter(function (r) { return key_(r.AuthorID) === key_(actor.id) && iso_(r.Created) === today; }).length;
    if (n >= ACD_POSTS_PER_DAY) return { ok: false, error: 'You have reached today’s limit for posts. Please try again tomorrow.' };
  }
  append_(P, { PostID: acd_id_('FP-'), FamilyID: String(fam.FamilyID), ParentID: parent, Kind: kind, AuthorType: actor.type, AuthorID: actor.id, AuthorName: actor.name,
               Title: title, Body: body, Link: link, Pinned: kind === 'Announcement' ? 'TRUE' : '', Hidden: '', Created: acd_now_() },
          ['PostID', 'FamilyID', 'ParentID', 'Kind', 'AuthorType', 'AuthorID', 'AuthorName', 'Title', 'Body', 'Link', 'Created']);
  return { ok: true };
}
function acd_postFor_(actor, postId) {
  const P = acd_t_(ACD.Posts), r = P.rows.filter(function (x) { return String(x.PostID) === String(postId); })[0];
  if (!r) return { error: 'Post not found.' };
  const fam = acd_familyRow_(acd_ctx_(), r.FamilyID);
  if (!actor.admin && !acd_canFamily_(actor, fam)) return { error: 'You cannot change this post.' };
  return { P: P, r: r };
}
function acd_deletePost_(actor, p) {
  const x = acd_postFor_(actor, p.postId);
  if (x.error) return { ok: false, error: x.error };
  if (key_(x.r.AuthorID) !== key_(actor.id)) return { ok: false, error: 'You can only delete your own posts.' };
  put_(x.P, x.r._row, 'Hidden', 'Deleted');
  return { ok: true };
}
function acd_hidePost_(actor, p) {
  const x = acd_postFor_(actor, p.postId);
  if (x.error) return { ok: false, error: x.error };
  put_(x.P, x.r._row, 'Hidden', p.show ? '' : 'Hidden by mentor');
  return { ok: true };
}
function acd_pinPost_(actor, p) {
  const x = acd_postFor_(actor, p.postId);
  if (x.error) return { ok: false, error: x.error };
  if (x.r.ParentID) return { ok: false, error: 'Only posts can be pinned, not replies.' };
  put_(x.P, x.r._row, 'Pinned', p.unpin ? '' : 'TRUE');
  return { ok: true };
}
function acd_saveFamily_(p) {
  const name = acd_txt_(p.name, 60), mentor = String(p.mentorId || '').trim(), motto = acd_txt_(p.motto, 160);
  if (!name) return { ok: false, error: 'Enter the family name.' };
  if (mentor && !acd_t_(ACD.Tutors).rows.some(function (t) { return key_(t.TutorID) === key_(mentor); })) return { ok: false, error: 'Mentor not found.' };
  const F = acd_t_(ACD.Families);
  if (F.rows.some(function (f) { return key_(f.Name) === key_(name) && key_(f.FamilyID) !== key_(p.familyId); })) return { ok: false, error: 'There is already a family with that name.' };
  if (p.familyId) {
    const f = F.rows.filter(function (r) { return key_(r.FamilyID) === key_(p.familyId); })[0];
    if (!f) return { ok: false, error: 'Family not found.' };
    put_(F, f._row, 'Name', name, true); put_(F, f._row, 'MentorID', mentor, true); put_(F, f._row, 'Motto', motto, true);
  } else {
    append_(F, { FamilyID: acd_nextId_(F.rows, 'FamilyID', 'FAM-', 3), Name: name, MentorID: mentor, Motto: motto, Active: 'TRUE', Created: today_() }, ['FamilyID', 'Name', 'MentorID', 'Motto', 'Created']);
  }
  return { ok: true };
}

/* ----- classes ----- */
function acd_sessionGroups_(tu) {   // the class groups a mentor can schedule for
  if (acd_isLead_(tu)) return ['ALL'].concat(acd_groups_());
  const out = [];
  acd_mine_(tu).forEach(function (s) { const g = String(s.Group || '').trim(); if (g && out.indexOf(g) < 0) out.push(g); });
  return out;
}
function acd_saveSession_(tu, p) {
  const group = acd_txt_(p.group, 40), date = String(p.date || ''), start = String(p.start || ''), end = String(p.end || '');
  const subject = acd_txt_(p.subject, 40), topic = acd_txt_(p.topic, 160), notes = acd_txt_(p.notes, 3000);
  const meet = acd_txt_(p.meetLink, 500), mat = acd_txt_(p.materialLink, 500), rec = acd_txt_(p.recordingLink, 500);
  if (acd_sessionGroups_(tu).indexOf(group) < 0) return { ok: false, error: 'Choose one of your class groups.' };
  if (!acd_isDay_(date)) return { ok: false, error: 'Choose the date.' };
  if (!/^\d{2}:\d{2}$/.test(start)) return { ok: false, error: 'Choose the start time.' };
  if (end && (!/^\d{2}:\d{2}$/.test(end) || end <= start)) return { ok: false, error: 'The end time must be after the start time.' };
  if (!subject) return { ok: false, error: 'Enter the subject.' };
  for (const l of [meet, mat, rec]) if (l && !/^https?:\/\//i.test(l)) return { ok: false, error: 'Links must start with http:// or https://' };
  const X = acd_t_(ACD.Sessions);
  const vals = { Group: group, Date: date, Start: start, End: end, Subject: subject, Topic: topic, MeetLink: meet, Notes: notes, MaterialLink: mat, RecordingLink: rec };
  const textF = ['Group', 'Date', 'Start', 'End', 'Subject', 'Topic', 'MeetLink', 'Notes', 'MaterialLink', 'RecordingLink'];
  if (p.sessionId) {
    const x = X.rows.filter(function (r) { return String(r.SessionID) === String(p.sessionId); })[0];
    if (!x || (!acd_isLead_(tu) && key_(x.TutorID) !== key_(tu.TutorID))) return { ok: false, error: 'Class not found.' };
    Object.keys(vals).forEach(function (k) { put_(X, x._row, k, vals[k], true); });
  } else {
    append_(X, Object.assign({ SessionID: acd_id_('CL-'), TutorID: String(tu.TutorID), Created: today_() }, vals), textF.concat(['SessionID', 'TutorID', 'Created']));
  }
  return { ok: true };
}
function acd_deleteSession_(tu, p) {
  const X = acd_t_(ACD.Sessions), x = X.rows.filter(function (r) { return String(r.SessionID) === String(p.sessionId); })[0];
  if (!x || (!acd_isLead_(tu) && key_(x.TutorID) !== key_(tu.TutorID))) return { ok: false, error: 'Class not found.' };
  X.sh.deleteRow(x._row);
  return { ok: true };
}
function acd_sessionList_(C, groups, tutors, today, from, to) {
  const keyset = groups.map(key_);
  return C.get(ACD.Sessions).rows.filter(function (r) {
    if (!r.SessionID) return false;
    const d = iso_(r.Date); if (d < from || d > to) return false;
    return keyset.indexOf('*') >= 0 || key_(r.Group) === 'ALL' || keyset.indexOf(key_(r.Group)) >= 0;
  }).map(function (r) {
    return { SessionID: String(r.SessionID), Group: String(r.Group || ''), Date: iso_(r.Date), Start: String(r.Start || '').slice(0, 5), End: String(r.End || '').slice(0, 5), Subject: String(r.Subject || ''),
             Topic: String(r.Topic || ''), Tutor: tutors[key_(r.TutorID)] || '', TutorID: String(r.TutorID || ''), MeetLink: String(r.MeetLink || ''), Notes: String(r.Notes || ''),
             MaterialLink: String(r.MaterialLink || ''), RecordingLink: String(r.RecordingLink || '') };
  }).sort(function (a, b) { return (a.Date + a.Start) < (b.Date + b.Start) ? -1 : 1; });
}
function acd_shift_(isoDay, n) { return new Date((dn_(isoDay) + n) * 86400000).toISOString().slice(0, 10); }

/* ===== NEW ENROLMENT FROM THE WEBSITE (called by Enrol.gs) =====
   info: { name, plan, amount, months, email, phone, ref, method }
   Returns { id, code }. */
function acd_createAccount_(info) {
  const S = acd_t_(ACD.Students);
  const id = acd_nextId_(S.rows, 'StudentID', ACD_ID_PREFIX, 4);
  const code = en_code();
  const track = String(info.plan || '').split('—').pop().trim();
  const today = today_(), months = info.months || 1;
  const nextDue = addMonths_(today, months);
  append_(S, {
    StudentID: id, Name: info.name, AccessCode: code, Track: track, Group: '', TutorID: '', PaymentStatus: 'Paid', NextDue: nextDue,
    MonthlyFee: info.unit || (info.months === 1 ? info.amount : ''), ExamDate: '', TargetPercent: '', NextClass: '', ClassLink: '',
    Email: info.email, WhatsApp: info.phone, Active: 'TRUE', Enrolled: today, Ref: info.ref
  }, ['StudentID', 'Name', 'AccessCode', 'Track', 'NextDue', 'Email', 'WhatsApp', 'Enrolled', 'Ref']);
  append_(acd_t_(ACD.Payments), {
    PaymentID: 'P-' + Utilities.getUuid().slice(0, 6).toUpperCase(), StudentID: id, Date: today, Amount: info.amount, Months: months,
    Reference: info.ref, Method: info.method || 'Bank transfer', ConfirmedBy: 'Enrolment', Recorded: new Date()
  }, ['StudentID', 'Date', 'Reference', 'ConfirmedBy']);
  return { id: id, code: code };
}

/* ===== DAILY JOB (called from dailyJob in Code.gs) ===== */
function acd_dailyJob_() {
  let S;
  try { S = acd_t_(ACD.Students); } catch (e) { return 0; }   // Academy not set up yet
  const today = today_(), now = dn_(today);
  const R = table_('Reminders'), seen = {};
  R.rows.forEach(function (r) { if (r.Key) seen[String(r.Key)] = true; });
  const rows = [];
  S.rows.forEach(function (s) {
    if (!s.StudentID || key_(s.Active) === 'FALSE') return;
    const want = payStatus_(s);
    if (String(s.PaymentStatus || '').trim().toLowerCase() !== 'exempt' && want !== String(s.PaymentStatus || '').trim()) put_(S, s._row, 'PaymentStatus', want);
    const nd = iso_(s.NextDue);
    if (!nd || String(s.PaymentStatus).trim().toLowerCase() === 'exempt') return;
    const d = dn_(nd) - now, first = String(s.Name).split(' ')[0], fee = Number(s.MonthlyFee) ? ' (' + naira_(s.MonthlyFee) + ')' : '';
    let type = '', msg = '';
    if (ACD_PAYMENT_REMINDER_DAYS.indexOf(d) >= 0) {
      type = 'Payment due'; msg = 'Assalaamu alaykum ' + first + '. A reminder that your Academy fee' + fee + ' is due ' + when_(d) + ' (' + nice_(nd) + '). Pay by card here and your dashboard updates straight away: ' + payLink_(s.StudentID) + ' . If you pay by bank transfer, please send your receipt on WhatsApp. Jazakumullahu khayran.';
    } else if (d < 0 && (d === -1 || d === -3 || d === -7 || (d < -7 && d % 7 === 0))) {
      type = 'Payment overdue'; msg = 'Assalaamu alaykum ' + first + '. Your Academy fee' + fee + ' was due on ' + nice_(nd) + ' and is now ' + (-d) + ' day' + (d === -1 ? '' : 's') + ' overdue. Class links are paused until it is paid. Pay by card here: ' + payLink_(s.StudentID) + ' , or pay by transfer and send your receipt on WhatsApp. Message us if there is a problem.';
    }
    if (!type) return;
    const key = today + '|' + key_(s.StudentID) + '|ACD ' + type + '|' + nd + '/' + d;
    if (seen[key]) return;
    seen[key] = true;
    const status = sendEmail_(s, SCHOOL_NAME + ': ' + type.toLowerCase() + ' reminder', msg);
    const cells = { Date: today, StudentID: s.StudentID, Name: s.Name, Type: 'Academy ' + type.toLowerCase(), Message: msg, WhatsAppLink: waLink_(s.WhatsApp, msg), EmailStatus: status, Done: '', Key: key };
    rows.push(R.head.map(function (h) { return cells[h] === undefined ? '' : cells[h]; }));
  });
  if (rows.length) R.sh.getRange(R.sh.getLastRow() + 1, 1, rows.length, R.head.length).setValues(rows);
  CacheService.getScriptCache().remove('acd_board');
  return rows.length;
}

/* ===== ONE-TIME SETUP (run again after updating this file) ===== */
function academySetup() {
  const ss = ss_();
  Object.keys(ACD_SHEETS).forEach(function (name) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name), want = ACD_SHEETS[name];
    const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    if (!have.some(Boolean)) sh.getRange(1, 1, 1, want.length).setValues([want]);
    else want.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h); } });
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  });
  dropdown_(ss, ACD.Students, 'Track', ['UTME', 'Post-UTME', 'A-Levels', 'O-Levels'], false);
  dropdown_(ss, ACD.Students, 'PaymentStatus', ['Paid', 'Due', 'Overdue', 'Exempt'], false);
  dropdown_(ss, ACD.Students, 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, ACD.Tutors, 'Role', ['Tutor', 'Admin'], true);
  dropdown_(ss, ACD.Tutors, 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, ACD.Admins, 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, ACD.Attendance, 'Status', ACD_ATTENDANCE, true);
  dropdown_(ss, ACD.Tests, 'Kind', ACD_TEST_KINDS, true);
  dropdown_(ss, ACD.Tests, 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, ACD.Tasks, 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, ACD.Groups, 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, ACD.Families, 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, ACD.Posts, 'Kind', ACD_POST_KINDS, true);
  // first admin login, so someone can sign in to academy-admin.html straight away
  const A = table_(ACD.Admins);
  let msg = 'Academy tabs are ready.';
  if (!A.rows.some(function (r) { return r.AdminID; })) {
    const code = en_code() + en_code();
    append_(A, { AdminID: 'AA-001', Name: 'Academy Admin', AccessCode: code, Email: '', Active: 'TRUE' }, ['AdminID', 'Name', 'AccessCode']);
    msg += '\n\nFirst admin login for academy-admin.html:\nAdmin ID: AA-001\nAccess code: ' + code + '\n\nChange the name in the AcademyAdmins tab, and the code after signing in (Account tab).';
  }
  console.log(msg);   // shown in the Execution log when run from the editor
  try { ss.toast(msg.split('\n')[0] + ' The admin login is in the AcademyAdmins tab.', SCHOOL_NAME, 15); } catch (e) {}
  return msg;
}

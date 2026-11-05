/**
 * Himaayah Teacher Dashboard API (Teacher.gs)
 *
 * Add this as a NEW file next to Code.gs. Every name starts with "tch" or "TCH_", so it cannot clash with
 * Code.gs or Enrol.gs. It uses Code.gs helpers (ss_, tz_, table_, put_, append_, iso_, today_, dn_, key_,
 * same_, payStatus_, matches_, json_, LOCKOUT_TRIES, LOCKOUT_SECONDS).
 *
 * Code.gs needs two small edits (see SETUP-TEACHER.md): one line in doPost, and a new matches_ function.
 *
 * What teachers can do: mark attendance, update hifdh progress and surahs, set the murajaah plan, set the next class,
 * enter test results, post assignments, and mark submissions. Teachers only ever see and change students whose
 * Teacher column in the Students tab contains their name or ID. A student can have up to 3 teachers, separated by
 * commas ("Ustadh Ibrahim, Ustadhah Maryam"); each of them sees the student. An Admin sees every student.
 */

/* ===== SETTINGS ===== */
const TCH_TABS = {
  Teachers: ['TeacherID', 'Name', 'AccessCode', 'Email', 'Role', 'Active'],
  Attendance: ['Date', 'StudentID', 'Status', 'MarkedBy', 'Time']
};
const TCH_ATTENDANCE = ['Present', 'Late', 'Absent', 'Excused'];
const TCH_HIFDH = ['Memorised', 'Revising', 'In progress', 'Not started'];
const TCH_RESULT_TYPES = ['Test', 'Exam', 'Hifdh test'];
const TCH_BACKFILL_DAYS = 60;       // attendance can be marked or corrected this many days back

/* ===== SETUP: run once from the editor ===== */
function setupTeachers() {
  const ss = ss_();
  Object.keys(TCH_TABS).forEach(function (name) { tchEnsure_(ss, name, TCH_TABS[name]); });
  const as = ss.getSheetByName('Assignments');
  if (as) tchEnsure_(ss, 'Assignments', ['CreatedBy']);   // records which teacher posted each assignment
  dropdown_(ss, 'Teachers', 'Role', ['Teacher', 'Admin'], true);
  dropdown_(ss, 'Teachers', 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, 'Attendance', 'Status', TCH_ATTENDANCE, true);
  try { ss.toast('Teacher tabs are ready. Add teachers in the Teachers tab.', SCHOOL_NAME); } catch (e) {}
}
function tchEnsure_(ss, name, want) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  if (!have.some(Boolean)) sh.getRange(1, 1, 1, want.length).setValues([want]);
  else want.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h); } });
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
}

/* ===== SMALL HELPERS ===== */
function tchFail_(msg) { throw new Error('USER:' + msg); }
function tchClean_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
function tchNum_(v) { if (v === '' || v == null) return NaN; const n = Number(v); return isFinite(n) ? n : NaN; }
function tchDay_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const p = s.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}
function tchRand_(n) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', hex = Utilities.getUuid().replace(/-/g, '');
  let s = '';
  for (let i = 0; i < n; i++) s += chars.charAt(parseInt(hex.substr(i * 2, 2), 16) % chars.length);
  return s;
}
function tchWa_(num) {
  let n = String(num || '').replace(/\D/g, '');
  if (n.charAt(0) === '0' && n.length === 11) n = '234' + n.slice(1);
  return n;
}
function tchAdmin_(me) { return key_(me.Role) === 'ADMIN'; }

/* ===== LOGIN ===== */
function tchAuth_(id, code) {
  id = key_(id).slice(0, 40); code = String(code || '').trim();
  if (!id || !code) return { error: 'Enter your Teacher ID and access code.' };
  const cache = CacheService.getScriptCache(), lk = 'tlock:' + id, fk = 'tfail:' + id;
  if (cache.get(lk)) return { error: 'Too many attempts. Please try again in 15 minutes.' };
  const me = table_('Teachers').rows.filter(function (r) { return key_(r.TeacherID) === id; })[0];
  const ok = me && key_(me.Active) !== 'FALSE' && String(me.AccessCode).trim() !== '' && code_ok_(me.AccessCode, code);
  if (!ok) {
    const n = Number(cache.get(fk) || 0) + 1;
    if (n >= LOCKOUT_TRIES) { cache.put(lk, '1', LOCKOUT_SECONDS); cache.remove(fk); } else cache.put(fk, String(n), LOCKOUT_SECONDS);
    return { error: 'Wrong ID or access code.' };
  }
  cache.remove(fk);
  return { me: me };
}

/* ===== WHICH STUDENTS A TEACHER MAY TOUCH ===== */
function tchOwns_(me, s) {
  if (tchAdmin_(me)) return true;
  const mine = [key_(me.Name), key_(me.TeacherID)];
  return tchSplit_(s.Teacher).some(function (p) { return mine.indexOf(key_(p)) >= 0; });
}
/* The Teacher cell can hold up to 3 teachers (names or IDs) separated by commas, semicolons, "/", "&" or "and". */
function tchSplit_(cell) {
  return String(cell || '').split(/\s*(?:[,;\/&\n]|\band\b)\s*/i).map(function (x) { return String(x).trim(); }).filter(Boolean);
}
function tchMine_(me) {
  const t = table_('Students');
  return { t: t, rows: t.rows.filter(function (r) { return r.StudentID && key_(r.Active) !== 'FALSE' && tchOwns_(me, r); }) };
}
function tchSelect_(me, ids, max) {
  if (!Array.isArray(ids) || !ids.length) tchFail_('Choose at least one student.');
  if (ids.length > (max || 300)) tchFail_('Too many students selected.');
  const m = tchMine_(me), by = {};
  m.rows.forEach(function (r) { by[key_(r.StudentID)] = r; });
  const seen = {}, out = [];
  ids.forEach(function (id) {
    const k = key_(id), s = by[k];
    if (!s) tchFail_('One of those students is not assigned to you.');
    if (!seen[k]) { seen[k] = true; out.push(s); }
  });
  return { t: m.t, rows: out };
}
function tchOne_(me, id) { const r = tchSelect_(me, [id], 1); return { t: r.t, row: r.rows[0] }; }

/* An assignment is visible to a teacher if they posted it, or it was added by hand in the sheet and applies to one of their students. */
function tchCanMark_(me, a, s) {
  if (tchAdmin_(me)) return true;
  const by = key_(a.CreatedBy);
  if (by === key_(me.TeacherID)) return true;
  return by === '' && matches_(a.Level, [key_(s.Level)]) && matches_(a.Audience, [key_(s.StudentID)]);
}

/* ===== WHAT THE TEACHER SEES ===== */
function tchPayload_(me) {
  const admin = tchAdmin_(me), m = tchMine_(me), ids = {}, today = today_();
  m.rows.forEach(function (r) { ids[key_(r.StudentID)] = true; });
  const sid = function (r) { return String(r.StudentID).trim(); };
  const mine = function (name) { return table_(name).rows.filter(function (r) { return ids[key_(r.StudentID)]; }); };
  const newest = function (a, b) { return a.Date < b.Date ? 1 : -1; };
  const students = m.rows.map(function (r) {
    return {
      StudentID: sid(r), Name: r.Name, Level: r.Level, Plan: r.Plan, Teacher: r.Teacher, PaymentStatus: payStatus_(r),
      NextDue: admin ? iso_(r.NextDue) : '', AttendancePresent: Number(r.AttendancePresent) || 0, AttendanceTotal: Number(r.AttendanceTotal) || 0,
      NextClass: iso_(r.NextClass, true), ClassLink: r.ClassLink, Juz: Number(r.Juz) || 0, CurrentSurah: r.CurrentSurah, CurrentAyah: r.CurrentAyah, Wa: tchWa_(r.WhatsApp)
    };
  }).sort(function (a, b) { return String(a.Name).toLowerCase() < String(b.Name).toLowerCase() ? -1 : 1; });
  const A = table_('Assignments'), S = table_('Submissions'), sub = {};
  S.rows.forEach(function (s) { sub[String(s.AssignmentID) + '|' + key_(s.StudentID)] = s; });
  const assignments = [];
  A.rows.forEach(function (a) {
    if (!a.AssignmentID || !a.Title) return;
    const assigned = m.rows.filter(function (s) { return matches_(a.Level, [key_(s.Level)]) && matches_(a.Audience, [key_(s.StudentID)]); });
    const own = admin || key_(a.CreatedBy) === key_(me.TeacherID);
    if (!own && !(key_(a.CreatedBy) === '' && assigned.length)) return;
    const due = iso_(a.Due);
    const rows = assigned.map(function (s) {
      const x = sub[String(a.AssignmentID) + '|' + key_(s.StudentID)], scored = x && x.Score !== '' && x.Score != null;
      return {
        StudentID: sid(s), Name: s.Name,
        Status: scored ? 'Marked' : x ? 'Submitted' : (due && due < today) ? 'Overdue' : 'To do',
        Submission: x ? { Submitted: iso_(x.Submitted, true), Note: x.Note, Link: x.Link, Score: scored ? x.Score : '', Feedback: x.Feedback, Late: !!(due && iso_(x.Submitted) > due) } : null
      };
    });
    assignments.push({
      AssignmentID: String(a.AssignmentID), Title: a.Title, Subject: a.Subject, Instructions: a.Instructions, Level: a.Level || 'All', Audience: a.Audience || 'All',
      Assigned: iso_(a.Assigned), Due: due, Link: a.Link, MaxScore: a.MaxScore, Active: key_(a.Active) !== 'FALSE', CreatedBy: a.CreatedBy || '', Rows: rows,
      Counts: { assigned: rows.length, submitted: rows.filter(function (r) { return r.Submission; }).length, marked: rows.filter(function (r) { return r.Status === 'Marked'; }).length }
    });
  });
  assignments.sort(function (a, b) {
    if (a.Active !== b.Active) return a.Active ? -1 : 1;
    return (a.Due || '9999') < (b.Due || '9999') ? -1 : 1;
  });
  const levels = {};
  m.rows.forEach(function (r) { if (String(r.Level).trim()) levels[String(r.Level).trim()] = true; });
  return {
    ok: true, today: today,
    teacher: { TeacherID: String(me.TeacherID).trim(), Name: me.Name, Role: admin ? 'Admin' : 'Teacher' },
    students: students,
    hifdh: mine('Hifdh').filter(function (r) { return r.Surah; }).map(function (r) { return { StudentID: sid(r), Surah: r.Surah, Status: r.Status }; }),
    murajaah: mine('Murajaah').filter(function (r) { return r.Day; }).map(function (r) { return { StudentID: sid(r), Day: r.Day, Portion: r.Portion }; }),
    results: mine('Results').filter(function (r) { return r.Subject; }).map(function (r) {
      return { StudentID: sid(r), Date: iso_(r.Date), Type: r.Type, Subject: r.Subject, Score: r.Score, OutOf: r.OutOf };
    }).sort(newest).slice(0, 300),
    attendance: mine('Attendance').map(function (r) { return { StudentID: sid(r), Date: iso_(r.Date), Status: r.Status }; }).sort(newest).slice(0, 800),
    assignments: assignments,
    recordings: typeof rec_forTeacher_ === 'function' ? rec_forTeacher_(me, m.rows) : [],   // recitation recordings (Recordings.gs)
    levels: Object.keys(levels).sort()
  };
}

/* ===== ACTIONS ===== */
function tchAttendance_(me, p) {
  const date = tchClean_(p.date, 10), marks = Array.isArray(p.marks) ? p.marks : [];
  if (!tchDay_(date) || date > today_() || dn_(today_()) - dn_(date) > TCH_BACKFILL_DAYS) tchFail_('Choose a date within the last ' + TCH_BACKFILL_DAYS + ' days.');
  if (!marks.length) tchFail_('Mark at least one student.');
  const latest = {};
  marks.forEach(function (x) { latest[key_(x.studentId)] = String(x.status); });
  const ids = Object.keys(latest);
  Object.keys(latest).forEach(function (k) { if (TCH_ATTENDANCE.indexOf(latest[k]) < 0) tchFail_('Unknown attendance status.'); });
  const sel = tchSelect_(me, ids), at = table_('Attendance'), existing = {};
  at.rows.forEach(function (r) { existing[iso_(r.Date) + '|' + key_(r.StudentID)] = r; });
  const part = function (s) { return s === 'Present' || s === 'Late' ? [1, 1] : s === 'Absent' ? [0, 1] : [0, 0]; };   // Excused does not count against the student
  sel.rows.forEach(function (s) {
    const id = key_(s.StudentID), status = latest[id], ex = existing[date + '|' + id];
    const a = ex ? part(String(ex.Status)) : [0, 0], b = part(status);
    if (ex) { put_(at, ex._row, 'Status', status); put_(at, ex._row, 'MarkedBy', me.TeacherID); put_(at, ex._row, 'Time', new Date()); }
    else append_(at, { Date: date, StudentID: s.StudentID, Status: status, MarkedBy: me.TeacherID, Time: new Date() }, ['Date']);
    const present = Math.max(0, (Number(s.AttendancePresent) || 0) + b[0] - a[0]), total = Math.max(0, (Number(s.AttendanceTotal) || 0) + b[1] - a[1]);
    put_(sel.t, s._row, 'AttendancePresent', present); put_(sel.t, s._row, 'AttendanceTotal', total);
  });
}

function tchStudent_(me, p) {
  const o = tchOne_(me, p.studentId), juz = tchNum_(p.juz), ayahRaw = tchClean_(p.currentAyah, 4), surah = tchClean_(p.currentSurah, 40);
  if (!(juz >= 0 && juz <= 30 && Math.floor(juz) === juz)) tchFail_('Juz must be a whole number from 0 to 30.');
  const ayah = ayahRaw === '' ? '' : tchNum_(ayahRaw);
  if (ayah !== '' && !(ayah >= 1 && ayah <= 286 && Math.floor(ayah) === ayah)) tchFail_('Ayah must be a whole number from 1 to 286.');
  put_(o.t, o.row._row, 'Juz', juz); put_(o.t, o.row._row, 'CurrentSurah', surah, true); put_(o.t, o.row._row, 'CurrentAyah', ayah);
}

function tchHifdh_(me, p) {
  const o = tchOne_(me, p.studentId), surah = tchClean_(p.surah, 40), status = String(p.status || '');
  if (!surah) tchFail_('Enter the surah.');
  const t = table_('Hifdh');
  const ex = t.rows.filter(function (r) { return key_(r.StudentID) === key_(o.row.StudentID) && key_(r.Surah) === key_(surah); })[0];
  if (p.remove) { if (ex) t.sh.deleteRow(ex._row); return; }
  if (TCH_HIFDH.indexOf(status) < 0) tchFail_('Unknown status.');
  if (ex) put_(t, ex._row, 'Status', status);
  else append_(t, { StudentID: o.row.StudentID, Surah: surah, Status: status }, ['Surah']);
}

function tchMurajaah_(me, p) {
  const sel = tchSelect_(me, p.studentIds, 60), plan = Array.isArray(p.plan) ? p.plan : [];
  if (plan.length > 7) tchFail_('A weekly plan can have up to 7 lines.');
  const lines = [];
  plan.forEach(function (x) {
    const day = tchClean_(x.day, 20), portion = tchClean_(x.portion, 120);
    if (day && portion) lines.push({ day: day, portion: portion });
  });
  const t = table_('Murajaah'), ids = {};
  sel.rows.forEach(function (s) { ids[key_(s.StudentID)] = true; });
  t.rows.filter(function (r) { return ids[key_(r.StudentID)]; }).map(function (r) { return r._row; })
    .sort(function (a, b) { return b - a; }).forEach(function (n) { t.sh.deleteRow(n); });   // delete from the bottom so row numbers stay right
  sel.rows.forEach(function (s) {
    lines.forEach(function (l) { append_(t, { StudentID: s.StudentID, Day: l.day, Portion: l.portion }, ['Day', 'Portion']); });
  });
}

function tchResults_(me, p) {
  const subject = tchClean_(p.subject, 60), type = String(p.type || ''), date = tchClean_(p.date, 10), outOf = tchNum_(p.outOf);
  const scores = Array.isArray(p.scores) ? p.scores : [];
  if (!subject) tchFail_('Enter the subject.');
  if (TCH_RESULT_TYPES.indexOf(type) < 0) tchFail_('Choose a type.');
  if (!tchDay_(date) || date > today_()) tchFail_('Choose a valid date that is not in the future.');
  if (!(outOf > 0 && outOf <= 1000)) tchFail_('Enter what the test was out of.');
  const entries = scores.filter(function (x) { return x && x.score !== '' && x.score != null; });
  if (!entries.length) tchFail_('Enter at least one score.');
  const sel = tchSelect_(me, entries.map(function (x) { return x.studentId; }));
  const by = {};
  sel.rows.forEach(function (s) { by[key_(s.StudentID)] = s; });
  entries.forEach(function (x) { const n = tchNum_(x.score); if (!(n >= 0 && n <= outOf)) tchFail_('Each score must be between 0 and ' + outOf + '.'); });
  const t = table_('Results'), done = {};
  entries.forEach(function (x) {
    const k = key_(x.studentId);
    if (done[k]) return;
    done[k] = true;
    append_(t, { StudentID: by[k].StudentID, Date: date, Type: type, Subject: subject, Score: tchNum_(x.score), OutOf: outOf }, ['Subject', 'Date']);
  });
}

function tchClass_(me, p) {
  const sel = tchSelect_(me, p.studentIds, 300), nc = tchClean_(p.nextClass, 16), link = tchClean_(p.link, 500);
  if (nc && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(nc) || !tchDay_(nc.slice(0, 10)))) tchFail_('Enter a valid class date and time.');
  if (link && !/^https?:\/\//i.test(link)) tchFail_('The class link must start with http:// or https://');
  sel.rows.forEach(function (s) { put_(sel.t, s._row, 'NextClass', nc, true); put_(sel.t, s._row, 'ClassLink', link, true); });
}

function tchAssignment_(me, p) {
  const title = tchClean_(p.title, 120), subject = tchClean_(p.subject, 40), ins = tchClean_(p.instructions, 1500), due = tchClean_(p.due, 10), link = tchClean_(p.link, 500);
  const maxRaw = tchClean_(p.maxScore, 6), max = maxRaw === '' ? '' : tchNum_(maxRaw);
  if (!title) tchFail_('Enter a title.');
  if (due && !tchDay_(due)) tchFail_('Enter a valid due date.');
  if (link && !/^https?:\/\//i.test(link)) tchFail_('The link must start with http:// or https://');
  if (max !== '' && !(max > 0 && max <= 1000)) tchFail_('Maximum score must be between 1 and 1000.');
  let level = 'All', audience = 'All';
  const scope = String(p.scope || 'mine');
  if (scope === 'mine') {
    const m = tchMine_(me);
    if (!m.rows.length) tchFail_('You have no students yet.');
    audience = m.rows.map(function (r) { return String(r.StudentID).trim(); }).join(', ');
  } else if (scope === 'students') {
    audience = tchSelect_(me, p.studentIds).rows.map(function (r) { return String(r.StudentID).trim(); }).join(', ');
  } else if (scope === 'level' || scope === 'all') {
    if (!tchAdmin_(me)) tchFail_('Only an admin can post to a whole level.');
    if (scope === 'level') { level = tchClean_(p.level, 60); if (!level) tchFail_('Choose a level.'); }
  } else tchFail_('Unknown audience.');
  append_(table_('Assignments'), {
    AssignmentID: 'A-' + tchRand_(6), Title: title, Instructions: ins, Subject: subject, Level: level, Audience: audience,
    Assigned: today_(), Due: due, Link: link, MaxScore: max, Active: 'TRUE', CreatedBy: me.TeacherID
  }, ['Title', 'Instructions', 'Subject', 'Link', 'Assigned', 'Due', 'Audience']);
}

function tchAssignmentActive_(me, p) {
  const t = table_('Assignments'), aid = tchClean_(p.assignmentId, 40);
  const a = t.rows.filter(function (r) { return String(r.AssignmentID) === aid; })[0];
  if (!a) tchFail_('Assignment not found.');
  if (!tchAdmin_(me) && key_(a.CreatedBy) !== key_(me.TeacherID)) tchFail_('You can only change assignments you posted.');
  put_(t, a._row, 'Active', p.active ? 'TRUE' : 'FALSE');
}

function tchMark_(me, p) {
  const aid = tchClean_(p.assignmentId, 40), o = tchOne_(me, p.studentId), s = o.row;
  const a = table_('Assignments').rows.filter(function (r) { return String(r.AssignmentID) === aid; })[0];
  if (!a || !tchCanMark_(me, a, s)) tchFail_('Assignment not found.');
  const S = table_('Submissions');
  const sub = S.rows.filter(function (r) { return String(r.AssignmentID) === aid && key_(r.StudentID) === key_(s.StudentID); })[0];
  if (!sub) tchFail_('That student has not submitted yet.');
  const raw = tchClean_(p.score, 8), feedback = tchClean_(p.feedback, 1000), max = Number(a.MaxScore) || 0;
  if (raw === '') {   // blank score takes the mark off, so the student can resubmit
    put_(S, sub._row, 'Score', ''); put_(S, sub._row, 'Marked', ''); put_(S, sub._row, 'Feedback', feedback, true);
    return;
  }
  const n = tchNum_(raw);
  if (!(n >= 0) || (max && n > max)) tchFail_(max ? 'The score must be between 0 and ' + max + '.' : 'Enter a valid score.');
  put_(S, sub._row, 'Score', n); put_(S, sub._row, 'Feedback', feedback, true); put_(S, sub._row, 'Marked', new Date());
}

function tchPassword_(me, p) {
  const code = String(p.newCode || '').trim();
  if (code.length < 8 || code.length > 40) tchFail_('Your new code must be 8 to 40 characters.');
  const t = table_('Teachers'), r = t.rows.filter(function (x) { return key_(x.TeacherID) === key_(me.TeacherID); })[0];
  put_(t, r._row, 'AccessCode', code, true);
}

/* ===== ENTRY POINT (called from doPost in Code.gs) ===== */
function teacherFromRequest(p) {
  try {
    const a = tchAuth_(p.id, p.code);
    if (a.error) return { ok: false, error: a.error };
    const me = a.me, act = String(p.action || '');
    if (act === 'teacher_rec_audio') return rec_teacherAudio_(me, p);   // audio only, no dashboard data (Recordings.gs)
    if (act !== 'teacher_login') {
      const lock = LockService.getScriptLock();
      lock.waitLock(15000);
      try {
        switch (act) {
          case 'teacher_attendance': tchAttendance_(me, p); break;
          case 'teacher_student': tchStudent_(me, p); break;
          case 'teacher_hifdh': tchHifdh_(me, p); break;
          case 'teacher_murajaah': tchMurajaah_(me, p); break;
          case 'teacher_results': tchResults_(me, p); break;
          case 'teacher_class': tchClass_(me, p); break;
          case 'teacher_assignment': tchAssignment_(me, p); break;
          case 'teacher_assignment_active': tchAssignmentActive_(me, p); break;
          case 'teacher_mark': tchMark_(me, p); break;
          case 'teacher_password': tchPassword_(me, p); break;
          case 'teacher_rec_mark': rec_mark_(me, p); break;           // Recordings.gs
          default: tchFail_('Unknown action.');
        }
      } finally { lock.releaseLock(); }
    }
    return tchPayload_(me);
  } catch (err) {
    if (/^USER:/.test(String(err && err.message))) return { ok: false, error: String(err.message).slice(5) };
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}
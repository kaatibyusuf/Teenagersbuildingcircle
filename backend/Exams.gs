/**
 * Madrasah exam portal (Exams.gs)
 *
 * Fixed-time exams for Madrasah students, set and marked by teachers. Add this as a NEW file next to Code.gs, then run
 * Himaayah > "Set up the exam portal" once. Pages: exams.html (students) and exam-teacher.html (teachers).
 *
 * Six tabs are created for you:
 *
 *   Exams          ExamID, Title, Subject, Level, Start, Minutes, PassMark, OralMarks, Instructions, Shuffle, State, CreatedBy, Created, Kind, Term
 *   ExamQuestions  ExamID, QID, Type, Question, A, B, C, D, Correct, Marks, Explanation, ModelAnswer
 *   ExamSittings   ExamID, StudentID, Started, Deadline, Submitted, Answers, McqScore, WrittenScores, WrittenMarked, Comment, MarkedBy, GrantUntil, GrantMinutes, GrantedBy
 *   ExamOral       ExamID, StudentID, Slot, Score, Comment, MarkedBy
 *   Gradebook      Term, Subject, StudentID, Component, Score, EnteredBy, Updated   (CA scores typed in by a teacher; see below)
 *   SubjectUnits   Subject, Units   (credit units: Hadeeth, Fiqh, Tawheed 3; Adhkaar 1; Sarf, Nahw and every other course 2. An admin can change them in the Gradebook)
 *
 * Teachers create and mark exams on exam-teacher.html, so you rarely need to touch these tabs by hand.
 *
 * How an exam runs
 *   - Start is the same for everyone (West Africa time). A student can begin from Start until EX_LATE_MINUTES later, and the
 *     exam always ends at Start + Minutes, whatever time they began. The server keeps the time, not the student's phone.
 *   - One attempt only. Answers are saved while the student works, and an unfinished exam is submitted automatically
 *     at the deadline.
 *   - Multiple-choice questions are marked by the script. Written questions are marked by a teacher. An oral/recitation
 *     component (OralMarks above 0) is scored by a teacher after the student's oral slot.
 *   - Students see nothing of their marks until the teacher presses Publish results. Correct answers never leave the script
 *     before that.
 *
 * Resits and late sittings
 *   The exam's teacher (or an admin) can press Resit beside a student on the exam page while the exam is Live (not yet published).
 *   A student who missed the exam, or whose attempt ended (network failure, wrong submit), is given a fresh window: they have a chosen
 *   number of minutes, starting when they press Start, and a chosen number of hours in which they may begin. A student who had already
 *   submitted keeps their saved answers and continues; their written marks are cleared so the teacher marks it again.
 *
 * Term report (the Gradebook on exam-teacher.html)
 *   Every exam has a Kind: CA1, CA2 or Exam, and a Term (filled in for you as the current semester, for example "2026/2027 Second Semester"). A subject's total is out of 100:
 *   CA1 out of 20, CA2 out of 20 (so CA is out of 40) and the Exam out of 60. The gradebook turns each exam's percentage into its
 *   share of those marks and adds them up. A teacher can also type a CA score (for a test taken on paper); a typed score
 *   replaces the one worked out from the portal. Grades use the same A-F bands as below.
 *   The Exam kind cannot be scheduled before EX_EXAMS_FROM, and students cannot start any exam while their fees are overdue
 *   (EX_BLOCK_OVERDUE).
 *
 * Grades (on the rounded percentage): A 90-100, B 79-89, C 60-78, D 50-59, E 49, F 0-48.
 */

const EX_TABS = {
  Exams: ['ExamID', 'Title', 'Subject', 'Level', 'Start', 'Minutes', 'PassMark', 'OralMarks', 'Instructions', 'Shuffle', 'State', 'CreatedBy', 'Created', 'Kind', 'Term'],
  ExamQuestions: ['ExamID', 'QID', 'Type', 'Question', 'A', 'B', 'C', 'D', 'Correct', 'Marks', 'Explanation', 'ModelAnswer'],
  ExamSittings: ['ExamID', 'StudentID', 'Started', 'Deadline', 'Submitted', 'Answers', 'McqScore', 'WrittenScores', 'WrittenMarked', 'Comment', 'MarkedBy', 'GrantUntil', 'GrantMinutes', 'GrantedBy'],
  ExamOral: ['ExamID', 'StudentID', 'Slot', 'Score', 'Comment', 'MarkedBy'],
  Gradebook: ['Term', 'Subject', 'StudentID', 'Component', 'Score', 'EnteredBy', 'Updated'],
  SubjectUnits: ['Subject', 'Units']
};
const EX_LATE_MINUTES = 15;          // a student may still begin this long after the start time (their exam still ends on time)
const EX_GRACE_SECONDS = 45;         // answers are still accepted this long after the deadline (slow networks)
const EX_DEFAULT_PASS = 50;          // percent, used when an exam has no PassMark
const EX_BLOCK_OVERDUE = true;       // true = a student whose fees are overdue cannot start an exam
const EX_EXAMS_FROM = '2027-01-20';  // the final exams (Kind "Exam") cannot be set for, or started on, any earlier day
const EX_WEIGHTS = { CA1: 20, CA2: 20, Exam: 60 };   // marks each part carries; the subject total is out of 100
const EX_MAX_QUESTIONS = 100;
const EX_MAX_WRITTEN_CHARS = 3000;
const EX_DT = "yyyy-MM-dd'T'HH:mm";
const EX_DTS = "yyyy-MM-dd'T'HH:mm:ss";

function examSetup() {
  Object.keys(EX_TABS).forEach(ex_table_);
  try { ss_().toast('The exam tabs are ready. Teachers create exams on exam-teacher.', SCHOOL_NAME); } catch (e) {}
}
function ex_table_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, EX_TABS[name].length).setValues([EX_TABS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (name === 'SubjectUnits') {                    // start with the school's own units, so they can be seen and changed here
      const seed = [['Hadeeth', 3], ['Fiqh', 3], ['Tawheed', 3], ['Adhkaar', 1], ['Sarf', 2], ['Nahw', 2]];
      sh.getRange(2, 1, seed.length, 2).setValues(seed);
    }
  } else {                                           // a tab made by an older version: add any new columns at the end
    const have = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(function (h) { return String(h).trim(); });
    const miss = EX_TABS[name].filter(function (h) { return have.indexOf(h) < 0; });
    if (miss.length) {
      const last = have.filter(function (h) { return h !== ''; }).length;
      sh.getRange(1, last + 1, 1, miss.length).setValues([miss]).setFontWeight('bold');
    }
  }
  return table_(name);
}

/* ===== SMALL HELPERS ===== */
function ex_fail_(m) { throw new Error('USER:' + m); }
function ex_str_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, n || 500); }
function ex_now_() { return new Date().getTime(); }
function ex_epoch_(isoText) {          // "2026-12-01T09:00" or with seconds, in the sheet's time zone
  const s = String(isoText || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return NaN;
  return Utilities.parseDate(s.length > 16 ? s.slice(0, 19) : s, tz_(), s.length > 16 ? EX_DTS : EX_DT).getTime();
}
function ex_fmt_(ms, secs) { return Utilities.formatDate(new Date(ms), tz_(), secs ? EX_DTS : EX_DT); }
function ex_json_(s, fallback) { try { const v = JSON.parse(String(s || '')); return v && typeof v === 'object' ? v : fallback; } catch (e) { return fallback; } }
function ex_num_(v) { const n = Number(v); return isFinite(n) ? n : 0; }

/* The grade bands the school uses. */
function ex_grade_(percent) {
  const n = Math.round(Number(percent) || 0);
  if (n >= 90) return 'A';
  if (n >= 79) return 'B';
  if (n >= 60) return 'C';
  if (n >= 50) return 'D';
  if (n === 49) return 'E';
  return 'F';
}
const EX_REMARK = { A: 'Excellent', B: 'Very good', C: 'Good', D: 'Fair', E: 'Weak', F: 'Fail' };

function ex_kind_(e) { const k = String(e.Kind || '').trim().toUpperCase(); return k === 'CA1' ? 'CA1' : k === 'CA2' ? 'CA2' : k === 'EXAM' ? 'Exam' : ''; }
function ex_beforeExams_(e) { return ex_kind_(e) === 'Exam' && iso_(e.Start).slice(0, 10) < EX_EXAMS_FROM; }
function ex_isWritten_(q) { return String(q.Type || '').trim().toLowerCase() === 'written'; }
function ex_marks_(q) { const n = Math.round(Number(q.Marks)); return n > 0 ? n : 1; }
function ex_options_(q) {
  return ['A', 'B', 'C', 'D'].filter(function (k) { return String(q[k] == null ? '' : q[k]).trim() !== ''; })
    .map(function (k) { return { k: k, t: String(q[k]).trim() }; });
}
function ex_qid_(q) { return String(q.QID === '' || q.QID == null ? 'R' + q._row : q.QID).trim(); }
function ex_questions_(examId) {
  const id = key_(examId);
  return ex_table_('ExamQuestions').rows.filter(function (q) {
    if (key_(q.ExamID) !== id || !String(q.Question || '').trim()) return false;
    return ex_isWritten_(q) || ex_options_(q).length >= 2;
  });
}
function ex_totals_(exam, qs) {
  let mcq = 0, written = 0;
  qs.forEach(function (q) { if (ex_isWritten_(q)) written += ex_marks_(q); else mcq += ex_marks_(q); });
  const oral = Math.max(0, Math.round(ex_num_(exam.OralMarks)));
  return { mcq: mcq, written: written, oral: oral, all: mcq + written + oral };
}
function ex_pass_(exam) { const n = Number(exam.PassMark); return n > 0 && n <= 100 ? n : EX_DEFAULT_PASS; }
function ex_start_(exam) { return ex_epoch_(iso_(exam.Start, true)); }
function ex_end_(exam) { return ex_start_(exam) + Math.max(1, ex_num_(exam.Minutes)) * 60000; }
function ex_state_(exam) { const s = String(exam.State || '').trim(); return s === 'Live' || s === 'Published' ? s : 'Draft'; }

/* A seeded shuffle, so a student sees the same order if they reload mid-exam. */
function ex_rng_(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function ex_shuffle_(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* ===== SITTINGS ===== */
function ex_sitting_(sittings, examId, studentId) {
  const e = key_(examId), s = key_(studentId);
  return sittings.rows.filter(function (r) { return key_(r.ExamID) === e && key_(r.StudentID) === s; })[0] || null;
}
function ex_oralRow_(oral, examId, studentId) {
  const e = key_(examId), s = key_(studentId);
  return oral.rows.filter(function (r) { return key_(r.ExamID) === e && key_(r.StudentID) === s; })[0] || null;
}
function ex_mcqScore_(qs, answers) {
  let n = 0;
  qs.forEach(function (q) {
    if (ex_isWritten_(q)) return;
    const y = key_(answers[ex_qid_(q)]).slice(0, 1);
    if (y !== '' && y === key_(q.Correct)) n += ex_marks_(q);
  });
  return n;
}
/* Close a sitting whose deadline has passed without a submit. Call with the lock held. */
function ex_finalize_(sittings, row, qs) {
  const answers = ex_json_(row.Answers, {});
  put_(sittings, row._row, 'McqScore', ex_mcqScore_(qs, answers));
  put_(sittings, row._row, 'Submitted', row.Deadline ? String(row.Deadline) : ex_fmt_(ex_now_(), true), true);
  row.Submitted = row.Deadline;
}
function ex_sweep_(sittings, exam, qs) {          // finalize every overdue unfinished sitting of one exam
  const now = ex_now_(), id = key_(exam.ExamID);
  sittings.rows.forEach(function (r) {
    if (key_(r.ExamID) !== id || !r.Started || String(r.Submitted || '').trim()) return;
    if (now > ex_epoch_(String(r.Deadline)) + EX_GRACE_SECONDS * 1000) ex_finalize_(sittings, r, qs);
  });
}

/* The marks for one student in one exam. complete = nothing is still waiting for a teacher. */
function ex_compute_(exam, qs, sitting, oralRow) {
  const t = ex_totals_(exam, qs), hasQs = qs.length > 0;
  const submitted = !!(sitting && String(sitting.Submitted || '').trim());
  const wScores = ex_json_(sitting && sitting.WrittenScores, {});
  let written = 0;
  qs.forEach(function (q) { if (ex_isWritten_(q)) written += Math.min(ex_marks_(q), Math.max(0, ex_num_(wScores[ex_qid_(q)]))); });
  const mcq = submitted ? ex_num_(sitting.McqScore) : 0;
  const oralDone = t.oral > 0 && !!oralRow && oralRow.Score !== '' && oralRow.Score != null;
  const oral = oralDone ? Math.min(t.oral, Math.max(0, ex_num_(oralRow.Score))) : 0;
  const absent = hasQs && !submitted;
  const writtenDone = t.written === 0 || (submitted && key_(sitting.WrittenMarked) === 'TRUE');
  const oralOk = t.oral === 0 || oralDone;
  const complete = (hasQs ? (absent || writtenDone) : true) && oralOk;
  const score = mcq + written + oral;
  const percent = t.all > 0 ? Math.round(score / t.all * 100) : 0;
  return { totals: t, mcq: mcq, written: written, oral: oral, score: score, outOf: t.all, percent: percent, grade: ex_grade_(percent),
    passed: percent >= ex_pass_(exam), complete: complete, absent: absent, submitted: submitted, oralDone: !!oralDone };
}

/* ===== STUDENT REQUESTS (action "exams") ===== */
function examsRequest(p) {
  try {
    const a = auth_(p.id, p.code);
    if (a.error) return { ok: false, error: a.error };
    const st = a.st, op = String(p.op || 'list');
    if (op === 'start' || op === 'save' || op === 'submit') {
      const lock = LockService.getScriptLock(); lock.waitLock(20000);
      try {
        if (op === 'start') return ex_studentStart_(st, p);
        return ex_studentSave_(st, p, op === 'submit');
      } finally { lock.releaseLock(); }
    }
    if (op === 'result') return ex_studentResult_(st, p);
    if (op === 'report') return ex_studentReport_(st, p);
    return ex_studentList_(st);
  } catch (err) {
    if (/^USER:/.test(String(err && err.message))) return { ok: false, error: String(err.message).slice(5) };
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

function ex_visibleExams_(st) {
  const lvl = key_(st.Level), sid = key_(st.StudentID);
  return ex_table_('Exams').rows.filter(function (e) {
    return e.ExamID && e.Title && ex_state_(e) !== 'Draft' && matches_(e.Level, [lvl, sid]) && !isNaN(ex_start_(e));
  });
}

function ex_studentList_(st) {
  const sid = key_(st.StudentID), now = ex_now_();
  const sittings = ex_table_('ExamSittings'), oral = ex_table_('ExamOral'), allQs = ex_table_('ExamQuestions');
  const exams = ex_visibleExams_(st).map(function (e) {
    const qs = allQs.rows.filter(function (q) { return key_(q.ExamID) === key_(e.ExamID) && String(q.Question || '').trim() && (ex_isWritten_(q) || ex_options_(q).length >= 2); });
    const sit = ex_sitting_(sittings, e.ExamID, sid), or = ex_oralRow_(oral, e.ExamID, sid);
    const start = ex_start_(e), end = ex_end_(e), t = ex_totals_(e, qs), hasQs = qs.length > 0;
    let status;
    if (ex_state_(e) === 'Published') status = 'published';
    else if (sit && String(sit.Submitted || '').trim()) status = 'submitted';
    else if (sit && sit.Started) status = now <= ex_epoch_(String(sit.Deadline)) + EX_GRACE_SECONDS * 1000 ? 'inprogress' : 'submitted';
    else if (sit && !sit.Started && String(sit.GrantUntil || '').trim() && now <= ex_epoch_(String(sit.GrantUntil))) status = 'open';
    else if (!hasQs) status = now < start ? 'upcoming' : 'oral';
    else if (now < start) status = 'upcoming';
    else if (now <= Math.min(end, start + EX_LATE_MINUTES * 60000)) status = 'open';
    else status = 'missed';
    const out = { Kind: ex_kind_(e), ExamID: String(e.ExamID).trim(), Title: String(e.Title), Subject: String(e.Subject || 'General'), Start: iso_(e.Start, true), Minutes: ex_num_(e.Minutes),
      Instructions: String(e.Instructions || ''), Questions: qs.length, Marks: t.all, PassMark: ex_pass_(e), HasOral: t.oral > 0, OralMarks: t.oral,
      OralSlot: or ? String(or.Slot || '') : '', Status: status,
      StartsInSec: Math.max(0, Math.round((start - now) / 1000)), RemainingSec: sit && sit.Started && status === 'inprogress' ? Math.max(0, Math.round((ex_epoch_(String(sit.Deadline)) - now) / 1000)) : 0,
      LateSec: Math.max(0, Math.round((Math.min(end, start + EX_LATE_MINUTES * 60000) - now) / 1000)) };
    if (sit && !sit.Started && String(sit.GrantUntil || '').trim() && now <= ex_epoch_(String(sit.GrantUntil))) {      // allowed by the teacher
      out.Granted = true; out.LateSec = Math.max(0, Math.round((ex_epoch_(String(sit.GrantUntil)) - now) / 1000)); out.Minutes = Math.max(5, ex_num_(sit.GrantMinutes) || ex_num_(e.Minutes));
    }
    if (status === 'published') {
      const c = ex_compute_(e, qs, sit, or);
      out.Result = c.complete ? { percent: c.percent, grade: c.grade, remark: EX_REMARK[c.grade], passed: c.passed, score: c.score, outOf: c.outOf, absent: c.absent } : { pending: true };
    }
    return out;
  });
  exams.sort(function (x, y) { return x.Start < y.Start ? 1 : -1; });
  const done = exams.filter(function (x) { return x.Result && !x.Result.pending && !x.Result.absent; });
  const avg = done.length ? Math.round(done.reduce(function (s, x) { return s + x.Result.percent; }, 0) / done.length) : null;
  return { ok: true, term: schoolTerm_(), student: { name: st.Name, level: st.Level }, exams: exams, average: avg, averageGrade: avg == null ? '' : ex_grade_(avg),
    blocked: EX_BLOCK_OVERDUE && payStatus_(st) === 'Overdue', examsFrom: EX_EXAMS_FROM, examsFromText: ex_nice_(EX_EXAMS_FROM) };
}

function ex_studentExam_(st, examId) {
  const e = ex_visibleExams_(st).filter(function (x) { return key_(x.ExamID) === key_(examId); })[0];
  if (!e) ex_fail_('That exam is not available.');
  return e;
}

function ex_nice_(day) { const m = String(day).split('-'); return Number(m[2]) + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m[1]) - 1] + ' ' + m[0]; }
function ex_studentStart_(st, p) {
  const e = ex_studentExam_(st, p.examId);
  if (ex_state_(e) !== 'Live') ex_fail_('This exam is closed.');
  if (ex_beforeExams_(e) || (ex_kind_(e) === 'Exam' && today_() < EX_EXAMS_FROM)) ex_fail_('The exams begin on ' + ex_nice_(EX_EXAMS_FROM) + '.');
  if (EX_BLOCK_OVERDUE && payStatus_(st) === 'Overdue') ex_fail_('Please pay your fees before you sit exams.');
  const qs = ex_questions_(e.ExamID);
  if (!qs.length) ex_fail_('This exam has no written paper. Your teacher will tell you about the oral part.');
  const sittings = ex_table_('ExamSittings'), sid = String(st.StudentID).trim();
  let sit = ex_sitting_(sittings, e.ExamID, sid);
  const now = ex_now_(), start = ex_start_(e), end = ex_end_(e);
  if (sit && String(sit.Submitted || '').trim()) ex_fail_('You have already submitted this exam.');
  if (sit && !sit.Started && String(sit.GrantUntil || '').trim()) {            // the teacher has allowed this student a late sitting or a resit
    if (now > ex_epoch_(String(sit.GrantUntil))) ex_fail_('Your teacher\u2019s permission to sit this exam has run out. Please speak to your teacher.');
    const mins = Math.max(5, ex_num_(sit.GrantMinutes) || ex_num_(e.Minutes));
    put_(sittings, sit._row, 'Started', ex_fmt_(now, true), true); put_(sittings, sit._row, 'Deadline', ex_fmt_(now + mins * 60000, true), true);
    sit = ex_sitting_(ex_table_('ExamSittings'), e.ExamID, sid);
  } else if (!sit) {
    if (now < start) ex_fail_('This exam has not started yet.');
    if (now > Math.min(end, start + EX_LATE_MINUTES * 60000)) ex_fail_('The time to begin this exam has passed. Please speak to your teacher.');
    append_(sittings, { ExamID: String(e.ExamID).trim(), StudentID: sid, Started: ex_fmt_(now, true), Deadline: ex_fmt_(end, true), Answers: '{}' }, ['ExamID', 'StudentID', 'Started', 'Deadline', 'Answers']);
    sit = ex_sitting_(ex_table_('ExamSittings'), e.ExamID, sid);
  } else if (now > ex_epoch_(String(sit.Deadline)) + EX_GRACE_SECONDS * 1000) {
    ex_finalize_(sittings, sit, qs);
    ex_fail_('The time for this exam has ended. Your answers were submitted automatically.');
  }
  const deadline = ex_epoch_(String(sit.Deadline));
  const rnd = ex_rng_(key_(sid) + '|' + key_(e.ExamID)), order = String(e.Shuffle).toUpperCase() === 'FALSE' ? qs : ex_shuffle_(qs, rnd);
  const questions = order.map(function (q) {
    const written = ex_isWritten_(q), opts = written ? [] : (String(e.Shuffle).toUpperCase() === 'FALSE' ? ex_options_(q) : ex_shuffle_(ex_options_(q), rnd));
    return { id: ex_qid_(q), type: written ? 'written' : 'mcq', question: String(q.Question).trim(), marks: ex_marks_(q), options: opts };
  });
  return { ok: true, exam: { ExamID: String(e.ExamID).trim(), Title: String(e.Title), Instructions: String(e.Instructions || ''), Minutes: ex_num_(e.Minutes), Marks: ex_totals_(e, qs).all },
    questions: questions, answers: ex_json_(sit.Answers, {}), remainingSec: Math.max(0, Math.round((deadline - now) / 1000)), maxChars: EX_MAX_WRITTEN_CHARS };
}

function ex_cleanAnswers_(qs, raw) {
  const out = {}, src = raw && typeof raw === 'object' ? raw : {};
  qs.forEach(function (q) {
    const id = ex_qid_(q), v = src[id];
    if (v == null || v === '') return;
    if (ex_isWritten_(q)) { const t = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').slice(0, EX_MAX_WRITTEN_CHARS); if (t.trim()) out[id] = t; }
    else { const k = key_(v).slice(0, 1); if (ex_options_(q).some(function (o) { return o.k === k; })) out[id] = k; }
  });
  return out;
}

function ex_studentSave_(st, p, finish) {
  const e = ex_studentExam_(st, p.examId), qs = ex_questions_(e.ExamID), sittings = ex_table_('ExamSittings');
  const sit = ex_sitting_(sittings, e.ExamID, st.StudentID);
  if (!sit || !sit.Started) ex_fail_('Start the exam first.');
  if (String(sit.Submitted || '').trim()) return { ok: true, submitted: true, remainingSec: 0 };
  const now = ex_now_(), deadline = ex_epoch_(String(sit.Deadline)), late = now > deadline + EX_GRACE_SECONDS * 1000;
  if (!late) {
    const ans = ex_cleanAnswers_(qs, p.answers);
    put_(sittings, sit._row, 'Answers', JSON.stringify(ans), true);
    sit.Answers = JSON.stringify(ans);
  }
  if (finish || late) {
    put_(sittings, sit._row, 'McqScore', ex_mcqScore_(qs, ex_json_(sit.Answers, {})));
    put_(sittings, sit._row, 'Submitted', late ? String(sit.Deadline) : ex_fmt_(now, true), true);
    return { ok: true, submitted: true, late: late, remainingSec: 0 };
  }
  return { ok: true, submitted: false, remainingSec: Math.max(0, Math.round((deadline - now) / 1000)) };
}

function ex_studentResult_(st, p) {
  const e = ex_studentExam_(st, p.examId);
  if (ex_state_(e) !== 'Published') return { ok: false, error: 'Results are not out yet.' };
  const qs = ex_questions_(e.ExamID), sid = String(st.StudentID).trim();
  const sit = ex_sitting_(ex_table_('ExamSittings'), e.ExamID, sid), or = ex_oralRow_(ex_table_('ExamOral'), e.ExamID, sid);
  const c = ex_compute_(e, qs, sit, or);
  if (!c.complete) return { ok: true, pending: true, title: String(e.Title) };
  const answers = ex_json_(sit && sit.Answers, {}), wScores = ex_json_(sit && sit.WrittenScores, {});
  const review = c.absent ? [] : qs.map(function (q) {
    const id = ex_qid_(q), written = ex_isWritten_(q), yours = answers[id] == null ? '' : String(answers[id]);
    const r = { id: id, type: written ? 'written' : 'mcq', question: String(q.Question).trim(), marks: ex_marks_(q), yours: yours, explanation: String(q.Explanation || '') };
    if (written) { r.score = Math.min(ex_marks_(q), Math.max(0, ex_num_(wScores[id]))); r.modelAnswer = String(q.ModelAnswer || ''); }
    else { r.options = ex_options_(q); r.correct = key_(q.Correct); r.ok = key_(yours).slice(0, 1) === key_(q.Correct); }
    return r;
  });
  return { ok: true, title: String(e.Title), subject: String(e.Subject || ''), date: iso_(e.Start), student: String(st.Name), level: String(st.Level),
    percent: c.percent, grade: c.grade, remark: EX_REMARK[c.grade], passed: c.passed, passMark: ex_pass_(e), score: c.score, outOf: c.outOf, absent: c.absent,
    parts: { mcq: { score: c.mcq, outOf: c.totals.mcq }, written: { score: c.written, outOf: c.totals.written }, oral: { score: c.oral, outOf: c.totals.oral } },
    comment: String(sit && sit.Comment || ''), oralComment: String(or && or.Comment || ''), oralSlot: String(or && or.Slot || ''), review: review };
}

/* ===== TEACHER REQUESTS (action "examt") ===== */
function examtRequest(p) {
  try {
    const a = tchAuth_(p.id, p.code);
    if (a.error) return { ok: false, error: a.error };
    const me = a.me, op = String(p.op || 'list');
    if (op === 'list') return ex_tList_(me);
    if (op === 'detail') return ex_tDetail_(me, p);
    if (op === 'sitting') return ex_tSitting_(me, p);
    if (op === 'exam') return ex_tExam_(me, p);
    if (op === 'book') return ex_tBook_(me, p);
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      if (op === 'save') return ex_tSave_(me, p);
      if (op === 'state') return ex_tState_(me, p);
      if (op === 'delete') return ex_tDelete_(me, p);
      if (op === 'mark') return ex_tMark_(me, p);
      if (op === 'oral') return ex_tOral_(me, p);
      if (op === 'gscore') return ex_tGscore_(me, p);
      if (op === 'units') return ex_tUnits_(me, p);
      if (op === 'grant') return ex_tGrant_(me, p);
    } finally { lock.releaseLock(); }
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    if (/^USER:/.test(String(err && err.message))) return { ok: false, error: String(err.message).slice(5) };
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

function ex_tCanEdit_(me, e) { return tchAdmin_(me) || key_(e.CreatedBy) === key_(me.TeacherID); }
/* The students of an exam that this teacher may see: the exam's creator and admins see the whole level, others only their own students. */
function ex_tStudents_(me, e) {
  const all = table_('Students').rows.filter(function (r) { return r.StudentID && key_(r.Active) !== 'FALSE' && matches_(e.Level, [key_(r.Level), key_(r.StudentID)]); });
  const wide = ex_tCanEdit_(me, e);
  return all.filter(function (r) { return wide || tchOwns_(me, r); });
}
function ex_tExamFor_(me, examId) {
  const e = ex_table_('Exams').rows.filter(function (r) { return key_(r.ExamID) === key_(examId); })[0];
  if (!e) ex_fail_('That exam was not found.');
  if (!ex_tCanEdit_(me, e) && !ex_tStudents_(me, e).length) ex_fail_('That exam is not yours.');
  return e;
}

function ex_tList_(me) {
  const exams = ex_table_('Exams').rows.filter(function (e) { return e.ExamID && e.Title; });
  const allQs = ex_table_('ExamQuestions'), sittings = ex_table_('ExamSittings'), oral = ex_table_('ExamOral');
  const now = ex_now_(), mine = tchMine_(me).rows, levels = {};
  (tchAdmin_(me) ? table_('Students').rows : mine).forEach(function (r) { if (String(r.Level || '').trim()) levels[String(r.Level).trim()] = true; });
  const out = [];
  exams.forEach(function (e) {
    if (!ex_tCanEdit_(me, e) && !ex_tStudents_(me, e).length) return;
    const qs = allQs.rows.filter(function (q) { return key_(q.ExamID) === key_(e.ExamID) && String(q.Question || '').trim() && (ex_isWritten_(q) || ex_options_(q).length >= 2); });
    const t = ex_totals_(e, qs), studs = ex_tStudents_(me, e), start = ex_start_(e);
    let sat = 0, toMark = 0, oralLeft = 0;
    studs.forEach(function (s) {
      const sit = ex_sitting_(sittings, e.ExamID, s.StudentID), or = ex_oralRow_(oral, e.ExamID, s.StudentID);
      const c = ex_compute_(e, qs, sit, or);
      if (c.submitted) sat++;
      if (t.written > 0 && c.submitted && !(sit && key_(sit.WrittenMarked) === 'TRUE')) toMark++;
      if (t.oral > 0 && !c.oralDone) oralLeft++;
    });
    out.push({ ExamID: String(e.ExamID).trim(), Title: String(e.Title), Subject: String(e.Subject || ''), Level: String(e.Level || ''), Start: iso_(e.Start, true), Minutes: ex_num_(e.Minutes),
      Kind: ex_kind_(e), Term: String(e.Term || ''), State: ex_state_(e), Questions: qs.length, Marks: t.all, OralMarks: t.oral, Students: studs.length, Sat: sat, ToMark: toMark, OralLeft: oralLeft,
      CanEdit: ex_tCanEdit_(me, e), Ended: !isNaN(start) && now > ex_end_(e) + EX_GRACE_SECONDS * 1000, Started: !isNaN(start) && now >= start, CreatedBy: String(e.CreatedBy || '') });
  });
  out.sort(function (x, y) { return x.Start < y.Start ? 1 : -1; });
  return { ok: true, teacher: { name: me.Name, admin: tchAdmin_(me) }, exams: out, levels: Object.keys(levels).sort(), now: ex_fmt_(now, false), terms: ex_gTerms_(), term: schoolTerm_(), weights: EX_WEIGHTS, examsFrom: EX_EXAMS_FROM, examsFromText: ex_nice_(EX_EXAMS_FROM), bands: [['A', '90-100'], ['B', '79-89'], ['C', '60-78'], ['D', '50-59'], ['E', '49'], ['F', '0-48']] };
}

function ex_tExam_(me, p) {            // the full exam, for the editor (teachers only; includes the answer key)
  const e = ex_tExamFor_(me, p.examId);
  if (!ex_tCanEdit_(me, e)) ex_fail_('Only the teacher who made this exam can open it for editing.');
  const qs = ex_table_('ExamQuestions').rows.filter(function (q) { return key_(q.ExamID) === key_(e.ExamID) && String(q.Question || '').trim(); });
  const locked = ex_table_('ExamSittings').rows.some(function (r) { return key_(r.ExamID) === key_(e.ExamID); }) ||
    ex_table_('ExamOral').rows.some(function (r) { return key_(r.ExamID) === key_(e.ExamID) && String(r.Score == null ? '' : r.Score) !== ''; });
  return { ok: true, locked: locked, exam: { ExamID: String(e.ExamID).trim(), Title: String(e.Title), Subject: String(e.Subject || ''), Level: String(e.Level || ''), Start: iso_(e.Start, true),
    Minutes: ex_num_(e.Minutes), PassMark: ex_pass_(e), OralMarks: Math.round(ex_num_(e.OralMarks)), Instructions: String(e.Instructions || ''), Shuffle: String(e.Shuffle).toUpperCase() !== 'FALSE', State: ex_state_(e), Kind: ex_kind_(e), Term: String(e.Term || '') },
    questions: qs.map(function (q) { return { type: ex_isWritten_(q) ? 'written' : 'mcq', question: String(q.Question), A: String(q.A || ''), B: String(q.B || ''), C: String(q.C || ''), D: String(q.D || ''),
      correct: key_(q.Correct), marks: ex_marks_(q), explanation: String(q.Explanation || ''), modelAnswer: String(q.ModelAnswer || '') }; }) };
}

function ex_tSave_(me, p) {
  const t = ex_table_('Exams'), d = p.exam || {}, id = ex_str_(d.ExamID, 20).toUpperCase();
  let e = id ? t.rows.filter(function (r) { return key_(r.ExamID) === id; })[0] : null;
  if (id && !e) ex_fail_('That exam was not found.');
  if (e && !ex_tCanEdit_(me, e)) ex_fail_('Only the teacher who made this exam can change it.');
  const locked = !!e && (ex_table_('ExamSittings').rows.some(function (r) { return key_(r.ExamID) === key_(e.ExamID); }) ||
    ex_table_('ExamOral').rows.some(function (r) { return key_(r.ExamID) === key_(e.ExamID) && String(r.Score == null ? '' : r.Score) !== ''; }));

  const title = ex_str_(d.Title, 120), subject = ex_str_(d.Subject, 60), level = ex_str_(d.Level, 120);
  const start = ex_str_(d.Start, 16), minutes = Math.round(ex_num_(d.Minutes)), pass = Math.round(ex_num_(d.PassMark)) || EX_DEFAULT_PASS;
  const oralMarks = Math.max(0, Math.min(100, Math.round(ex_num_(d.OralMarks))));
  const kindRaw = String(d.Kind || '').trim().toUpperCase(), kind = kindRaw === 'CA1' ? 'CA1' : kindRaw === 'CA2' ? 'CA2' : kindRaw === 'EXAM' ? 'Exam' : '';
  if (kindRaw && !kind) ex_fail_('Choose CA 1, CA 2 or Exam.');
  const term = ex_str_(d.Term, 40) || (kind ? schoolTerm_().Key : '');
  if (kind === 'Exam' && (!e || locked === false) && start.slice(0, 10) < EX_EXAMS_FROM) ex_fail_('The exams begin on ' + ex_nice_(EX_EXAMS_FROM) + '. Choose that day or later.');
  if (!title) ex_fail_('Give the exam a title.');
  if (!level) ex_fail_('Choose the level (or levels) that sit this exam.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) || isNaN(ex_epoch_(start))) ex_fail_('Choose the start date and time.');
  if (minutes < 5 || minutes > 300) ex_fail_('The exam length must be between 5 and 300 minutes.');
  if (pass < 1 || pass > 100) ex_fail_('The pass mark must be between 1 and 100.');

  let questions = [];
  if (!locked) {
    const raw = Array.isArray(p.questions) ? p.questions : [];
    if (raw.length > EX_MAX_QUESTIONS) ex_fail_('An exam can have at most ' + EX_MAX_QUESTIONS + ' questions.');
    raw.forEach(function (q, i) {
      const n = i + 1, type = String(q.type).toLowerCase() === 'written' ? 'Written' : 'MCQ', text = ex_str_(q.question, 1500);
      if (!text) ex_fail_('Question ' + n + ' is empty.');
      const marks = Math.round(ex_num_(q.marks)) || 1;
      if (marks < 1 || marks > 100) ex_fail_('Question ' + n + ': marks must be between 1 and 100.');
      const o = { type: type, question: text, marks: marks, explanation: ex_str_(q.explanation, 600), modelAnswer: ex_str_(q.modelAnswer, 1500), A: '', B: '', C: '', D: '', correct: '' };
      if (type === 'MCQ') {
        ['A', 'B', 'C', 'D'].forEach(function (k) { o[k] = ex_str_(q[k], 300); });
        const filled = ['A', 'B', 'C', 'D'].filter(function (k) { return o[k] !== ''; });
        if (filled.length < 2) ex_fail_('Question ' + n + ' needs at least two options.');
        o.correct = key_(q.correct).slice(0, 1);
        if (filled.indexOf(o.correct) < 0) ex_fail_('Question ' + n + ': choose which option is correct.');
      }
      questions.push(o);
    });
    if (!questions.length && oralMarks === 0) ex_fail_('Add at least one question, or give the exam oral marks.');
  } else {
    if (d.Level != null && key_(d.Level) !== key_(e.Level)) ex_fail_('Students have already started this exam, so its level cannot change.');
    if (key_(d.Start) !== key_(iso_(e.Start, true)) || minutes !== ex_num_(e.Minutes) || oralMarks !== Math.round(ex_num_(e.OralMarks))) ex_fail_('Students have already started this exam, so its time, length and oral marks are fixed now.');
  }

  let examId;
  if (e) {
    examId = String(e.ExamID).trim();
    put_(t, e._row, 'Title', title, true); put_(t, e._row, 'Subject', subject, true); put_(t, e._row, 'PassMark', pass);
    put_(t, e._row, 'Instructions', ex_str_(d.Instructions, 1500), true); put_(t, e._row, 'Kind', kind, true); put_(t, e._row, 'Term', term, true);
    if (!locked) {
      put_(t, e._row, 'Level', level, true); put_(t, e._row, 'Start', start, true); put_(t, e._row, 'Minutes', minutes);
      put_(t, e._row, 'OralMarks', oralMarks); put_(t, e._row, 'Shuffle', d.Shuffle === false ? 'FALSE' : 'TRUE');
    }
  } else {
    let n = 0;
    t.rows.forEach(function (r) { const m = /^EX-(\d+)$/.exec(String(r.ExamID).trim().toUpperCase()); if (m) n = Math.max(n, Number(m[1])); });
    examId = 'EX-' + ('000' + (n + 1)).slice(-3);
    append_(t, { ExamID: examId, Title: title, Subject: subject, Level: level, Start: start, Minutes: minutes, PassMark: pass, OralMarks: oralMarks,
      Instructions: ex_str_(d.Instructions, 1500), Shuffle: d.Shuffle === false ? 'FALSE' : 'TRUE', State: 'Draft', CreatedBy: String(me.TeacherID).trim(), Created: ex_fmt_(ex_now_(), false), Kind: kind, Term: term },
      ['ExamID', 'Title', 'Subject', 'Level', 'Start', 'Instructions', 'CreatedBy', 'Created', 'Kind', 'Term']);
  }
  if (!locked) {
    const qt = ex_table_('ExamQuestions');
    for (let i = qt.rows.length - 1; i >= 0; i--) if (key_(qt.rows[i].ExamID) === key_(examId)) qt.sh.deleteRow(qt.rows[i]._row);
    const qt2 = ex_table_('ExamQuestions');
    questions.forEach(function (q, i) {
      append_(qt2, { ExamID: examId, QID: String(i + 1), Type: q.type, Question: q.question, A: q.A, B: q.B, C: q.C, D: q.D, Correct: q.correct, Marks: q.marks,
        Explanation: q.explanation, ModelAnswer: q.modelAnswer }, ['ExamID', 'QID', 'Question', 'A', 'B', 'C', 'D', 'Correct', 'Explanation', 'ModelAnswer']);
    });
  }
  return { ok: true, examId: examId };
}

function ex_tState_(me, p) {
  const t = ex_table_('Exams'), e = t.rows.filter(function (r) { return key_(r.ExamID) === key_(p.examId); })[0];
  if (!e) ex_fail_('That exam was not found.');
  if (!ex_tCanEdit_(me, e)) ex_fail_('Only the teacher who made this exam can change it.');
  const to = String(p.state || ''), cur = ex_state_(e), now = ex_now_();
  const qs = ex_questions_(e.ExamID), tot = ex_totals_(e, qs);
  if (to === 'Live') {
    if (cur === 'Published') ex_fail_('Results are already published.');
    if (!qs.length && tot.oral === 0) ex_fail_('Add questions or oral marks first.');
    if (cur === 'Draft' && now >= ex_start_(e)) ex_fail_('The start time has already passed. Change the start time to a future time first.');
    put_(t, e._row, 'State', 'Live', true);
  } else if (to === 'Draft') {
    if (ex_table_('ExamSittings').rows.some(function (r) { return key_(r.ExamID) === key_(e.ExamID); })) ex_fail_('Students have already started this exam, so it cannot go back to draft.');
    put_(t, e._row, 'State', 'Draft', true);
  } else if (to === 'Published') {
    if (cur === 'Draft') ex_fail_('Make the exam live before publishing results.');
    if (qs.length && now < ex_end_(e) + EX_GRACE_SECONDS * 1000) ex_fail_('The exam is still running. Publish results after it has ended.');
    const sittings = ex_table_('ExamSittings'); ex_sweep_(sittings, e, qs);
    put_(t, e._row, 'State', 'Published', true);
  } else ex_fail_('Unknown state.');
  return { ok: true };
}

function ex_tDelete_(me, p) {
  const t = ex_table_('Exams'), e = t.rows.filter(function (r) { return key_(r.ExamID) === key_(p.examId); })[0];
  if (!e) ex_fail_('That exam was not found.');
  if (!ex_tCanEdit_(me, e)) ex_fail_('Only the teacher who made this exam can delete it.');
  if (ex_state_(e) !== 'Draft') ex_fail_('Only a draft exam can be deleted.');
  const qt = ex_table_('ExamQuestions');
  for (let i = qt.rows.length - 1; i >= 0; i--) if (key_(qt.rows[i].ExamID) === key_(e.ExamID)) qt.sh.deleteRow(qt.rows[i]._row);
  t.sh.deleteRow(e._row);
  return { ok: true };
}

function ex_tDetail_(me, p) {
  const e = ex_tExamFor_(me, p.examId), qs = ex_questions_(e.ExamID);
  const sittings = ex_table_('ExamSittings'), oral = ex_table_('ExamOral');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { ex_sweep_(sittings, e, qs); } finally { lock.releaseLock(); }
  const t = ex_totals_(e, qs);
  const rows = ex_tStudents_(me, e).map(function (s) {
    const sit = ex_sitting_(ex_table_('ExamSittings'), e.ExamID, s.StudentID), or = ex_oralRow_(oral, e.ExamID, s.StudentID), c = ex_compute_(e, qs, sit, or);
    const status = c.submitted ? (t.written > 0 && key_(sit.WrittenMarked) !== 'TRUE' ? 'To mark' : 'Marked') : sit && sit.Started ? 'Writing' : sit && String(sit.GrantUntil || '').trim() ? 'Resit allowed' : qs.length ? (ex_now_() > ex_end_(e) ? 'Absent' : 'Not yet') : 'Oral only';
    return { StudentID: String(s.StudentID).trim(), Name: String(s.Name || ''), Level: String(s.Level || ''), Status: status, Mcq: c.mcq, Written: c.written, Oral: c.oral,
      OralSlot: or ? String(or.Slot || '') : '', OralScored: c.oralDone, OralComment: or ? String(or.Comment || '') : '', Percent: c.percent, Grade: c.grade, Complete: c.complete, Submitted: c.submitted,
      Started: sit ? String(sit.Started || '') : '', Comment: sit ? String(sit.Comment || '') : '' };
  });
  rows.sort(function (a, b) { return a.Name < b.Name ? -1 : 1; });
  return { ok: true, exam: { ExamID: String(e.ExamID).trim(), Title: String(e.Title), Subject: String(e.Subject || ''), Level: String(e.Level || ''), Start: iso_(e.Start, true), Minutes: ex_num_(e.Minutes),
    State: ex_state_(e), PassMark: ex_pass_(e), CanEdit: ex_tCanEdit_(me, e), Ended: ex_now_() > ex_end_(e) + EX_GRACE_SECONDS * 1000 }, totals: t, students: rows,
    written: qs.filter(ex_isWritten_).map(function (q) { return { id: ex_qid_(q), question: String(q.Question).trim(), marks: ex_marks_(q) }; }) };
}

function ex_tSitting_(me, p) {         // one student's written answers, for marking
  const e = ex_tExamFor_(me, p.examId), qs = ex_questions_(e.ExamID);
  const s = ex_tStudents_(me, e).filter(function (r) { return key_(r.StudentID) === key_(p.studentId); })[0];
  if (!s) ex_fail_('That student is not yours.');
  const sit = ex_sitting_(ex_table_('ExamSittings'), e.ExamID, s.StudentID);
  if (!sit || !String(sit.Submitted || '').trim()) ex_fail_('This student has not submitted yet.');
  const answers = ex_json_(sit.Answers, {}), scores = ex_json_(sit.WrittenScores, {});
  return { ok: true, student: { StudentID: String(s.StudentID).trim(), Name: String(s.Name || '') }, comment: String(sit.Comment || ''), marked: key_(sit.WrittenMarked) === 'TRUE',
    questions: qs.map(function (q) {
      const id = ex_qid_(q), written = ex_isWritten_(q), yours = answers[id] == null ? '' : String(answers[id]);
      const r = { id: id, type: written ? 'written' : 'mcq', question: String(q.Question).trim(), marks: ex_marks_(q), yours: yours };
      if (written) { r.modelAnswer = String(q.ModelAnswer || ''); r.score = scores[id] == null ? '' : scores[id]; }
      else { r.options = ex_options_(q); r.correct = key_(q.Correct); r.ok = key_(yours).slice(0, 1) === key_(q.Correct); }
      return r;
    }) };
}

function ex_tMark_(me, p) {
  const e = ex_tExamFor_(me, p.examId), qs = ex_questions_(e.ExamID);
  const s = ex_tStudents_(me, e).filter(function (r) { return key_(r.StudentID) === key_(p.studentId); })[0];
  if (!s) ex_fail_('That student is not yours.');
  const sittings = ex_table_('ExamSittings'), sit = ex_sitting_(sittings, e.ExamID, s.StudentID);
  if (!sit || !String(sit.Submitted || '').trim()) ex_fail_('This student has not submitted yet.');
  const raw = p.scores && typeof p.scores === 'object' ? p.scores : {}, out = {};
  qs.filter(ex_isWritten_).forEach(function (q) {
    const id = ex_qid_(q), v = raw[id];
    if (v === '' || v == null) ex_fail_('Give a mark for every written question (0 if it is wrong).');
    const n = Number(v);
    if (!isFinite(n) || n < 0 || n > ex_marks_(q)) ex_fail_('A mark must be between 0 and ' + ex_marks_(q) + ' for that question.');
    out[id] = Math.round(n * 2) / 2;
  });
  put_(sittings, sit._row, 'WrittenScores', JSON.stringify(out), true);
  put_(sittings, sit._row, 'WrittenMarked', 'TRUE', true);
  put_(sittings, sit._row, 'Comment', ex_str_(p.comment, 600), true);
  put_(sittings, sit._row, 'MarkedBy', String(me.TeacherID).trim(), true);
  return { ok: true };
}

function ex_tOral_(me, p) {
  const e = ex_tExamFor_(me, p.examId), t = ex_totals_(e, ex_questions_(e.ExamID));
  if (t.oral <= 0) ex_fail_('This exam has no oral part.');
  const s = ex_tStudents_(me, e).filter(function (r) { return key_(r.StudentID) === key_(p.studentId); })[0];
  if (!s) ex_fail_('That student is not yours.');
  const oral = ex_table_('ExamOral'), row = ex_oralRow_(oral, e.ExamID, s.StudentID);
  const slot = ex_str_(p.slot, 80), comment = ex_str_(p.comment, 600), raw = p.score;
  let score = '';
  if (raw !== '' && raw != null) {
    const n = Number(raw);
    if (!isFinite(n) || n < 0 || n > t.oral) ex_fail_('The oral mark must be between 0 and ' + t.oral + '.');
    score = Math.round(n * 2) / 2;
  }
  if (row) {
    put_(oral, row._row, 'Slot', slot, true); put_(oral, row._row, 'Score', score); put_(oral, row._row, 'Comment', comment, true); put_(oral, row._row, 'MarkedBy', String(me.TeacherID).trim(), true);
  } else {
    append_(oral, { ExamID: String(e.ExamID).trim(), StudentID: String(s.StudentID).trim(), Slot: slot, Score: score, Comment: comment, MarkedBy: String(me.TeacherID).trim() },
      ['ExamID', 'StudentID', 'Slot', 'Comment', 'MarkedBy']);
  }
  return { ok: true };
}


/* ===== GRADEBOOK (term report: CA1 /20 + CA2 /20 + Exam /60 = /100) ===== */
const EX_PARTS = ['CA1', 'CA2', 'Exam'];
const EX_DEFAULT_UNITS = 2;     // credit units of a course nobody has set units for
const EX_MAX_UNITS = 6;
/* Units the school has fixed for its courses. Spelling variations are matched too (letters only, any case). A row in the SubjectUnits tab always wins. Everything else is EX_DEFAULT_UNITS. */
const EX_UNIT_RULES = [
  [3, ['hadith', 'hadeeth', 'hadis', 'fiqh', 'fiqhi', 'tawheed', 'tawhid', 'tawhead']],
  [1, ['adhkaar', 'adhkar', 'athkar', 'athkaar', 'azkar', 'azkaar', 'dhikr']],
  [2, ['sarf', 'sarfu', 'nahw', 'nahu', 'nahwu']]
];
const EX_POINTS = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };   // grade points for the GPA / CGPA (out of 5.0); every subject counts equally
function ex_units_() {                  // { SUBJECT: units } from the SubjectUnits tab
  const m = {};
  ex_table_('SubjectUnits').rows.forEach(function (r) { const u = Math.round(ex_num_(r.Units)); if (String(r.Subject || '').trim() && u >= 1) m[key_(r.Subject)] = Math.min(EX_MAX_UNITS, u); });
  return m;
}
function ex_unitOf_(map, subject) {
  if (map[key_(subject)]) return map[key_(subject)];
  const letters = String(subject || '').toLowerCase().replace(/[^a-z]/g, '');
  for (let i = 0; i < EX_UNIT_RULES.length; i++) if (EX_UNIT_RULES[i][1].indexOf(letters) >= 0) return EX_UNIT_RULES[i][0];
  return EX_DEFAULT_UNITS;
}
function ex_r1_(n) { return Math.round(n * 10) / 10; }

/* The students whose scores this teacher may see in a level: admins see the whole level, others only their own students. */
function ex_gStudents_(me, level) {
  return table_('Students').rows.filter(function (r) {
    return r.StudentID && key_(r.Active) !== 'FALSE' && key_(r.Level) === key_(level) && tchOwns_(me, r);
  });
}
function ex_gTerms_() {
  const seen = {};
  ex_table_('Exams').rows.forEach(function (e) { if (String(e.Term || '').trim()) seen[String(e.Term).trim()] = true; });
  ex_table_('Gradebook').rows.forEach(function (r) { if (String(r.Term || '').trim()) seen[String(r.Term).trim()] = true; });
  return Object.keys(seen).sort().reverse();
}

function ex_tBook_(me, p) {
  const term = ex_str_(p.term, 40), level = ex_str_(p.level, 120);
  const terms = ex_gTerms_();
  const levels = {};
  (tchAdmin_(me) ? table_('Students').rows : tchMine_(me).rows).forEach(function (r) { if (String(r.Level || '').trim()) levels[String(r.Level).trim()] = true; });
  const base = { ok: true, term: schoolTerm_(), terms: terms, levels: Object.keys(levels).sort(), weights: EX_WEIGHTS, bands: [['A', '90-100'], ['B', '79-89'], ['C', '60-78'], ['D', '50-59'], ['E', '49'], ['F', '0-48']] };
  if (!term || !level) return Object.assign(base, { students: [], subjects: [], cells: {} });
  const g = ex_gbCompute_(term, ex_gStudents_(me, level), false);
  return Object.assign(base, { term: schoolTerm_(), termKey: term, level: level, students: g.students, subjects: g.subjects, cells: g.cells, units: g.units, defaultUnits: EX_DEFAULT_UNITS, maxUnits: EX_MAX_UNITS, canSetUnits: tchAdmin_(me) });
}

/* The scores of some students for one term. publishedOnly (the student's own report) leaves out exams that are not published yet. */
function ex_gbCompute_(term, studs, publishedOnly) {
  const exams = ex_table_('Exams').rows.filter(function (e) {
    return e.ExamID && ex_kind_(e) && String(e.Term || '').trim() === term && (publishedOnly ? ex_state_(e) === 'Published' : ex_state_(e) !== 'Draft');
  });
  if (!publishedOnly) {      // finish any sitting whose time has run out, so absent students and unsubmitted work are not guessed at
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try { const st0 = ex_table_('ExamSittings'); exams.forEach(function (e) { ex_sweep_(st0, e, ex_questions_(e.ExamID)); }); } finally { lock.releaseLock(); }
  }
  const sittings = ex_table_('ExamSittings'), oral = ex_table_('ExamOral'), manual = ex_table_('Gradebook'), now = ex_now_(), unitMap = ex_units_();
  const qsBy = {}; exams.forEach(function (e) { qsBy[key_(e.ExamID)] = ex_questions_(e.ExamID); });

  const subjects = {};
  const subjOf = function (e) { return String(e.Subject || '').trim() || 'General'; };
  exams.forEach(function (e) { if (ex_tStudentsIn_(studs, e).length) subjects[subjOf(e)] = true; });
  manual.rows.forEach(function (r) { if (String(r.Term || '').trim() === term && r.Score !== '' && r.Score != null && studs.some(function (s) { return key_(s.StudentID) === key_(r.StudentID); })) subjects[String(r.Subject || '').trim() || 'General'] = true; });
  const subjectList = Object.keys(subjects).sort();

  const students = [], cells = {};
  studs = studs.slice().sort(function (a, b) { return String(a.Name) < String(b.Name) ? -1 : 1; });
  studs.forEach(function (s) {
    const sid = String(s.StudentID).trim();
    students.push({ StudentID: sid, Name: String(s.Name || ''), Level: String(s.Level || '') });
    cells[sid] = {};
    let sum = 0, nDone = 0, pts = 0, uSum = 0;
    subjectList.forEach(function (sub) {
      const cell = { CA1: null, CA2: null, Exam: null, src: {}, flag: {} };
      EX_PARTS.forEach(function (part) {
        const man = manual.rows.filter(function (r) {
          return String(r.Term || '').trim() === term && key_(r.Subject || 'General') === key_(sub) && key_(r.StudentID) === key_(sid) && String(r.Component) === part && r.Score !== '' && r.Score != null;
        })[0];
        if (man) { cell[part] = ex_r1_(Math.min(EX_WEIGHTS[part], Math.max(0, ex_num_(man.Score)))); cell.src[part] = 'typed'; return; }
        const mine = exams.filter(function (e) { return ex_kind_(e) === part && key_(subjOf(e)) === key_(sub) && matches_(e.Level, [key_(s.Level), key_(sid)]); });
        if (!mine.length) return;
        const pcts = []; let waiting = false, absent = false;
        mine.forEach(function (e) {
          const qs = qsBy[key_(e.ExamID)], c = ex_compute_(e, qs, ex_sitting_(sittings, e.ExamID, sid), ex_oralRow_(oral, e.ExamID, sid));
          const over = !isNaN(ex_start_(e)) && now > ex_end_(e) + EX_GRACE_SECONDS * 1000;
          if (c.absent && !over) { waiting = true; return; }
          if (!c.complete) { waiting = true; return; }
          if (c.absent) absent = true;
          pcts.push(c.outOf > 0 ? c.score / c.outOf * 100 : 0);
        });
        if (pcts.length) { cell[part] = ex_r1_(pcts.reduce(function (a, b) { return a + b; }, 0) / pcts.length * EX_WEIGHTS[part] / 100); cell.src[part] = 'exam'; if (absent) cell.flag[part] = 'absent'; }
        else if (waiting) cell.flag[part] = 'waiting';
      });
      const have = EX_PARTS.filter(function (k) { return cell[k] != null; });
      cell.ca = (cell.CA1 != null || cell.CA2 != null) ? ex_r1_((cell.CA1 || 0) + (cell.CA2 || 0)) : null;
      cell.total = have.length ? ex_r1_(have.reduce(function (a, k) { return a + cell[k]; }, 0)) : null;
      cell.complete = have.length === 3;
      cell.grade = cell.complete ? ex_grade_(Math.round(cell.total)) : '';
      cell.points = cell.complete ? EX_POINTS[cell.grade] : null;
      cell.units = ex_unitOf_(unitMap, sub);
      if (cell.complete) { sum += cell.total; nDone++; pts += cell.points * cell.units; uSum += cell.units; }
      cells[sid][sub] = cell;
    });
    const o = { subjects: subjectList.length, done: nDone, average: nDone ? ex_r1_(sum / nDone) : null, points: pts, units: uSum, gpa: uSum ? Math.round(pts / uSum * 100) / 100 : null };
    o.grade = nDone === subjectList.length && nDone > 0 ? ex_grade_(Math.round(o.average)) : '';
    cells[sid]._all = o;
  });
  const unitsOut = {}; subjectList.forEach(function (x) { unitsOut[x] = ex_unitOf_(unitMap, x); });
  return { subjects: subjectList, students: students, cells: cells, units: unitsOut };
}
function ex_tStudentsIn_(studs, e) { return studs.filter(function (r) { return matches_(e.Level, [key_(r.Level), key_(r.StudentID)]); }); }

/* A teacher types a CA (or paper exam) score for one student and subject. An empty score removes it, so the portal's own score is used again. */
function ex_tGscore_(me, p) {
  const term = ex_str_(p.term, 40), sub = ex_str_(p.subject, 60) || 'General', part = String(p.component || '');
  if (!term) ex_fail_('Choose the semester first.');
  if (EX_PARTS.indexOf(part) < 0) ex_fail_('Unknown score type.');
  const s = table_('Students').rows.filter(function (r) { return key_(r.StudentID) === key_(p.studentId) && tchOwns_(me, r); })[0];
  if (!s) ex_fail_('That student is not yours.');
  let score = '';
  if (p.score !== '' && p.score != null) {
    const n = Number(p.score), max = EX_WEIGHTS[part];
    if (!isFinite(n) || n < 0 || n > max) ex_fail_('The ' + (part === 'Exam' ? 'exam' : part) + ' score must be between 0 and ' + max + '.');
    score = Math.round(n * 2) / 2;
  }
  const t = ex_table_('Gradebook');
  const row = t.rows.filter(function (r) { return String(r.Term || '').trim() === term && key_(r.Subject || 'General') === key_(sub) && key_(r.StudentID) === key_(s.StudentID) && String(r.Component) === part; })[0];
  const when = ex_fmt_(ex_now_(), false), by = String(me.TeacherID).trim();
  if (row) { put_(t, row._row, 'Score', score); put_(t, row._row, 'EnteredBy', by, true); put_(t, row._row, 'Updated', when, true); }
  else if (score !== '') append_(t, { Term: term, Subject: sub, StudentID: String(s.StudentID).trim(), Component: part, Score: score, EnteredBy: by, Updated: when }, ['Term', 'Subject', 'StudentID', 'Component', 'EnteredBy', 'Updated']);
  return { ok: true };
}

/* The student's own term report: CA 1 /20, CA 2 /20, Exam /60 per subject. Only published exam scores and teacher-typed scores are shown. */
function ex_studentReport_(st, p) {
  const cur = schoolTerm_(), term = ex_str_(p.term, 40) || cur.Key, sid = String(st.StudentID).trim();
  const g = ex_gbCompute_(term, [st], true), cells = g.cells[sid] || {};
  const terms = {}; terms[cur.Key] = true;
  ex_table_('Exams').rows.forEach(function (e) { if (ex_kind_(e) && String(e.Term || '').trim() && ex_state_(e) === 'Published' && matches_(e.Level, [key_(st.Level), key_(sid)])) terms[String(e.Term).trim()] = true; });
  ex_table_('Gradebook').rows.forEach(function (r) { if (key_(r.StudentID) === key_(sid) && String(r.Term || '').trim() && r.Score !== '' && r.Score != null) terms[String(r.Term).trim()] = true; });
  const rows = g.subjects.map(function (sub) {
    const c = cells[sub];
    return { points: c.points, units: c.units, subject: sub, CA1: c.CA1, CA2: c.CA2, ca: c.ca, Exam: c.Exam, total: c.total, complete: c.complete, grade: c.grade, remark: c.grade ? EX_REMARK[c.grade] : '', absent: !!(c.flag.CA1 === 'absent' || c.flag.CA2 === 'absent' || c.flag.Exam === 'absent') };
  }).filter(function (r) { return r.total != null; });
  const all = cells._all || {};
  let cp = 0, cn = 0;                                  // CGPA: every finished subject of every term, each counting equally
  Object.keys(terms).forEach(function (tk) {
    const gg = tk === term ? g : ex_gbCompute_(tk, [st], true), a = (gg.cells[sid] || {})._all;
    if (a && a.units) { cp += a.points; cn += a.units; }
  });
  return { ok: true, gpa: all.gpa == null ? null : all.gpa, cgpa: cn ? Math.round(cp / cn * 100) / 100 : null, cgpaUnits: cn, units: rows.filter(function (r) { return r.complete; }).reduce(function (n, r) { return n + r.units; }, 0), maxPoints: 5, student: { name: String(st.Name || ''), id: sid, level: String(st.Level || '') }, termKey: term, term: cur, terms: Object.keys(terms).sort().reverse(), weights: EX_WEIGHTS,
    subjects: rows, average: all.average == null ? null : all.average, grade: all.grade || '', complete: rows.length > 0 && rows.every(function (r) { return r.complete; }) && all.grade !== '' };
}

/* An admin sets the credit units of a course (1 to EX_MAX_UNITS). The GPA and CGPA weigh each course by its units. */
function ex_tUnits_(me, p) {
  if (!tchAdmin_(me)) ex_fail_('Only an admin can set course units.');
  const sub = ex_str_(p.subject, 60);
  if (!sub) ex_fail_('Choose the course.');
  const u = Math.round(Number(p.units));
  if (!isFinite(u) || u < 1 || u > EX_MAX_UNITS) ex_fail_('Units must be a whole number from 1 to ' + EX_MAX_UNITS + '.');
  const t = ex_table_('SubjectUnits'), row = t.rows.filter(function (r) { return key_(r.Subject) === key_(sub); })[0];
  if (row) put_(t, row._row, 'Units', u); else append_(t, { Subject: sub, Units: u }, ['Subject']);
  return { ok: true };
}

/* The exam's teacher lets one student sit (or sit again) while the exam is still Live. */
function ex_tGrant_(me, p) {
  const e = ex_tExamFor_(me, p.examId);
  if (!ex_tCanEdit_(me, e)) ex_fail_('Only the teacher who made this exam can allow a resit.');
  if (ex_state_(e) !== 'Live') ex_fail_(ex_state_(e) === 'Published' ? 'Results are already published, so a resit can no longer be allowed.' : 'Make the exam live first.');
  const qs = ex_questions_(e.ExamID);
  if (!qs.length) ex_fail_('This exam has no written paper, so there is nothing to resit.');
  const s = ex_tStudents_(me, e).filter(function (r) { return key_(r.StudentID) === key_(p.studentId); })[0];
  if (!s) ex_fail_('That student is not yours.');
  const minutes = Math.round(ex_num_(p.minutes)) || Math.round(ex_num_(e.Minutes)), hours = Math.round(ex_num_(p.hours)) || 48;
  if (minutes < 5 || minutes > 300) ex_fail_('The time allowed must be between 5 and 300 minutes.');
  if (hours < 1 || hours > 168) ex_fail_('The student can be given between 1 and 168 hours to begin.');
  const sittings = ex_table_('ExamSittings'), sit = ex_sitting_(sittings, e.ExamID, s.StudentID), now = ex_now_(), by = String(me.TeacherID).trim();
  const until = ex_fmt_(now + hours * 3600000, true);
  if (sit && sit.Started) {
    if (!String(sit.Submitted || '').trim() && now <= ex_epoch_(String(sit.Deadline)) + EX_GRACE_SECONDS * 1000) ex_fail_('This student is still writing the exam.');
    put_(sittings, sit._row, 'Submitted', '', true);                                          // reopen: saved answers are kept
    put_(sittings, sit._row, 'Deadline', ex_fmt_(now + minutes * 60000, true), true);
    if (key_(sit.WrittenMarked) === 'TRUE') put_(sittings, sit._row, 'WrittenMarked', 'FALSE', true);   // written answers will be marked again
    put_(sittings, sit._row, 'GrantedBy', by, true);
    return { ok: true, mode: 'reopened', minutes: minutes };
  }
  if (sit) { put_(sittings, sit._row, 'GrantUntil', until, true); put_(sittings, sit._row, 'GrantMinutes', minutes); put_(sittings, sit._row, 'GrantedBy', by, true); }
  else append_(sittings, { ExamID: String(e.ExamID).trim(), StudentID: String(s.StudentID).trim(), Answers: '{}', GrantUntil: until, GrantMinutes: minutes, GrantedBy: by }, ['ExamID', 'StudentID', 'Answers', 'GrantUntil', 'GrantedBy']);
  return { ok: true, mode: 'granted', minutes: minutes, until: until };
}

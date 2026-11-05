/**
 * Madrasah exam portal (Exams.gs)
 *
 * Fixed-time exams for Madrasah students, set and marked by teachers. Add this as a NEW file next to Code.gs, then run
 * Himaayah > "Set up the exam portal" once. Pages: exams.html (students) and exam-teacher.html (teachers).
 *
 * Four tabs are created for you:
 *
 *   Exams          ExamID, Title, Subject, Level, Start, Minutes, PassMark, OralMarks, Instructions, Shuffle, State, CreatedBy, Created
 *   ExamQuestions  ExamID, QID, Type, Question, A, B, C, D, Correct, Marks, Explanation, ModelAnswer
 *   ExamSittings   ExamID, StudentID, Started, Deadline, Submitted, Answers, McqScore, WrittenScores, WrittenMarked, Comment, MarkedBy
 *   ExamOral       ExamID, StudentID, Slot, Score, Comment, MarkedBy
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
 * Grades (on the rounded percentage): A 90-100, B 79-89, C 60-78, D 50-59, E 49, F 0-48.
 */

const EX_TABS = {
  Exams: ['ExamID', 'Title', 'Subject', 'Level', 'Start', 'Minutes', 'PassMark', 'OralMarks', 'Instructions', 'Shuffle', 'State', 'CreatedBy', 'Created'],
  ExamQuestions: ['ExamID', 'QID', 'Type', 'Question', 'A', 'B', 'C', 'D', 'Correct', 'Marks', 'Explanation', 'ModelAnswer'],
  ExamSittings: ['ExamID', 'StudentID', 'Started', 'Deadline', 'Submitted', 'Answers', 'McqScore', 'WrittenScores', 'WrittenMarked', 'Comment', 'MarkedBy'],
  ExamOral: ['ExamID', 'StudentID', 'Slot', 'Score', 'Comment', 'MarkedBy']
};
const EX_LATE_MINUTES = 15;          // a student may still begin this long after the start time (their exam still ends on time)
const EX_GRACE_SECONDS = 45;         // answers are still accepted this long after the deadline (slow networks)
const EX_DEFAULT_PASS = 50;          // percent, used when an exam has no PassMark
const EX_BLOCK_OVERDUE = false;      // true = a student whose fees are overdue cannot start an exam
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
    else if (!hasQs) status = now < start ? 'upcoming' : 'oral';
    else if (now < start) status = 'upcoming';
    else if (now <= Math.min(end, start + EX_LATE_MINUTES * 60000)) status = 'open';
    else status = 'missed';
    const out = { ExamID: String(e.ExamID).trim(), Title: String(e.Title), Subject: String(e.Subject || 'General'), Start: iso_(e.Start, true), Minutes: ex_num_(e.Minutes),
      Instructions: String(e.Instructions || ''), Questions: qs.length, Marks: t.all, PassMark: ex_pass_(e), HasOral: t.oral > 0, OralMarks: t.oral,
      OralSlot: or ? String(or.Slot || '') : '', Status: status,
      StartsInSec: Math.max(0, Math.round((start - now) / 1000)), RemainingSec: sit && sit.Started && status === 'inprogress' ? Math.max(0, Math.round((ex_epoch_(String(sit.Deadline)) - now) / 1000)) : 0,
      LateSec: Math.max(0, Math.round((Math.min(end, start + EX_LATE_MINUTES * 60000) - now) / 1000)) };
    if (status === 'published') {
      const c = ex_compute_(e, qs, sit, or);
      out.Result = c.complete ? { percent: c.percent, grade: c.grade, remark: EX_REMARK[c.grade], passed: c.passed, score: c.score, outOf: c.outOf, absent: c.absent } : { pending: true };
    }
    return out;
  });
  exams.sort(function (x, y) { return x.Start < y.Start ? 1 : -1; });
  const done = exams.filter(function (x) { return x.Result && !x.Result.pending && !x.Result.absent; });
  const avg = done.length ? Math.round(done.reduce(function (s, x) { return s + x.Result.percent; }, 0) / done.length) : null;
  return { ok: true, student: { name: st.Name, level: st.Level }, exams: exams, average: avg, averageGrade: avg == null ? '' : ex_grade_(avg),
    blocked: EX_BLOCK_OVERDUE && payStatus_(st) === 'Overdue' };
}

function ex_studentExam_(st, examId) {
  const e = ex_visibleExams_(st).filter(function (x) { return key_(x.ExamID) === key_(examId); })[0];
  if (!e) ex_fail_('That exam is not available.');
  return e;
}

function ex_studentStart_(st, p) {
  const e = ex_studentExam_(st, p.examId);
  if (ex_state_(e) !== 'Live') ex_fail_('This exam is closed.');
  if (EX_BLOCK_OVERDUE && payStatus_(st) === 'Overdue') ex_fail_('Please pay your fees before you sit exams.');
  const qs = ex_questions_(e.ExamID);
  if (!qs.length) ex_fail_('This exam has no written paper. Your teacher will tell you about the oral part.');
  const sittings = ex_table_('ExamSittings'), sid = String(st.StudentID).trim();
  let sit = ex_sitting_(sittings, e.ExamID, sid);
  const now = ex_now_(), start = ex_start_(e), end = ex_end_(e);
  if (sit && String(sit.Submitted || '').trim()) ex_fail_('You have already submitted this exam.');
  if (!sit) {
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
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      if (op === 'save') return ex_tSave_(me, p);
      if (op === 'state') return ex_tState_(me, p);
      if (op === 'delete') return ex_tDelete_(me, p);
      if (op === 'mark') return ex_tMark_(me, p);
      if (op === 'oral') return ex_tOral_(me, p);
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
      State: ex_state_(e), Questions: qs.length, Marks: t.all, OralMarks: t.oral, Students: studs.length, Sat: sat, ToMark: toMark, OralLeft: oralLeft,
      CanEdit: ex_tCanEdit_(me, e), Ended: !isNaN(start) && now > ex_end_(e) + EX_GRACE_SECONDS * 1000, Started: !isNaN(start) && now >= start, CreatedBy: String(e.CreatedBy || '') });
  });
  out.sort(function (x, y) { return x.Start < y.Start ? 1 : -1; });
  return { ok: true, teacher: { name: me.Name, admin: tchAdmin_(me) }, exams: out, levels: Object.keys(levels).sort(), now: ex_fmt_(now, false), bands: [['A', '90-100'], ['B', '79-89'], ['C', '60-78'], ['D', '50-59'], ['E', '49'], ['F', '0-48']] };
}

function ex_tExam_(me, p) {            // the full exam, for the editor (teachers only; includes the answer key)
  const e = ex_tExamFor_(me, p.examId);
  if (!ex_tCanEdit_(me, e)) ex_fail_('Only the teacher who made this exam can open it for editing.');
  const qs = ex_table_('ExamQuestions').rows.filter(function (q) { return key_(q.ExamID) === key_(e.ExamID) && String(q.Question || '').trim(); });
  const locked = ex_table_('ExamSittings').rows.some(function (r) { return key_(r.ExamID) === key_(e.ExamID); }) ||
    ex_table_('ExamOral').rows.some(function (r) { return key_(r.ExamID) === key_(e.ExamID) && String(r.Score == null ? '' : r.Score) !== ''; });
  return { ok: true, locked: locked, exam: { ExamID: String(e.ExamID).trim(), Title: String(e.Title), Subject: String(e.Subject || ''), Level: String(e.Level || ''), Start: iso_(e.Start, true),
    Minutes: ex_num_(e.Minutes), PassMark: ex_pass_(e), OralMarks: Math.round(ex_num_(e.OralMarks)), Instructions: String(e.Instructions || ''), Shuffle: String(e.Shuffle).toUpperCase() !== 'FALSE', State: ex_state_(e) },
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
    put_(t, e._row, 'Instructions', ex_str_(d.Instructions, 1500), true);
    if (!locked) {
      put_(t, e._row, 'Level', level, true); put_(t, e._row, 'Start', start, true); put_(t, e._row, 'Minutes', minutes);
      put_(t, e._row, 'OralMarks', oralMarks); put_(t, e._row, 'Shuffle', d.Shuffle === false ? 'FALSE' : 'TRUE');
    }
  } else {
    let n = 0;
    t.rows.forEach(function (r) { const m = /^EX-(\d+)$/.exec(String(r.ExamID).trim().toUpperCase()); if (m) n = Math.max(n, Number(m[1])); });
    examId = 'EX-' + ('000' + (n + 1)).slice(-3);
    append_(t, { ExamID: examId, Title: title, Subject: subject, Level: level, Start: start, Minutes: minutes, PassMark: pass, OralMarks: oralMarks,
      Instructions: ex_str_(d.Instructions, 1500), Shuffle: d.Shuffle === false ? 'FALSE' : 'TRUE', State: 'Draft', CreatedBy: String(me.TeacherID).trim(), Created: ex_fmt_(ex_now_(), false) },
      ['ExamID', 'Title', 'Subject', 'Level', 'Start', 'Instructions', 'CreatedBy', 'Created']);
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
    const status = c.submitted ? (t.written > 0 && key_(sit.WrittenMarked) !== 'TRUE' ? 'To mark' : 'Marked') : sit && sit.Started ? 'Writing' : qs.length ? (ex_now_() > ex_end_(e) ? 'Absent' : 'Not yet') : 'Oral only';
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

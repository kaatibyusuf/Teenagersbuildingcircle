/**
 * Student quizzes (quiz.html)
 *
 * Three tabs, created the first time the quiz page is used (or run setupQuizzes once):
 *
 *   Quizzes        QuizID, Title, Subject, Level, Description, PassMark, Active
 *   QuizQuestions  QuizID, QuestionID, Question, A, B, C, D, Correct, Explanation
 *   QuizAttempts   StudentID, QuizID, Date, Score, OutOf, Percent, Passed   (written by the script; teachers read it)
 *
 * Level is All (or empty) for every student, or a level name such as Rawdah. Separate several with commas.
 * PassMark is a percentage and defaults to 70. Leave Active empty or TRUE to show a quiz, FALSE to hide it.
 * In QuizQuestions, give each question a short QuestionID (1, 2, 3 ... unique inside its quiz). Leave C and D empty for a
 * two-option question. Correct is the letter A, B, C or D. Explanation is shown after the student submits.
 *
 * The correct answers never leave the script until the student submits. A student's best result per quiz is kept, and at most
 * QZ_SAVED_PER_DAY attempts per quiz per day are saved (extra tries still show a score but are not recorded).
 */

const QZ_QUIZZES = 'Quizzes';
const QZ_QUESTIONS = 'QuizQuestions';
const QZ_ATTEMPTS = 'QuizAttempts';
const QZ_HEAD = {
  Quizzes: ['QuizID', 'Title', 'Subject', 'Level', 'Description', 'PassMark', 'Active'],
  QuizQuestions: ['QuizID', 'QuestionID', 'Question', 'A', 'B', 'C', 'D', 'Correct', 'Explanation'],
  QuizAttempts: ['StudentID', 'QuizID', 'Date', 'Score', 'OutOf', 'Percent', 'Passed']
};
const QZ_SAVED_PER_DAY = 3;
const QZ_DEFAULT_PASS = 70;

function setupQuizzes() {
  Object.keys(QZ_HEAD).forEach(qz_table_);
  try { ss_().toast('The quiz tabs are ready.', SCHOOL_NAME); } catch (e) {}
}
function qz_table_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, QZ_HEAD[name].length).setValues([QZ_HEAD[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return table_(name);
}
function qz_pass_(q) { const n = Number(q.PassMark); return n > 0 && n <= 100 ? n : QZ_DEFAULT_PASS; }
function qz_qid_(r) { return String(r.QuestionID === '' || r.QuestionID == null ? 'R' + r._row : r.QuestionID).trim(); }
function qz_options_(r) {
  return ['A', 'B', 'C', 'D'].filter(function (k) { return String(r[k] == null ? '' : r[k]).trim() !== ''; })
    .map(function (k) { return { k: k, t: String(r[k]).trim() }; });
}
function qz_questions_(quizId) {
  const id = key_(quizId);
  return qz_table_(QZ_QUESTIONS).rows.filter(function (r) { return key_(r.QuizID) === id && String(r.Question || '').trim() && qz_options_(r).length >= 2; });
}
function qz_quizFor_(st, quizId) {
  const lvl = key_(st.Level), id = key_(quizId);
  return qz_table_(QZ_QUIZZES).rows.filter(function (r) { return key_(r.QuizID) === id && r.Title && key_(r.Active) !== 'FALSE' && matches_(r.Level, [lvl]); })[0];
}

function quizRequest(p) {
  const a = auth_(p.id, p.code);
  if (a.error) return { ok: false, error: a.error };
  const st = a.st;
  if (p.op === 'start') return qz_start_(st, p);
  if (p.op === 'submit') return qz_submit_(st, p);
  return qz_list_(st);
}

function qz_list_(st) {
  const lvl = key_(st.Level), sid = key_(st.StudentID);
  const attempts = qz_table_(QZ_ATTEMPTS).rows.filter(function (r) { return key_(r.StudentID) === sid; });
  const counts = {};
  qz_table_(QZ_QUESTIONS).rows.forEach(function (r) { if (String(r.Question || '').trim() && qz_options_(r).length >= 2) { const k = key_(r.QuizID); counts[k] = (counts[k] || 0) + 1; } });
  const quizzes = qz_table_(QZ_QUIZZES).rows.filter(function (r) {
    return r.QuizID && r.Title && key_(r.Active) !== 'FALSE' && matches_(r.Level, [lvl]) && counts[key_(r.QuizID)];
  }).map(function (r) {
    const mine = attempts.filter(function (x) { return key_(x.QuizID) === key_(r.QuizID); });
    let best = null;
    mine.forEach(function (x) { const pc = Number(x.Percent) || 0; if (!best || pc > best.percent) best = { score: Number(x.Score) || 0, outOf: Number(x.OutOf) || 0, percent: pc }; });
    return { QuizID: String(r.QuizID).trim(), Title: String(r.Title), Subject: String(r.Subject || 'General'), Description: String(r.Description || ''),
      Questions: counts[key_(r.QuizID)], PassMark: qz_pass_(r), Attempts: mine.length, Best: best };
  });
  return { ok: true, student: { name: st.Name, level: st.Level }, quizzes: quizzes };
}

function qz_start_(st, p) {
  const q = qz_quizFor_(st, p.quizId);
  if (!q) return { ok: false, error: 'That quiz is not available.' };
  const qs = qz_questions_(q.QuizID);
  if (!qs.length) return { ok: false, error: 'That quiz has no questions yet.' };
  return { ok: true, quiz: { QuizID: String(q.QuizID).trim(), Title: String(q.Title), PassMark: qz_pass_(q) },
    questions: qs.map(function (r) { return { id: qz_qid_(r), question: String(r.Question).trim(), options: qz_options_(r) }; }) };
}

function qz_submit_(st, p) {
  const q = qz_quizFor_(st, p.quizId);
  if (!q) return { ok: false, error: 'That quiz is not available.' };
  const qs = qz_questions_(q.QuizID);
  if (!qs.length) return { ok: false, error: 'That quiz has no questions yet.' };
  const answers = (p.answers && typeof p.answers === 'object') ? p.answers : {};
  let score = 0;
  const review = qs.map(function (r) {
    const id = qz_qid_(r), correct = key_(r.Correct), yours = key_(answers[id]).slice(0, 1);
    const ok = yours !== '' && yours === correct;
    if (ok) score++;
    return { id: id, question: String(r.Question).trim(), options: qz_options_(r), yours: yours, correct: correct, ok: ok, explanation: String(r.Explanation || '') };
  });
  const outOf = qs.length, percent = Math.round(score / outOf * 100), passMark = qz_pass_(q), passed = percent >= passMark;
  let saved = false;
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const t = qz_table_(QZ_ATTEMPTS), sid = key_(st.StudentID), qid = key_(q.QuizID), today = today_();
    const todays = t.rows.filter(function (r) { return key_(r.StudentID) === sid && key_(r.QuizID) === qid && iso_(r.Date) === today; }).length;
    if (todays < QZ_SAVED_PER_DAY) {
      append_(t, { StudentID: String(st.StudentID).trim(), QuizID: String(q.QuizID).trim(), Date: today, Score: score, OutOf: outOf, Percent: percent, Passed: passed }, ['QuizID']);
      saved = true;
    }
  } finally { lock.releaseLock(); }
  return { ok: true, score: score, outOf: outOf, percent: percent, passed: passed, passMark: passMark, saved: saved, review: review };
}

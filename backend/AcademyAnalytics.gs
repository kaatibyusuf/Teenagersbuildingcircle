/**
 * AcademyAnalytics.gs - how each Sunday mock went, question by question (admin portal, "Mock analytics" tab).
 *
 * WHAT IT SHOWS
 *  - For the chosen Sunday: how many students sat each subject combination and their average score out of 400.
 *  - Each subject's average (percent of questions answered correctly).
 *  - Every question: how many students saw it, the percent who got it right, and how many chose each option.
 *  - Flags, so a teacher knows which questions to look at first:
 *      "Check the key"  more students chose one wrong option than the keyed answer (the key may be wrong, or the question unclear).
 *      "Very hard"      15% or fewer got it right.
 *      "Too easy"       95% or more got it right (needs 10 or more students).
 *
 * The English questions are the same in all four combinations, so their results are added together across the combinations.
 * A flag needs at least ACM_AN_MIN students, so one or two answers never raise an alarm.
 * Read-only: it never changes any sheet. Needs Academy.gs (the acda_analytics route) and AcademyMocks.gs.
 */
const ACM_AN_MIN = 5;            // fewest students before a question can be flagged
const ACM_AN_EASY_MIN = 10;      // fewest students before "Too easy" is shown
const ACM_AN_MAX_Q = 400;        // most questions sent to the page

function acm_anSeries_() {   // [{ series, date, sat }] newest first, for every Sunday mock that has been built
  const tests = acd_t_(ACD.Tests).rows.filter(function (r) { return String(r.Series || ''); });
  const ids = {};
  tests.forEach(function (t) { ids[String(t.TestID)] = String(t.Series); });
  const sat = {};
  acd_t_(ACD.Attempts).rows.forEach(function (a) { if (a.Submitted && ids[String(a.TestID)]) { const s = ids[String(a.TestID)]; sat[s] = (sat[s] || 0) + 1; } });
  const seen = {}, out = [];
  tests.forEach(function (t) { const s = String(t.Series); if (!seen[s]) { seen[s] = 1; out.push({ series: s, date: s.replace('MOCK-', ''), sat: sat[s] || 0 }); } });
  return out.sort(function (a, b) { return a.series < b.series ? 1 : -1; });
}

function acm_analytics_(series) {
  const list = acm_anSeries_();
  if (!list.length) return { ok: true, analytics: { seriesList: [], series: '', empty: 'No Sunday mock has been built yet.' } };
  let chosen = list.filter(function (s) { return s.series === String(series || ''); })[0];
  if (!chosen) chosen = list.filter(function (s) { return s.sat > 0; })[0] || list[0];

  const tests = acd_t_(ACD.Tests).rows.filter(function (t) { return String(t.Series) === chosen.series; });
  const tById = {}; tests.forEach(function (t) { tById[String(t.TestID)] = t; });
  const qByTest = {};
  acd_t_(ACD.Questions).rows.forEach(function (q) { const id = String(q.TestID); if (tById[id]) (qByTest[id] = qByTest[id] || []).push(q); });
  const attempts = acd_t_(ACD.Attempts).rows.filter(function (a) { return a.Submitted && tById[String(a.TestID)]; });

  const Qs = {}, order = [];            // one entry per distinct question across the combinations
  const subj = {};                      // subject -> { n, correct }
  const combos = {};                    // combo -> { sat, sum }
  const students = {};
  attempts.forEach(function (a) {
    const t = tById[String(a.TestID)], qs = qByTest[String(a.TestID)] || [];
    let ans = {}; try { ans = JSON.parse(String(a.Answers || '{}')) || {}; } catch (e) { ans = {}; }
    students[key_(a.StudentID)] = 1;
    const cb = String(t.Combo || t.Title || 'Mock'); combos[cb] = combos[cb] || { sat: 0, sum: 0 };
    combos[cb].sat++; combos[cb].sum += Number(a.Score) || 0;
    qs.forEach(function (q) {
      // a question is its wording AND its options: some English stems are generic ("Choose the word nearest in meaning") and repeat with different options
      const opts = ['A', 'B', 'C', 'D'].map(function (L) { return String(q[L] || ''); }).filter(Boolean).sort().join('\u241f');
      const k = String(q.Subj || '') + '|' + String(q.Question) + '|' + opts + '|' + String(q[String(q.Answer || '').trim().toUpperCase()] || '');
      if (!Qs[k]) {
        const right = String(q[String(q.Answer || '').trim().toUpperCase()] || '');
        Qs[k] = { subject: String(q.Subj || ''), full: String(q.Question), right: right, n: 0, correct: 0, blank: 0, opt: {}, texts: ['A', 'B', 'C', 'D'].map(function (L) { return String(q[L] || ''); }).filter(Boolean) };
        order.push(k);
      }
      const e = Qs[k], pick = String(ans[String(Number(q.No))] || '').toUpperCase();
      e.n++;
      if (!/^[A-E]$/.test(pick)) e.blank++;
      else {
        const text = String(q[pick] || pick);
        e.opt[text] = (e.opt[text] || 0) + 1;
        if (pick === String(q.Answer || '').trim().toUpperCase()) e.correct++;
      }
      const sj = e.subject; subj[sj] = subj[sj] || { n: 0, correct: 0 }; subj[sj].n++; if (pick === String(q.Answer || '').trim().toUpperCase()) subj[sj].correct++;
    });
  });

  const rank = { 'Check the key': 0, 'Very hard': 1, 'Too easy': 2, '': 3 };
  const questions = order.map(function (k) {
    const e = Qs[k], parts = e.full.split('\n\n'), stem = parts[parts.length - 1];
    const options = e.texts.map(function (tx) { return { text: tx, n: e.opt[tx] || 0, pct: e.n ? Math.round(1000 * (e.opt[tx] || 0) / e.n) / 10 : 0, key: tx === e.right }; });
    const topWrong = options.filter(function (o) { return !o.key; }).reduce(function (m, o) { return Math.max(m, o.n); }, 0);
    const p = e.n ? e.correct / e.n : 0;
    let flag = '', why = '';
    if (e.n >= ACM_AN_MIN) {
      if (topWrong > e.correct && topWrong / e.n >= 0.4) { flag = 'Check the key'; why = 'More students chose one wrong option than the keyed answer. The key may be wrong, or the question may be unclear.'; }
      else if (p <= 0.15) { flag = 'Very hard'; why = 'Only ' + Math.round(100 * p) + '% got it right.'; }
      else if (e.n >= ACM_AN_EASY_MIN && p >= 0.95) { flag = 'Too easy'; why = Math.round(100 * p) + '% got it right.'; }
    }
    return { subject: e.subject, question: stem.slice(0, 220), passage: parts.length > 1, n: e.n, correct: e.correct, pct: e.n ? Math.round(1000 * p) / 10 : null,
      blankPct: e.n ? Math.round(1000 * e.blank / e.n) / 10 : null, options: options, flag: flag, why: why };
  }).sort(function (a, b) { return (rank[a.flag] - rank[b.flag]) || ((a.pct == null ? 101 : a.pct) - (b.pct == null ? 101 : b.pct)); }).slice(0, ACM_AN_MAX_Q);

  return { ok: true, analytics: {
    seriesList: list, series: chosen.series, date: chosen.date, sat: Object.keys(students).length, attempts: attempts.length,
    closed: tests.length ? (iso_(tests[0].Closes, true) < acd_now_()) : false,
    minStudents: ACM_AN_MIN,
    combos: Object.keys(combos).sort().map(function (c) { return { combo: c, sat: combos[c].sat, avg: combos[c].sat ? Math.round(10 * combos[c].sum / combos[c].sat) / 10 : null }; }),
    subjects: Object.keys(subj).sort().map(function (s) { return { subject: s, answers: subj[s].n, pct: subj[s].n ? Math.round(1000 * subj[s].correct / subj[s].n) / 10 : null }; }),
    flagged: questions.filter(function (q) { return q.flag; }).length,
    questions: questions
  } };
}

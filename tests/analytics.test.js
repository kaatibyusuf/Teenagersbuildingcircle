'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { createEnv, BACKEND } = require('./helpers/gas');

const SUNDAY = '2026-11-15';
function setup() {
  const env = createEnv();
  fs.readdirSync(BACKEND).filter(function (f) { return /^AcademyMockBankPack\d+\.gs$/.test(f); }).forEach(function (f) { env.call('academyMockSeedPack' + parseInt(f.match(/\d+/)[0], 10)); });
  env.call('academyMockWeekly', SUNDAY);
  env.call('acd_t_', 'AcademyAttempts');
  return env;
}
function tab(env, name) {
  const d = env.sheets[name].data, head = d[0];
  return d.slice(1).filter(function (r) { return r.some(Boolean); }).map(function (r) { const o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o; });
}
// one student sitting a test. pick(q) returns the letter to choose ('' = left blank)
function sit(env, testId, student, pick, opts) {
  opts = opts || {};
  const qs = tab(env, 'AcademyQuestions').filter(function (q) { return q.TestID === testId; });
  const answers = {}; qs.forEach(function (q) { const l = pick(q); if (l) answers[String(q.No)] = l; });
  const sh = env.sheets['AcademyAttempts'], head = sh.data[0], row = head.map(function () { return ''; });
  const set = function (k, v) { row[head.indexOf(k)] = v; };
  set('AttemptID', 'AT' + (sh.data.length)); set('TestID', testId); set('StudentID', student);
  set('Started', SUNDAY + 'T10:00'); if (!opts.open) set('Submitted', SUNDAY + 'T12:00');
  set('Score', opts.score == null ? 200 : opts.score); set('OutOf', 400); set('Answers', JSON.stringify(answers));
  sh.data.push(row);
}
function testIdFor(env, combo) { return tab(env, 'AcademyTests').filter(function (t) { return t.Combo === combo; })[0].TestID; }
const wrongLetter = function (q) { return ['A', 'B', 'C', 'D'].filter(function (l) { return l !== q.Answer; })[0]; };
const find = function (a, subject, no, env) { return a.questions.filter(function (x) { return x.subject === subject; }); };

test('before any mock exists, analytics reports that nothing is there', () => {
  const env = createEnv();
  const r = env.call('acm_analytics_', '');
  assert.equal(r.ok, true); assert.deepEqual(r.analytics.seriesList, []); assert.match(r.analytics.empty, /No Sunday mock/);
});

test('a mock with nobody sitting it returns empty, unflagged results', () => {
  const env = setup();
  const a = env.call('acm_analytics_', SUNDAY).analytics;
  assert.equal(a.series, 'MOCK-' + SUNDAY); assert.equal(a.sat, 0); assert.equal(a.flagged, 0); assert.equal(a.questions.length, 0);
  assert.equal(a.seriesList.length, 1); assert.equal(a.seriesList[0].sat, 0);
});

test('English results from different combinations are added together', () => {
  const env = setup();
  const sci = testIdFor(env, 'Sciences and Medicine'), eng = testIdFor(env, 'Engineering and Technology');
  for (let i = 0; i < 12; i++) sit(env, sci, 'AC-' + (100 + i), function (q) { return q.Answer; });
  for (let i = 0; i < 6; i++) sit(env, eng, 'AC-' + (200 + i), function (q) { return q.Answer; });
  const a = env.call('acm_analytics_', 'MOCK-' + SUNDAY).analytics;
  const english = a.questions.filter(function (q) { return q.subject === 'English'; });
  assert.equal(english.length, 60);
  english.forEach(function (q) { assert.equal(q.n, 18); assert.equal(q.pct, 100); });
  assert.equal(a.sat, 18);
  const physics = a.questions.filter(function (q) { return q.subject === 'Physics'; });
  assert.equal(physics.length, 40); physics.forEach(function (q) { assert.equal(q.n, 18); });   // Physics is in both combinations
  const biology = a.questions.filter(function (q) { return q.subject === 'Biology'; });
  biology.forEach(function (q) { assert.equal(q.n, 12); });                                      // Biology only in Sciences
});

test('a question nearly everyone gets right is flagged "Too easy"', () => {
  const env = setup(), sci = testIdFor(env, 'Sciences and Medicine');
  for (let i = 0; i < 12; i++) sit(env, sci, 'AC-' + (100 + i), function (q) { return q.Answer; });
  const a = env.call('acm_analytics_', SUNDAY).analytics;
  assert.ok(a.questions.every(function (q) { return q.flag === 'Too easy'; }));
  assert.equal(a.flagged, a.questions.length);
});

test('a wrong option chosen more than the keyed answer is flagged "Check the key"', () => {
  const env = setup(), sci = testIdFor(env, 'Sciences and Medicine');
  const target = tab(env, 'AcademyQuestions').filter(function (q) { return q.TestID === sci && Number(q.No) === 2; })[0];
  for (let i = 0; i < 10; i++) sit(env, sci, 'AC-' + (100 + i), function (q) {
    if (q.TestID === sci && Number(q.No) === 2) return i < 8 ? wrongLetter(q) : q.Answer;   // 8 of 10 choose the same wrong option
    return q.Answer;
  });
  const a = env.call('acm_analytics_', SUNDAY).analytics;
  const stem = String(target.Question).split('\n\n').pop().slice(0, 220);
  const row = a.questions.filter(function (q) { return q.question === stem; })[0];
  assert.equal(row.flag, 'Check the key'); assert.equal(row.n, 10); assert.equal(row.correct, 2); assert.equal(row.pct, 20);
  assert.equal(a.questions[0].flag, 'Check the key');            // flagged questions come first
  const wrong = row.options.filter(function (o) { return !o.key; }).sort(function (x, y) { return y.n - x.n; })[0];
  assert.equal(wrong.n, 8); assert.equal(wrong.pct, 80);
  assert.equal(row.options.filter(function (o) { return o.key; }).length, 1);
});

test('a question almost nobody gets right (with answers spread out) is "Very hard"', () => {
  const env = setup(), sci = testIdFor(env, 'Sciences and Medicine'), letters = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < 10; i++) sit(env, sci, 'AC-' + (100 + i), function (q) {
    if (Number(q.No) !== 3) return q.Answer;
    if (i === 0) return q.Answer;                                                          // 1 of 10 right
    const wrongs = letters.filter(function (l) { return l !== q.Answer; });
    return wrongs[i % 3];                                                                  // the rest split across the 3 wrong options
  });
  const a = env.call('acm_analytics_', SUNDAY).analytics;
  const hard = a.questions.filter(function (q) { return q.flag === 'Very hard'; });
  assert.equal(hard.length, 1); assert.equal(hard[0].pct, 10);
});

test('two different questions that share the same wording are not merged', () => {
  const env = setup(), sci = testIdFor(env, 'Sciences and Medicine');
  // give English question 2 the same stem as English question 1, but keep its own options (as happens with generic stems in a real bank)
  const Q = env.sheets['AcademyQuestions'], head = Q.data[0];
  const rows = Q.data.filter(function (r, i) { return i > 0 && r[head.indexOf('TestID')] === sci && r[head.indexOf('Subj')] === 'English'; });
  rows[1][head.indexOf('Question')] = rows[0][head.indexOf('Question')];
  for (let i = 0; i < 6; i++) sit(env, sci, 'AC-' + (100 + i), function (q) { return q.Answer; });
  const a = env.call('acm_analytics_', 'MOCK-' + SUNDAY).analytics;
  const english = a.questions.filter(function (q) { return q.subject === 'English'; });
  assert.equal(english.length, 60);
  english.forEach(function (q) { assert.equal(q.n, 6); });
});

test('with fewer students than the minimum, nothing is flagged', () => {
  const env = setup(), sci = testIdFor(env, 'Sciences and Medicine');
  for (let i = 0; i < 3; i++) sit(env, sci, 'AC-' + (100 + i), function (q) { return wrongLetter(q); });
  const a = env.call('acm_analytics_', SUNDAY).analytics;
  assert.equal(a.flagged, 0); assert.ok(a.questions.length > 0);
  a.questions.forEach(function (q) { assert.equal(q.flag, ''); assert.equal(q.pct, 0); });
});

test('unsubmitted attempts are ignored, and blanks are counted separately', () => {
  const env = setup(), sci = testIdFor(env, 'Sciences and Medicine');
  for (let i = 0; i < 6; i++) sit(env, sci, 'AC-' + (100 + i), function (q) { return Number(q.No) === 1 ? '' : q.Answer; });
  sit(env, sci, 'AC-999', function (q) { return q.Answer; }, { open: true });             // still sitting: no Submitted time
  const a = env.call('acm_analytics_', SUNDAY).analytics;
  assert.equal(a.sat, 6); assert.equal(a.attempts, 6);
  const first = a.questions.filter(function (q) { return q.blankPct === 100; });
  assert.equal(first.length, 1); assert.equal(first[0].n, 6); assert.equal(first[0].correct, 0);
});

test('subject averages and combination averages are right', () => {
  const env = setup(), sci = testIdFor(env, 'Sciences and Medicine');
  for (let i = 0; i < 5; i++) sit(env, sci, 'AC-' + (100 + i), function (q) { return q.Subj === 'Physics' ? q.Answer : wrongLetter(q); }, { score: 100 + i * 10 });
  const a = env.call('acm_analytics_', SUNDAY).analytics;
  const by = {}; a.subjects.forEach(function (s) { by[s.subject] = s.pct; });
  assert.equal(by.Physics, 100); assert.equal(by.English, 0); assert.equal(by.Biology, 0);
  assert.equal(a.combos.length, 1); assert.equal(a.combos[0].combo, 'Sciences and Medicine'); assert.equal(a.combos[0].sat, 5); assert.equal(a.combos[0].avg, 120);
});

test('picking another series returns that series, and an unknown series falls back safely', () => {
  const env = setup();
  env.call('academyMockWeekly', '2026-11-22');
  const sci = testIdFor(env, 'Sciences and Medicine');
  sit(env, sci, 'AC-100', function (q) { return q.Answer; });
  assert.equal(env.call('acm_analytics_', 'MOCK-2026-11-22').analytics.series, 'MOCK-2026-11-22');
  assert.equal(env.call('acm_analytics_', 'nonsense').analytics.series, 'MOCK-' + SUNDAY);   // newest series that anyone sat
  const list = env.call('acm_analytics_', '').analytics.seriesList;
  assert.equal(list[0].series, 'MOCK-2026-11-22'); assert.equal(list[1].sat, 1);
});

test('analytics never changes any sheet', () => {
  const env = setup(), sci = testIdFor(env, 'Sciences and Medicine');
  for (let i = 0; i < 6; i++) sit(env, sci, 'AC-' + (100 + i), function (q) { return q.Answer; });
  const before = JSON.stringify(Object.keys(env.sheets).map(function (k) { return env.sheets[k].data; }));
  env.call('acm_analytics_', SUNDAY);
  assert.equal(JSON.stringify(Object.keys(env.sheets).map(function (k) { return env.sheets[k].data; })), before);
});

test('the admin route rejects someone who is not signed in', () => {
  const env = setup();
  const r = env.call('academyFromRequest', { action: 'acda_analytics', id: 'AD-1', code: 'nope' });
  assert.equal(r.ok, false);
  assert.equal(r.analytics, undefined);
});

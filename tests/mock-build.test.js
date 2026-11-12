'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { createEnv, BACKEND } = require('./helpers/gas');

function freshEnv() {
  const env = createEnv();
  const seeds = fs.readdirSync(BACKEND).filter(function (f) { return /^AcademyMockBankPack\d+\.gs$/.test(f); }).map(function (f) { return parseInt(f.match(/\d+/)[0], 10); }).sort(function (a, b) { return a - b; });
  const added = seeds.map(function (n) { return env.call('academyMockSeedPack' + n); });
  return { env: env, added: added };
}
function tab(env, name) {
  const d = env.sheets[name].data, head = d[0];
  return d.slice(1).filter(function (r) { return r.some(Boolean); }).map(function (r) { const o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o; });
}

test('seeding loads every pack once, and re-running adds nothing', () => {
  const s = freshEnv();
  s.added.forEach(function (n) { assert.ok(n > 0); });
  const total = tab(s.env, 'AcademyMockBank').length;
  assert.equal(total, s.added.reduce(function (a, b) { return a + b; }, 0));
  const again = s.env.call('academyMockSeedPack1');
  assert.equal(again, 0);
  assert.equal(tab(s.env, 'AcademyMockBank').length, total);
});

test('bank ids are unique', () => {
  const s = freshEnv();
  const ids = tab(s.env, 'AcademyMockBank').map(function (r) { return r.BankID; });
  assert.equal(new Set(ids).size, ids.length);
});

test("building a Sunday creates four tests of 180 questions: English 60, others 40", () => {
  const s = freshEnv();
  const r = s.env.call('academyMockWeekly', '2026-11-15');
  assert.equal(r.ok, true);
  const tests = tab(s.env, 'AcademyTests').filter(function (t) { return t.Series === 'MOCK-2026-11-15'; });
  assert.equal(tests.length, 4);
  const qs = tab(s.env, 'AcademyQuestions');
  tests.forEach(function (t) {
    assert.equal(t.Audience, 'UTME'); assert.equal(Number(t.Minutes), 120); assert.equal(t.Kind, 'Sunday mock');
    assert.equal(t.Opens, '2026-11-15T09:00'); assert.equal(t.Closes, '2026-11-15T21:00');
    const mine = qs.filter(function (q) { return q.TestID === t.TestID; });
    assert.equal(mine.length, 180);
    const bySub = {}; mine.forEach(function (q) { bySub[q.Subj] = (bySub[q.Subj] || 0) + 1; });
    assert.equal(bySub.English, 60);
    Object.keys(bySub).filter(function (k) { return k !== 'English'; }).forEach(function (k) { assert.equal(bySub[k], 40, k); });
    assert.equal(Object.keys(bySub).length, 4);
  });
});

test('combinations use the right subjects (and Commercial is not offered)', () => {
  const s = freshEnv(); s.env.call('academyMockWeekly', '2026-11-15');
  const tests = tab(s.env, 'AcademyTests'), qs = tab(s.env, 'AcademyQuestions');
  const want = { 'Sciences and Medicine': ['Biology', 'Chemistry', 'English', 'Physics'], 'Engineering and Technology': ['Chemistry', 'English', 'Mathematics', 'Physics'],
    'Arts, Law and Humanities': ['English', 'Government', 'Islamic Studies', 'Literature'], 'Social Sciences and Management': ['Economics', 'English', 'Government', 'Mathematics'] };
  assert.deepEqual(tests.map(function (t) { return t.Combo; }).sort(), Object.keys(want).sort());
  tests.forEach(function (t) {
    const subs = Array.from(new Set(qs.filter(function (q) { return q.TestID === t.TestID; }).map(function (q) { return q.Subj; }))).sort();
    assert.deepEqual(subs, want[t.Combo], t.Combo);
  });
});

test('every built question has four distinct options and an answer letter that points at the right text', () => {
  const s = freshEnv(); s.env.call('academyMockWeekly', '2026-11-15');
  const bank = tab(s.env, 'AcademyMockBank'), qs = tab(s.env, 'AcademyQuestions');
  qs.forEach(function (q) {
    const opts = [q.A, q.B, q.C, q.D];
    assert.equal(new Set(opts).size, 4, 'options repeat in: ' + q.Question);
    assert.ok('ABCD'.indexOf(q.Answer) >= 0);
    const stem = String(q.Question).split('\n\n').pop();
    const src = bank.filter(function (b) { return b.Subject === q.Subj && b.Question === stem && String(b.Right) === String(q[q.Answer]); });
    assert.ok(src.length >= 1, 'the keyed answer is not the bank\'s right answer for: ' + stem);
  });
});

test('building the same Sunday twice does not create duplicates', () => {
  const s = freshEnv(); s.env.call('academyMockWeekly', '2026-11-15');
  const again = s.env.call('academyMockWeekly', '2026-11-15');
  assert.equal(again.existing, true);
  assert.equal(tab(s.env, 'AcademyTests').length, 4);
});

test('the same week always builds the same paper (deterministic)', () => {
  const a = freshEnv(), b = freshEnv();
  a.env.call('academyMockWeekly', '2026-11-15'); b.env.call('academyMockWeekly', '2026-11-15');
  const key = function (e) { return tab(e, 'AcademyQuestions').map(function (q) { return q.Question + '|' + q.Answer; }).join('\n'); };
  assert.equal(key(a.env), key(b.env));
});

test('questions are counted as used, and none repeats for as many weeks as the bank can cover', () => {
  const s = freshEnv(), env = s.env;
  const bank0 = tab(env, 'AcademyMockBank'), subs = ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Government', 'Literature', 'Islamic Studies'];
  const pool = {}; subs.forEach(function (x) { pool[x] = bank0.filter(function (r) { return r.Subject === x; }).length; });
  const need = function (x) { return x === 'English' ? 60 : 40; };
  const weeks = Math.min.apply(null, subs.map(function (x) { return Math.floor(pool[x] / need(x)); }));
  console.log('    (this bank covers ' + weeks + ' weeks with no repeated question: ' + subs.map(function (x) { return x + ' ' + pool[x]; }).join(', ') + ')');
  assert.ok(weeks >= 1);
  const d0 = Date.UTC(2026, 10, 15);
  const sunday = function (k) { return new Date(d0 + k * 7 * 86400000).toISOString().slice(0, 10); };
  for (let k = 0; k < weeks; k++) assert.equal(env.call('academyMockWeekly', sunday(k)).ok, true, sunday(k));
  const bank = tab(env, 'AcademyMockBank');
  assert.equal(Math.max.apply(null, bank.map(function (r) { return Number(r.Uses) || 0; })), 1, 'a question was used twice within the ' + weeks + ' weeks the bank should cover');
  // the first subject to run out must now be flagged: the next week still builds, but warns about repeats
  const next = env.call('academyMockWeekly', sunday(weeks));
  assert.equal(next.ok, true);
  const short = subs.filter(function (x) { return pool[x] - weeks * need(x) < need(x); });
  short.forEach(function (x) { assert.ok(next.warnings.some(function (w) { return w.indexOf(x) === 0; }), 'no repeat warning for ' + x); });
});

test('a bank that is too small fails safely, builds nothing and says why', () => {
  const env = createEnv();
  env.call('academyMockSeedPack1');
  // remove all Physics questions by marking them inactive
  const sh = env.sheets['AcademyMockBank'], head = sh.data[0], sc = head.indexOf('Subject'), ac = head.indexOf('Active');
  sh.data.forEach(function (r, i) { if (i > 0 && r[sc] === 'Physics') r[ac] = 'FALSE'; });
  const r = env.call('academyMockWeekly', '2026-11-15');
  assert.equal(r.ok, false);
  assert.match(r.error, /Physics/);
  assert.equal((env.sheets['AcademyTests'].data.length || 1) - 1, 0);
});

test('questions switched off in the sheet are never picked', () => {
  const s = freshEnv();
  const sh = s.env.sheets['AcademyMockBank'], head = sh.data[0], ac = head.indexOf('Active');
  const off = {}; sh.data.forEach(function (r, i) { if (i > 0 && i % 7 === 0) { r[ac] = 'FALSE'; off[r[0]] = 1; } });
  s.env.call('academyMockWeekly', '2026-11-15');
  const bank = tab(s.env, 'AcademyMockBank');
  bank.forEach(function (r) { if (off[r.BankID]) assert.ok(!(Number(r.Uses) > 0), r.BankID + ' was used while inactive'); });
});

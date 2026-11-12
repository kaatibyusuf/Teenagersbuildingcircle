'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');
const env = createEnv();

// A UTME-style paper: English 60, three subjects of 40 each.
function paper() {
  const qs = []; let no = 0;
  [['English', 60], ['Biology', 40], ['Chemistry', 40], ['Physics', 40]].forEach(function (s) {
    for (let i = 0; i < s[1]; i++) { no++; qs.push({ No: no, Answer: 'A', Subj: s[0] }); }
  });
  return qs;
}
function score(qs, answers) { env.ctx.__q = qs; env.ctx.__ans = answers; return env.run('acd_breakdown_(__q, __ans)'); }

test('a perfect paper scores 400 out of 400', () => {
  const qs = paper(), ans = {}; qs.forEach(function (q) { ans[String(q.No)] = 'A'; });
  const r = score(qs, ans);
  assert.equal(r.total, 400); assert.equal(r.outOf, 400);
  r.items.forEach(function (i) { assert.equal(i.Score, 100); });
});
test('a blank paper scores 0', () => {
  const r = score(paper(), {});
  assert.equal(r.total, 0); assert.equal(r.outOf, 400);
});
test('each subject is scaled to 100 whatever its length', () => {
  const qs = paper(), ans = {};
  qs.forEach(function (q) { if (q.Subj === 'English' && q.No <= 30) ans[String(q.No)] = 'A'; });   // 30 of 60 English right
  const r = score(qs, ans);
  assert.equal(r.items[0].Subject, 'English'); assert.equal(r.items[0].Score, 50); assert.equal(r.total, 50);
});
test('wrong answers earn nothing and there is no negative marking', () => {
  const qs = paper(), ans = {}; qs.forEach(function (q) { ans[String(q.No)] = 'B'; });
  assert.equal(score(qs, ans).total, 0);
});
test('the answer key is case-insensitive and ignores spaces', () => {
  const r = score([{ No: 1, Answer: ' a ', Subj: 'English' }], { '1': 'A' });
  assert.equal(r.total, 100);
});
test('subjects keep the order they first appear in', () => {
  const r = score(paper(), {});
  assert.deepEqual(r.items.map(function (i) { return i.Subject; }), ['English', 'Biology', 'Chemistry', 'Physics']);
});

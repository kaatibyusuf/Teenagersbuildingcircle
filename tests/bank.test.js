'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createEnv, BACKEND } = require('./helpers/gas');
const env = createEnv();

const packs = fs.readdirSync(BACKEND).filter(function (f) { return /^AcademyMockBankPack\d+\.gs$/.test(f); })
  .sort(function (a, b) { return parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10); })
  .map(function (f) { const n = parseInt(f.match(/\d+/)[0], 10); return { n: n, rows: env.run('ACM_PACK' + n) }; });
const VALID = ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Government', 'Literature', 'Islamic Studies'];
const all = [];
packs.forEach(function (p) { p.rows.forEach(function (r) { all.push({ pack: p.n, r: r }); }); });

test('the question bank packs are present', () => { assert.ok(packs.length >= 1); });

test('every row has the 8 expected fields, all strings', () => {
  all.forEach(function (x) {
    assert.equal(x.r.length, 8, 'pack ' + x.pack + ': ' + x.r[2]);
    x.r.forEach(function (c) { assert.equal(typeof c, 'string', 'pack ' + x.pack + ': ' + x.r[2]); });
  });
});
test('every subject is one the mock uses', () => {
  all.forEach(function (x) { assert.ok(VALID.indexOf(x.r[0]) >= 0, 'pack ' + x.pack + ' has subject "' + x.r[0] + '"'); });
});
test('every question and its four options are filled in and distinct', () => {
  all.forEach(function (x) {
    const opts = x.r.slice(3, 7).map(function (s) { return s.trim(); });
    assert.ok(x.r[2].trim().length > 3, 'empty question in pack ' + x.pack);
    opts.forEach(function (o) { assert.ok(o.length > 0, 'empty option in pack ' + x.pack + ': ' + x.r[2]); });
    assert.equal(new Set(opts.map(function (o) { return o.toLowerCase(); })).size, 4, 'repeated option in pack ' + x.pack + ': ' + x.r[2]);
  });
});
// Packs 1-6 were written without explanations. From pack 7 every question must have one.
const EXPLAIN_FROM_PACK = 7;
test('every question in pack ' + EXPLAIN_FROM_PACK + ' onwards has an explanation', () => {
  const missing = all.filter(function (x) { return x.pack >= EXPLAIN_FROM_PACK && !x.r[7].trim(); });
  assert.equal(missing.length, 0, missing.length + ' questions have no explanation, e.g. ' + (missing[0] && missing[0].r[2]));
});
test('note: how many older questions still have no explanation', () => {
  const old = all.filter(function (x) { return x.pack < EXPLAIN_FROM_PACK && !x.r[7].trim(); }).length;
  console.log('    (' + old + ' questions in packs 1-' + (EXPLAIN_FROM_PACK - 1) + ' have no explanation yet)');
});
test('after seeding, no question is in the bank twice (the seed skips repeats between packs)', () => {
  const seen = {}, repeats = [];
  all.forEach(function (x) { const k = x.r[0] + '|' + x.r[2] + '|' + x.r[3]; if (seen[k]) repeats.push(k); else seen[k] = x.pack; });
  const sheet = require('./helpers/gas').createEnv();
  packs.forEach(function (p) { sheet.call('academyMockSeedPack' + p.n); });
  const keys = sheet.sheets['AcademyMockBank'].data.slice(1).map(function (r) { return r[1] + '|' + r[3] + '|' + r[4]; });
  assert.equal(new Set(keys).size, keys.length);
  console.log('    (' + repeats.length + ' raw repeats between packs, skipped automatically on seeding)');
});
test('the right answer is not accidentally placed twice as a wrong option', () => {
  all.forEach(function (x) { assert.notEqual(x.r[3].trim().toLowerCase(), x.r[4].trim().toLowerCase()); });
});
test('each subject has enough questions for a week (English 60, others 40)', () => {
  const c = {}; all.forEach(function (x) { c[x.r[0]] = (c[x.r[0]] || 0) + 1; });
  VALID.forEach(function (s) { assert.ok((c[s] || 0) >= (s === 'English' ? 60 : 40), s + ' has only ' + (c[s] || 0)); });
});
test('passages are only attached to English questions (comprehension)', () => {
  const bad = all.filter(function (x) { return x.r[1] && x.r[0] !== 'English'; });
  assert.equal(bad.length, 0, bad.length + ' non-English questions have a passage');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');
const env = createEnv();
const f = function (name) { return function () { return env.call.apply(null, [name].concat([].slice.call(arguments))); }; };

test('naira_ formats with thousands separators', () => {
  assert.equal(f('naira_')(1500000), '₦1,500,000');
  assert.equal(f('naira_')(0), '₦0');
  assert.equal(f('naira_')('abc'), '₦0');
});
test('validEmail_ accepts normal addresses and rejects junk', () => {
  assert.equal(f('validEmail_')('a@b.co'), true);
  ['', 'no-at-sign', 'a@b', 'a b@c.com', null].forEach(function (x) { assert.equal(f('validEmail_')(x), false, String(x)); });
});
test('addMonths_ clamps to the end of short months', () => {
  assert.equal(f('addMonths_')('2026-01-31', 1), '2026-02-28');
  assert.equal(f('addMonths_')('2028-01-31', 1), '2028-02-29');
  assert.equal(f('addMonths_')('2026-11-15', 2), '2027-01-15');
});
test('dn_ counts days between ISO dates', () => {
  assert.equal(f('dn_')('2026-11-15') - f('dn_')('2026-11-08'), 7);
});
test('acd_isDay_ and acd_isWhen_ validate date text', () => {
  assert.equal(f('acd_isDay_')('2026-11-15'), true);
  assert.equal(f('acd_isDay_')('15/11/2026'), false);
  assert.equal(f('acd_isWhen_')('2026-11-15T09:00'), true);
  assert.equal(f('acd_isWhen_')('2026-11-15 09:00'), false);
});
test('acd_wa_ turns Nigerian numbers into international form', () => {
  assert.equal(f('acd_wa_')('08031234567'), '2348031234567');
  assert.equal(f('acd_wa_')('+234 803 123 4567'), '2348031234567');
});
test('acd_txt_ strips control characters and caps length', () => {
  assert.equal(f('acd_txt_')('  hello\u0000world  ', 50), 'helloworld');
  assert.equal(f('acd_txt_')('abcdef', 3), 'abc');
  assert.equal(f('acd_txt_')(null, 5), '');
});
test('acd_short_ shortens names for the leaderboard', () => {
  assert.equal(f('acd_short_')('Fatima Yusuf'), 'Fatima Y.');
});
test('same_ compares strings without early exit and handles length difference', () => {
  assert.equal(f('same_')('abc', 'abc'), true);
  assert.equal(f('same_')('abc', 'abd'), false);
  assert.equal(f('same_')('abc', 'abcd'), false);
});
test('acm_rng_ is deterministic per seed and stays in [0,1)', () => {
  const a = env.run("(function(){var r=acm_rng_('seed');return [r(),r(),r()];})()");
  const b = env.run("(function(){var r=acm_rng_('seed');return [r(),r(),r()];})()");
  const c = env.run("(function(){var r=acm_rng_('other');return [r(),r(),r()];})()");
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  a.forEach(function (x) { assert.ok(x >= 0 && x < 1); });
});
test('acm_shuffle_ keeps every element and does not change the input', () => {
  const out = env.run("(function(){var src=[1,2,3,4,5,6,7,8];var s=acm_shuffle_(src,acm_rng_('x'));return {src:src,s:s};})()");
  assert.deepEqual(out.src, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(out.s.slice().sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
});

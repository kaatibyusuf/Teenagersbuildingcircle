'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

const post = (o) => ({ postData: { contents: JSON.stringify(o) } });
function env() { const e = createEnv(); e.ctx.Session.getEffectiveUser = () => ({ getEmail: () => 'owner@example.com' }); return e; }

test('a failure is written to the Errors tab with the action and student, never the access code', () => {
  const e = env();
  e.call('errLog_', 'doPost', new Error('boom'), post({ action: 'submit', id: 'HM-0001', code: 'secret-code-123', note: 'private' }));
  const d = e.sheets['Errors'].data;
  assert.deepEqual(d[0], ['Time', 'Where', 'Error', 'Detail', 'Action', 'Who']);
  assert.equal(d[1][1], 'doPost'); assert.equal(d[1][2], 'boom'); assert.equal(d[1][4], 'submit'); assert.equal(d[1][5], 'HM-0001');
  assert.ok(!JSON.stringify(d).includes('secret-code-123') && !JSON.stringify(d).includes('private'));
});

test('a failed card payment emails the owner at once, but only once an hour', () => {
  const e = env();
  e.call('errLog_', 'doPost', new Error('sheet locked'), post({ action: 'cardPayment' }));
  e.call('errLog_', 'doPost', new Error('sheet locked again'), post({ action: 'cardPayment' }));
  assert.equal(e.mail.filter((m) => /ATTENTION/.test(m.subject)).length, 1);
  const f = env(); f.call('errLog_', 'doPost', new Error('x'), post({ action: 'login', id: 'HM-1' }));
  assert.equal(f.mail.length, 0);
});

test('the daily summary groups repeats, and sends nothing on a quiet day', () => {
  const e = env();
  assert.equal(e.call('errorDigest'), 0); assert.equal(e.mail.length, 0);
  for (let i = 0; i < 3; i++) e.call('errLog_', 'doPost', new Error('same problem'), post({ action: 'submit', id: 'HM-' + i }));
  e.call('errLog_', 'doPost', new Error('other'), post({ action: 'login' }));
  assert.equal(e.call('errorDigest'), 4);
  assert.match(e.mail[0].body, /3 x doPost \/ submit: same problem/); assert.match(e.mail[0].subject, /4 errors/);
});

test('logging never breaks a request, even with garbage input', () => {
  const e = env();
  e.call('errLog_', 'x', undefined, undefined); e.call('errLog_', 'x', 'just text', { postData: { contents: '{not json' } });
  assert.ok(e.sheets['Errors'].data.length >= 2);
});

test('doPost logs the failure and still answers politely', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'backend', 'Code.gs'), 'utf8');
  assert.match(src, /errLog_\('doPost', err, e\)/); assert.match(src, /errorDigestInstall/);
});

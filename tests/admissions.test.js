'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

function world(rows) {
  const env = createEnv();
  [['SHEETS']].forEach(function (c) { const defs = env.run('JSON.parse(JSON.stringify(' + c[0] + '))'); Object.keys(defs).forEach(function (n) { env.run('ss_().insertSheet(' + JSON.stringify(n) + ')'); env.sheets[n].data = [defs[n]]; }); });
  env.run("ss_().insertSheet('Enrolments')");
  const head = env.run('EN_HEADERS'); env.sheets['Enrolments'].data = [head];
  (rows || []).forEach(function (o) { env.sheets['Enrolments'].data.push(head.map(function (h) { return o[h] === undefined ? '' : o[h]; })); });
  return env;
}
const E = (extra) => Object.assign({ Ref: 'ENR-ABC123', Submitted: '2026-11-10 09:15', Status: 'Receipt sent', StudentName: 'Aminah Yusuf', Programme: 'Madrasah', Plan: 'Madrasah — Hifdh Only (Group)', KinName: 'Mr Yusuf', KinPhone: '0801 111 2222', KinEmail: 'Mum@X.com', StudentEmail: '', LoginEmail: 'mum@x.com', Notes: 'secret staff note', Amount: 12000 }, extra || {});
const look = (env, ref, contact) => env.call('admissionsFromRequest', { action: 'adm_status', ref: ref, contact: contact });

test('received: the first stage only', () => {
  const r = look(world([E()]), 'enr-abc123', 'mum@x.com');
  assert.equal(r.ok, true); assert.equal(r.stage, 1); assert.equal(r.state, 'progress');
  assert.deepEqual(r.steps.map((s) => s.done), [true, false, false]);
  assert.equal(r.name, 'Aminah'); assert.equal(r.plan, 'Hifdh Only (Group)');
});

test('card payments: waiting, then paid (assessed), then account created (confirmed)', () => {
  assert.match(look(world([E({ Status: 'Awaiting card payment' })]), 'ENR-ABC123', 'mum@x.com').steps[0].note, /card payment/);
  const paid = look(world([E({ Status: 'Card paid' })]), 'ENR-ABC123', 'mum@x.com');
  assert.equal(paid.stage, 2);
  const done = look(world([E({ Status: 'Account created', StudentID: 'HM-0007' })]), 'ENR-ABC123', 'mum@x.com');
  assert.equal(done.stage, 3); assert.equal(done.state, 'done');
});

test('a filled StudentID counts as confirmed even if the status text was changed by hand', () => {
  assert.equal(look(world([E({ Status: 'Confirmed', StudentID: 'HM-0007' })]), 'ENR-ABC123', 'mum@x.com').stage, 3);
});

test('Madrasah: placement still to come, then the starting level once a teacher sets it', () => {
  const env = world([E({ Status: 'Account created', StudentID: 'HM-0007' })]);
  const head = env.run('SHEETS.Students'); const row = head.map(() => ''); row[head.indexOf('StudentID')] = 'HM-0007'; row[head.indexOf('Level')] = 'Awaiting placement'; env.sheets['Students'].data.push(row);
  assert.match(look(env, 'ENR-ABC123', 'mum@x.com').steps[2].note, /placement conversation/);
  env.sheets['Students'].data[1][head.indexOf('Level')] = 'Juz Amma';
  assert.match(look(env, 'ENR-ABC123', 'mum@x.com').steps[2].note, /Starting level: Juz Amma/);
});

test('the contact can be any of the emails, or the phone number in any format', () => {
  const env = world([E()]);
  assert.equal(look(env, 'ENR-ABC123', 'MUM@x.com').ok, true);
  assert.equal(look(env, 'ENR-ABC123', '+234 801 111 2222').ok, true);
  assert.equal(look(env, 'ENR-ABC123', '08011112222').ok, true);
});

test('a wrong contact, a short phone number or an unknown reference all get the same answer', () => {
  const env = world([E()]);
  const a = look(env, 'ENR-ABC123', 'other@x.com'), b = look(env, 'ENR-ABC123', '2222'), c = look(env, 'ENR-ZZZ999', 'mum@x.com');
  [a, b, c].forEach((r) => assert.equal(r.ok, false));
  assert.equal(a.error, c.error);
});

test('five wrong tries pause that reference, even for the right contact', () => {
  const env = world([E()]);
  for (let i = 0; i < 5; i++) look(env, 'ENR-ABC123', 'nope' + i + '@x.com');
  const r = look(env, 'ENR-ABC123', 'mum@x.com');
  assert.equal(r.ok, false); assert.match(r.error, /Too many attempts/);
});

test('guessing across many references is limited site-wide', () => {
  const env = world([E()]);
  for (let i = 0; i < 80; i++) look(env, 'ENR-G' + String(1000 + i), 'a@b.com');
  assert.match(look(env, 'ENR-ABC123', 'mum@x.com').error, /Too many attempts/);
});

test('a rejected or refunded enrolment says to contact the school', () => {
  const r = look(world([E({ Status: 'Refunded' })]), 'ENR-ABC123', 'mum@x.com');
  assert.equal(r.state, 'attention');
});

test('nothing private is returned', () => {
  const s = JSON.stringify(look(world([E({ Status: 'Account created', StudentID: 'HM-0007' })]), 'ENR-ABC123', 'mum@x.com'));
  ['secret staff note', '0801', 'mum@x.com', 'Yusuf', 'HM-0007', '12000'].forEach((x) => assert.equal(s.includes(x), false, x));
});

test('the router sends adm_ actions to the tracker', () => {
  const env = world([E()]);
  const out = env.run('JSON.parse(doPost({ postData: { contents: ' + JSON.stringify(JSON.stringify({ action: 'adm_status', ref: 'ENR-ABC123', contact: 'mum@x.com' })) + ' } }).s)');
  assert.equal(out.ok, true);
});

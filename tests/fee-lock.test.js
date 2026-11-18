'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

function world() {
  const env = createEnv();
  ['SHEETS', 'SK_SHEETS', 'ACD_SHEETS'].forEach(function (c) {
    const defs = env.run('JSON.parse(JSON.stringify(' + c + '))');
    Object.keys(defs).forEach(function (name) { if (!env.sheets[name]) { env.run('ss_().insertSheet(' + JSON.stringify(name) + ')'); env.sheets[name].data = [defs[name]]; } });
  });
  return env;
}
function addRow(env, tab, obj) { const sh = env.sheets[tab], head = sh.data[0]; sh.data.push(head.map((h) => (obj[h] === undefined ? '' : obj[h]))); }
const post = (env, body) => env.run('JSON.parse(doPost({ postData: { contents: ' + JSON.stringify(JSON.stringify(body)) + ' } }).s)');
const PAST = '2020-01-01', FUTURE = '2099-01-01';

function setup() {
  const env = world();
  addRow(env, 'Students', { StudentID: 'HM-1', Name: 'Late Child', AccessCode: 'code-late-1', Level: 'Hifdh', NextDue: PAST, MonthlyFee: 15000, Active: 'TRUE' });
  addRow(env, 'Students', { StudentID: 'HM-2', Name: 'Paid Child', AccessCode: 'code-paid-2', Level: 'Hifdh', NextDue: FUTURE, Active: 'TRUE' });
  addRow(env, 'Students', { StudentID: 'HM-3', Name: 'Exempt Child', AccessCode: 'code-exempt-3', Level: 'Hifdh', NextDue: PAST, PaymentStatus: 'Exempt', Active: 'TRUE' });
  return env;
}

test('an overdue Madrasah student signing in gets the locked answer, with only what the pay screen needs', () => {
  const d = post(setup(), { action: 'login', id: 'HM-1', code: 'code-late-1' });
  assert.equal(d.ok, true); assert.equal(d.locked, true);
  assert.deepEqual(Object.keys(d.student).sort(), ['Fee', 'Name', 'NextDue', 'PaymentStatus', 'StudentID']);
  assert.equal(d.student.Fee, 15000);
  assert.equal(d.assignments, undefined); assert.equal(d.results, undefined); assert.equal(d.timetable, undefined);
});

test('every other request from an overdue student is refused, on every student route', () => {
  const env = setup(), who = { id: 'HM-1', code: 'code-late-1' };
  [{ action: 'submit' }, { action: 'password', newCode: 'another-code-1' }, { action: 'rec_list' }, { action: 'rt_save' }, { action: 'library' }, { action: 'exams', op: 'list' }, { action: 'quiz', op: 'start' }, { action: 'tracker', op: 'tick' }]
    .forEach((b) => { const d = post(env, Object.assign({}, b, who)); assert.equal(d.ok, false, b.action); assert.equal(d.locked, true, b.action); assert.match(d.error, /overdue/i); });
});

test('students who are up to date or exempt open the portal as before', () => {
  const env = setup();
  const a = post(env, { action: 'login', id: 'HM-2', code: 'code-paid-2' }), b = post(env, { action: 'login', id: 'HM-3', code: 'code-exempt-3' });
  assert.equal(a.ok, true); assert.equal(a.locked, undefined); assert.ok(a.student && a.timetable !== undefined);
  assert.equal(b.ok, true); assert.equal(b.locked, undefined);
});

test('the lock lifts the moment the due date moves forward', () => {
  const env = setup();
  assert.equal(post(env, { action: 'login', id: 'HM-1', code: 'code-late-1' }).locked, true);
  const sh = env.sheets.Students, col = sh.data[0].indexOf('NextDue'); sh.data[1][col] = FUTURE;
  const d = post(env, { action: 'login', id: 'HM-1', code: 'code-late-1' });
  assert.equal(d.ok, true); assert.equal(d.locked, undefined);
});

test('a wrong code still says wrong code, and tells a stranger nothing about fees', () => {
  const d = post(setup(), { action: 'login', id: 'HM-1', code: 'wrong-code-xx' });
  assert.equal(d.ok, false); assert.equal(d.locked, undefined); assert.match(d.error, /Wrong ID or access code/);
});

test('the Teenagers Building Circle, Skills School and Academy portals lock the same way', () => {
  const env = setup();
  addRow(env, 'Students', { StudentID: 'TB-1', Name: 'Teen Late', AccessCode: 'code-teen-1', Level: 'Teenagers', Programme: 'TBC', NextDue: PAST, Active: 'TRUE' });
  addRow(env, 'SkillsStudents', { StudentID: 'SK-1', Name: 'Skill Late', AccessCode: 'code-skill-1', NextDue: PAST, Active: 'TRUE' });
  addRow(env, 'AcademyStudents', { StudentID: 'AC-1', Name: 'Acad Late', AccessCode: 'code-acad-1', NextDue: PAST, Active: 'TRUE' });
  const t = post(env, { action: 'tbc_login', id: 'TB-1', code: 'code-teen-1' }), tb = post(env, { action: 'tbc_submit', id: 'TB-1', code: 'code-teen-1' });
  const s = post(env, { action: 'sk_login', id: 'SK-1', code: 'code-skill-1' }), sb = post(env, { action: 'sk_submit', id: 'SK-1', code: 'code-skill-1' });
  const a = post(env, { action: 'acd_login', id: 'AC-1', code: 'code-acad-1' }), ab = post(env, { action: 'acd_task', id: 'AC-1', code: 'code-acad-1' });
  [t, s, a].forEach((d) => { assert.equal(d.ok, true); assert.equal(d.locked, true); assert.ok(d.student.Name); });
  [tb, sb, ab].forEach((d) => { assert.equal(d.ok, false); assert.equal(d.locked, true); });
});

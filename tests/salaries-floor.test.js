'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

function world() {
  const env = createEnv();
  const defs = env.run('JSON.parse(JSON.stringify(SHEETS))');
  Object.keys(defs).forEach(function (name) { if (!env.sheets[name]) { env.run('ss_().insertSheet(' + JSON.stringify(name) + ')'); env.sheets[name].data = [defs[name]]; } });
  if (!env.sheets.Teachers) { env.run("ss_().insertSheet('Teachers')"); env.sheets.Teachers.data = [['TeacherID', 'Name', 'AccessCode', 'Role', 'Active', 'Email', 'WhatsApp', 'Rate']]; }
  return env;
}
function addRow(env, tab, obj) { const sh = env.sheets[tab], head = sh.data[0]; sh.data.push(head.map((h) => (obj[h] === undefined ? '' : obj[h]))); }

function setup() {
  const env = world();
  addRow(env, 'Teachers', { TeacherID: 'T1', Name: 'Ustadh One', Active: 'TRUE' });
  addRow(env, 'Teachers', { TeacherID: 'T2', Name: 'Ustadh Two', Active: 'TRUE' });
  addRow(env, 'Teachers', { TeacherID: 'T3', Name: 'Ustadh Three', Active: 'TRUE', Rate: 6000 });
  addRow(env, 'Teachers', { TeacherID: 'T4', Name: 'Ustadh Idle', Active: 'TRUE' });
  const stu = (id, t) => addRow(env, 'Students', { StudentID: id, Name: 'Student ' + id, Teacher: t, Level: 'Awwal', Active: 'TRUE' });
  stu('S1', 'T1');                                   // 1 student
  stu('S2', 'T2'); stu('S3', 'T2'); stu('S4', 'T2'); // 3 students
  stu('S5', 'T3'); stu('S6', 'T3');                  // 2 students at 6,000
  return env;
}
const pay = (env) => env.run('sal_payload_({})');
const by = (d, name) => d.staff.filter((s) => s.Name === name)[0];

test('a teacher with one or two students is paid the minimum, not students times rate', () => {
  const d = pay(setup());
  assert.equal(d.floor, 10000);
  assert.equal(by(d, 'Ustadh One').Amount, 10000); assert.equal(by(d, 'Ustadh One').Floor, true);
  assert.equal(by(d, 'Ustadh Three').Amount, 12000); assert.equal(by(d, 'Ustadh Three').Floor, false);
});

test('above the minimum the pay is simply students times rate', () => {
  const d = pay(setup());
  assert.equal(by(d, 'Ustadh Two').Amount, 15000); assert.equal(by(d, 'Ustadh Two').Floor, false);
});

test('a teacher with no students earns nothing and is not listed for payment', () => {
  const d = pay(setup());
  assert.equal(by(d, 'Ustadh Idle'), undefined);
  assert.equal(d.total, 10000 + 15000 + 12000);
});

test('marking paid records the minimum amount', () => {
  const env = setup();
  const r = env.run('sal_pay_("owner", { key: "M:T1", reference: "ref-1" })');
  assert.equal(r.ok, true);
  const rows = env.sheets.Salaries.data;
  assert.equal(rows[rows.length - 1][rows[0].indexOf('Amount')], 10000);
  const d = pay(env); assert.equal(by(d, 'Ustadh One').Status, 'Paid'); assert.equal(by(d, 'Ustadh One').Amount, 10000);
});

test('switching the minimum off restores plain students times rate', () => {
  const env = setup();
  env.run('SAL_FLOOR_TEST = 1');
  const d = env.run('(function(){ const f = sal_amount_; return f({ Fixed: false, Rate: 5000, Students: [1] }); })()');
  assert.equal(d, 10000);
});

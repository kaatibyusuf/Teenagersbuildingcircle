'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

function world() {
  const env = createEnv();
  ['SHEETS', 'ACD_SHEETS', 'SK_SHEETS'].forEach(function (c) {
    const defs = env.run('JSON.parse(JSON.stringify(' + c + '))');
    Object.keys(defs).forEach(function (name) { if (!env.sheets[name]) { env.run('ss_().insertSheet(' + JSON.stringify(name) + ')'); env.sheets[name].data = [defs[name]]; } });
  });
  if (!env.sheets.Teachers) { env.run("ss_().insertSheet('Teachers')"); env.sheets.Teachers.data = [['TeacherID', 'Name', 'AccessCode', 'Role', 'Active', 'Email', 'WhatsApp', 'Rate']]; }
  return env;
}
function addRow(env, tab, obj) { const sh = env.sheets[tab], head = sh.data[0]; sh.data.push(head.map((h) => (obj[h] === undefined ? '' : obj[h]))); }
const FUTURE = '2099-01-01', PAST = '2020-01-01';

function setup() {
  const env = world();
  addRow(env, 'Teachers', { TeacherID: 'T1', Name: 'Ustadh One', Active: 'TRUE' });
  addRow(env, 'Teachers', { TeacherID: 'T2', Name: 'Ustadh Idle', Active: 'TRUE' });
  const stu = (id, fee, extra) => addRow(env, 'Students', Object.assign({ StudentID: id, Name: 'Student ' + id, Teacher: 'T1', Level: 'Awwal', MonthlyFee: fee, NextDue: FUTURE, Active: 'TRUE' }, extra || {}));
  stu('S1', 14000); stu('S2', 14000); stu('S3', 20000);
  stu('S4', 14000, { PaymentStatus: 'Exempt' });   // exempt: counted as a student, no income
  stu('S5', '', {});                                 // no fee on record
  stu('S6', 14000, { NextDue: PAST });               // overdue, still income
  return env;
}
const proj = (env) => env.run('(function(){ const base = ow_payload_({ OwnerID: "OW-1", Name: "Owner" }); return pj_payload_(base, sal_payload_({})); })()');

test('income counts the fee of every active, non-exempt student that has one', () => {
  const P = proj(setup());
  assert.equal(P.income, 14000 * 3 + 20000);
  assert.equal(P.paying, 4); assert.equal(P.exempt, 1); assert.equal(P.noFee, 1); assert.equal(P.students, 6);
  assert.equal(P.avgFee, Math.round(62000 / 4));
});

test('costs are staff pay plus charges plus other costs, and profit is income minus costs', () => {
  const env = setup();
  const P = proj(env);
  // 5 students with Teacher T1 (S1..S6 minus none): staff pay comes from the Staff pay tab
  const sal = env.run('sal_payload_({})');
  assert.equal(P.staffPay, sal.total);
  assert.equal(P.charges, Math.round(P.income * 0.03));
  assert.equal(P.costs, P.staffPay + P.charges + 0);
  assert.equal(P.profit, P.income - P.costs);
});

test('the shortfall against the target turns into a number of students needed', () => {
  const P = proj(setup());
  assert.equal(P.target, 100000);
  assert.equal(P.short, P.target - P.profit);
  assert.ok(P.margin > 0);
  assert.equal(P.need, Math.ceil(P.short / P.margin));
  assert.ok(P.work[0].Level === 'high' && /profit target/.test(P.work[0].Title));
});

test('saving targets changes the projection, and bad values are refused', () => {
  const env = setup();
  assert.equal(env.run('pj_save_("Owner", { profitTarget: 0, otherCosts: 5000, newPerMonth: 2, chargePct: 0, notes: "Chase overdue fees" })').ok, true);
  const P = proj(env);
  assert.equal(P.target, 0); assert.equal(P.otherCosts, 5000); assert.equal(P.charges, 0);
  assert.equal(P.settings.Notes, 'Chase overdue fees'); assert.equal(P.settings.NewPerMonth, 2);
  assert.equal(P.costs, P.staffPay + 5000);
  assert.equal(P.short <= 0, true);
  assert.equal(env.run('pj_save_("Owner", { profitTarget: "abc", otherCosts: 0, newPerMonth: 1, chargePct: 3 })').ok, false);
  assert.equal(env.run('pj_save_("Owner", { profitTarget: 1, otherCosts: 0, newPerMonth: 1, chargePct: 99 })').ok, false);
  assert.equal(env.run('pj_save_("Owner", { profitTarget: 1, otherCosts: 0, newPerMonth: 1, chargePct: 3 })').ok, true);   // saving twice updates in place
  const rows = env.sheets.Projection.data; assert.equal(rows.filter((r) => r[0] === 'ProfitTarget').length, 1);
});

test('the forecast adds the planned students each month and the work list flags the real problems', () => {
  const P = proj(setup());
  assert.equal(P.forecast.length, 6);
  assert.equal(P.forecast[1].Students, P.paying + 5);
  assert.ok(P.forecast[5].Income > P.forecast[0].Income);
  const titles = P.work.map((w) => w.Title).join(' | ');
  assert.match(titles, /Collect overdue fees/); assert.match(titles, /Set the fee on every student/); assert.match(titles, /no students/);
  assert.equal(P.models.length, 4);
  assert.match(P.models[1].Label, /Flat .*30,000 for all 2 teachers/);
});

test('the owner router returns the projection and saves targets (login through doPost)', () => {
  const env = setup();
  env.run("ss_().insertSheet('Owners')"); env.sheets.Owners.data = [['OwnerID', 'Name', 'AccessCode', 'Email', 'Active']];
  addRow(env, 'Owners', { OwnerID: 'OW-1', Name: 'Owner', AccessCode: 'owner-code-1', Active: 'TRUE' });
  const post = (body) => env.run('JSON.parse(doPost({ postData: { contents: ' + JSON.stringify(JSON.stringify(body)) + ' } }).s)');
  const login = post({ action: 'ow_login', id: 'OW-1', code: 'owner-code-1' });
  assert.equal(login.ok, true); assert.ok(login.projection); assert.equal(login.projection.target, 100000);
  const saved = post({ action: 'ow_projsave', id: 'OW-1', code: 'owner-code-1', profitTarget: 123000, otherCosts: 4000, newPerMonth: 3, chargePct: 3, notes: 'Plan' });
  assert.equal(saved.ok, true); assert.equal(saved.message, 'Targets and plan saved.');
  assert.equal(saved.projection.target, 123000); assert.equal(saved.projection.otherCosts, 4000); assert.equal(saved.projection.settings.Notes, 'Plan');
  assert.equal(post({ action: 'ow_projsave', id: 'OW-1', code: 'wrong-code-xx', profitTarget: 1 }).ok, false);
});

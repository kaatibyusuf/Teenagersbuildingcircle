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
function addRow(env, tab, obj) {
  const sh = env.sheets[tab], head = sh.data[0];
  sh.data.push(head.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
}
function cell(env, tab, row, col) { const sh = env.sheets[tab]; return sh.data[row][sh.data[0].indexOf(col)]; }

test('payBase_: early payments extend from the old due date', () => {
  const env = world();
  assert.equal(env.run("payBase_('2026-12-01', '2026-11-15')"), '2026-12-01');
  assert.equal(env.run("payBase_('2026-11-15', '2026-11-15')"), '2026-11-15');
});

test('payBase_: a late payment still extends from the old due date', () => {
  const env = world();
  assert.equal(env.run("payBase_('2026-11-01', '2026-11-15')"), '2026-11-01');
  assert.equal(env.run("addMonths_(payBase_('2026-11-01', '2026-11-15'), 1)"), '2026-12-01');
});

test('payBase_: a student lapsed for more than 60 days restarts from the payment date', () => {
  const env = world();
  assert.equal(env.run("payBase_('2026-09-15', '2026-11-14')"), '2026-09-15');   // exactly 60 days
  assert.equal(env.run("payBase_('2026-09-15', '2026-11-15')"), '2026-11-15');   // 61 days
  assert.equal(env.run("payBase_('', '2026-11-15')"), '2026-11-15');
});

test('Madrasah payment confirmed two weeks late keeps the original cycle', () => {
  const env = world();
  addRow(env, 'Students', { StudentID: 'HM-0010', Name: 'Mubarak A', AccessCode: 'x', Level: 'Hifdh', NextDue: '2026-11-01', Active: 'TRUE', MonthlyFee: 19000 });
  addRow(env, 'Payments', { PaymentID: 'P-1', StudentID: 'HM-0010', Date: '2026-11-15', Amount: 19000, Months: 1, Status: 'Confirmed' });
  env.run('applyPayments_()');
  assert.equal(String(cell(env, 'Students', 1, 'NextDue')).slice(0, 10), '2026-12-01');
});

test('Academy payment confirmed late keeps the original cycle', () => {
  const env = world();
  addRow(env, 'AcademyStudents', { StudentID: 'AC-0001', Name: 'Ibrahim', AccessCode: 'x', Track: 'UTME', NextDue: '2026-11-01', Active: 'TRUE', MonthlyFee: 10000 });
  const r = env.run("acd_confirmPayment_({ AdminID: 'A', Name: 'A' }, { studentId: 'AC-0001', amount: 10000, months: 1, date: '2026-11-15' })");
  assert.equal(r.ok, true);
  assert.equal(String(cell(env, 'AcademyStudents', 1, 'NextDue')).slice(0, 10), '2026-12-01');
});

test('fee page reports the date a payment will count from', () => {
  const env = world();
  addRow(env, 'Students', { StudentID: 'HM-0010', Name: 'Mubarak A', AccessCode: 'x', Level: 'Hifdh', NextDue: '2026-11-01', Active: 'TRUE', MonthlyFee: 19000 });
  const f = env.run("fee_public_(fee_find_('HM-0010'))");
  assert.equal(f.nextDue, '2026-11-01');
  assert.equal(f.payFrom, '2026-11-01');
});

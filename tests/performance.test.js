'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

// Opening the spreadsheet is slow in Apps Script (SpreadsheetApp.openById). It should happen once per request, not once per helper call.
function world() {
  const env = createEnv();
  [['SHEETS'], ['SK_SHEETS'], ['ACD_SHEETS']].forEach(function (c) {
    const defs = env.run('JSON.parse(JSON.stringify(' + c[0] + '))');
    Object.keys(defs).forEach(function (n) { if (!env.sheets[n]) { env.run('ss_().insertSheet(' + JSON.stringify(n) + ')'); env.sheets[n].data = [defs[n]]; } });
  });
  const add = function (tab, o) { const sh = env.sheets[tab], h = sh.data[0]; sh.data.push(h.map(function (k) { return o[k] === undefined ? '' : o[k]; })); };
  for (let i = 0; i < 60; i++) add('Students', { StudentID: 'HM-' + (1000 + i), Name: 'S' + i, AccessCode: 'code' + i, Level: 'Hifdh', NextDue: '2099-01-01', Active: 'TRUE' });
  for (let i = 0; i < 40; i++) add('AcademyStudents', { StudentID: 'AC-' + (1000 + i), Name: 'A' + i, AccessCode: 'code' + i, Track: 'UTME', NextDue: '2099-01-01', Active: 'TRUE' });
  for (let i = 0; i < 20; i++) add('SkillsStudents', { StudentID: 'SK-' + (1000 + i), Name: 'K' + i, AccessCode: 'code' + i, Course: 'Web', NextDue: '2099-01-01', Active: 'TRUE' });
  return env;
}
function opensFor(env, payload) {
  let opens = 0; const SA = env.ctx.SpreadsheetApp, orig = SA.openById;
  SA.openById = function () { opens++; return orig.apply(SA, arguments); };
  try {
    env.run('SS_MEMO_ = null; TZ_MEMO_ = null;');   // every real request starts with fresh globals
    const out = env.run('JSON.parse(doPost({ postData: { contents: ' + JSON.stringify(JSON.stringify(payload)) + ' } }).s)');
    return { opens: opens, out: out };
  } finally { SA.openById = orig; }
}

test('a Madrasah sign-in opens the spreadsheet once', () => {
  const r = opensFor(world(), { action: 'login', id: 'HM-1005', code: 'code5' });
  assert.equal(r.out.ok, true); assert.equal(r.opens, 1);
});
test('an Academy sign-in opens the spreadsheet once (it used to open it 185 times)', () => {
  const r = opensFor(world(), { action: 'acd_login', id: 'AC-1005', code: 'code5' });
  assert.equal(r.out.ok, true); assert.equal(r.opens, 1);
});
test('a Skills School sign-in opens the spreadsheet once', () => {
  const r = opensFor(world(), { action: 'sk_login', id: 'SK-1005', code: 'code5' });
  assert.equal(r.out.ok, true); assert.equal(r.opens, 1);
});
test('the time zone is still read correctly', () => {
  const env = world();
  assert.equal(env.run('tz_()'), 'Africa/Lagos');
  assert.match(env.run('today_()'), /^\d{4}-\d{2}-\d{2}$/);
});

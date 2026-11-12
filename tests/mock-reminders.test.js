'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { createEnv, BACKEND } = require('./helpers/gas');

const SUNDAY = '2026-11-15', SATURDAY = '2026-11-14';
function setup(students) {
  const env = createEnv();
  fs.readdirSync(BACKEND).filter(function (f) { return /^AcademyMockBankPack\d+\.gs$/.test(f); }).forEach(function (f) { env.call('academyMockSeedPack' + parseInt(f.match(/\d+/)[0], 10)); });
  env.call('academyMockWeekly', SUNDAY);
  env.call('acd_t_', 'AcademyAttempts'); env.call('acd_t_', 'AcademyStudents');
  env.run("ss_().insertSheet('Reminders')");
  env.sheets['Reminders'].data = [['Date', 'StudentID', 'Name', 'Type', 'Message', 'WhatsAppLink', 'EmailStatus', 'Done', 'Key']];
  const sh = env.sheets['AcademyStudents'], head = sh.data[0];
  (students || []).forEach(function (st) { const row = head.map(function () { return ''; }); Object.keys(st).forEach(function (k) { row[head.indexOf(k)] = st[k]; }); sh.data.push(row); });
  return env;
}
const S = function (id, name, extra) { return Object.assign({ StudentID: id, Name: name, Track: 'UTME', Active: 'TRUE', Email: id.toLowerCase() + '@x.com', WhatsApp: '08012345678' }, extra || {}); };
function reminders(env) { return env.sheets['Reminders'].data.slice(1); }
function startMock(env, id) {
  const tid = env.sheets['AcademyTests'].data[1][0], sh = env.sheets['AcademyAttempts'], head = sh.data[0], row = head.map(function () { return ''; });
  row[head.indexOf('AttemptID')] = 'AT1'; row[head.indexOf('TestID')] = tid; row[head.indexOf('StudentID')] = id; row[head.indexOf('Started')] = SUNDAY + 'T10:00';
  sh.data.push(row);
}

test('Saturday: every active UTME student is reminded, other tracks and inactive students are not', () => {
  const env = setup([S('A1', 'Aisha Bello'), S('A2', 'Musa Ali'), S('A3', 'Zainab', { Track: 'O-Levels' }), S('A4', 'Old Student', { Active: 'FALSE' })]);
  const r = env.call('acm_remind_', 'eve', SATURDAY, SATURDAY + 'T17:00');
  assert.equal(r.rows, 2);
  assert.deepEqual(reminders(env).map(function (x) { return x[1]; }).sort(), ['A1', 'A2']);
  assert.equal(env.mail.length, 2);
  assert.match(reminders(env)[0][5], /^https:\/\/wa\.me\/2348012345678\?text=/);
  assert.match(reminders(env)[0][4], /opens tomorrow/);
});

test('Saturday reminders are not sent on any other day', () => {
  const env = setup([S('A1', 'Aisha Bello')]);
  assert.equal(env.call('acm_remind_', 'eve', '2026-11-13', '2026-11-13T17:00').rows, 0);
  assert.equal(env.call('acm_remind_', 'eve', SUNDAY, SUNDAY + 'T17:00').rows, 0);
  assert.equal(env.mail.length, 0);
});

test('running the same reminder twice never sends twice', () => {
  const env = setup([S('A1', 'Aisha Bello')]);
  env.call('acm_remind_', 'eve', SATURDAY, SATURDAY + 'T17:00');
  const again = env.call('acm_remind_', 'eve', SATURDAY, SATURDAY + 'T17:30');
  assert.equal(again.rows, 0);
  assert.equal(env.mail.length, 1);
  assert.equal(reminders(env).length, 1);
});

test('Sunday: only students who have not started are reminded', () => {
  const env = setup([S('A1', 'Aisha Bello'), S('A2', 'Musa Ali')]);
  startMock(env, 'A1');
  const r = env.call('acm_remind_', 'late', SUNDAY, SUNDAY + 'T16:00');
  assert.deepEqual(r.names, ['Musa Ali']);
  assert.match(reminders(env)[0][4], /not started/);
});

test('Sunday: nothing is sent once the last start time has passed', () => {
  const env = setup([S('A1', 'Aisha Bello')]);
  assert.equal(env.call('acm_remind_', 'late', SUNDAY, SUNDAY + 'T21:00').rows, 0);
  assert.equal(env.call('acm_remind_', 'late', SUNDAY, SUNDAY + 'T22:30').rows, 0);
});

test('a student with no email still gets a row with a WhatsApp link for staff', () => {
  const env = setup([S('A1', 'Aisha Bello', { Email: '' })]);
  env.call('acm_remind_', 'eve', SATURDAY, SATURDAY + 'T17:00');
  assert.equal(env.mail.length, 0);
  assert.equal(reminders(env)[0][6], 'No email');
  assert.match(reminders(env)[0][5], /wa\.me/);
});

test('dry run lists names and sends and writes nothing', () => {
  const env = setup([S('A1', 'Aisha Bello')]);
  const r = env.call('acm_remind_', 'eve', SATURDAY, '', true);
  assert.deepEqual(r.names, ['Aisha Bello']);
  assert.equal(env.mail.length, 0);
  assert.equal(reminders(env).length, 0);
});

test('with no mock built there is nothing to remind about', () => {
  const env = createEnv();
  env.call('acd_t_', 'AcademyTests');
  assert.equal(env.call('acm_remind_', 'eve', SATURDAY, SATURDAY + 'T17:00').rows, 0);
});

test('setup installs exactly two weekly triggers', () => {
  const env = createEnv();
  env.call('academyMockRemindersSetup');
  assert.equal(env.triggers.length, 2);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createEnv } = require('./helpers/gas');

const hsPhone = require('../frontend/js/phone.js');
const gs = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'Phone.gs'), 'utf8') + '\nthis.phone_normalise_ = phone_normalise_;', gs);
const server = (s) => JSON.parse(JSON.stringify(gs.phone_normalise_(s)));

const GOOD = [
  ['+234 704 722 6487', '2347047226487'], ['0704 722 6487', '2347047226487'], ['704 722 6487', '2347047226487'], ['2347047226487', '2347047226487'],
  ['08011112222', '2348011112222'], ['0901 234 5678', '2349012345678'], ['+234 0704 722 6487', '2347047226487'],
  ['+44 7700 900123', '447700900123'], ['0044 7700 900123', '447700900123'], ['+1 (202) 555-0143', '12025550143'],
  ['+971 50 123 4567', '971501234567'], ['+966-50-123-4567', '966501234567'], ['+233 24 123 4567', '233241234567'], ['+91 98765 43210', '919876543210']
];
const BAD = ['', 'abc', '12345', '07700 900123', '2025550123', '+0 123', '+44 7700 90012 ext 5', '+', '++447700900123', '+44 77', '+1234567890123456', '0123456789'];

test('numbers from Nigeria and from other countries are all read correctly', () => {
  GOOD.forEach(([typed, digits]) => {
    assert.deepEqual(JSON.parse(JSON.stringify(hsPhone(typed))), { ok: true, digits }, 'form: ' + typed);
    assert.deepEqual(server(typed), { ok: true, digits }, 'server: ' + typed);
  });
});

test('things that are not a usable number are refused, with a reason', () => {
  BAD.forEach((typed) => {
    const f = hsPhone(typed), s = server(typed);
    assert.equal(f.ok, false, 'form accepted: ' + typed);
    assert.equal(s.ok, false, 'server accepted: ' + typed);
    assert.ok(f.why && s.why);
  });
});

test('a foreign number that starts with 0 is never turned into a Nigerian one', () => {
  assert.match(hsPhone('07700 900123').why, /country code/);
  assert.equal(hsPhone('0044 7700 900123').digits.slice(0, 3), '447');
});

test('the form and the server give the same answer for every example', () => {
  GOOD.concat(BAD.map((b) => [b])).forEach(([typed]) => assert.deepEqual(JSON.parse(JSON.stringify(hsPhone(typed))), server(typed), typed));
});

test('the enrolment form checks the number with the shared rules and loads them first', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'enroll.html'), 'utf8');
  assert.ok(html.indexOf('<script src="js/phone.js"></script>') > 0 && html.indexOf('<script src="js/phone.js"></script>') < html.indexOf('window.hsPhone(val)'));
  assert.ok(!/placeholder="\+234\.\.\."/.test(html));
  assert.ok(/country code/.test(html));
});

function enrolWith(kinPhone) {
  const env = createEnv();
  env.run("ss_().insertSheet('Enrolments')");
  env.sheets['Enrolments'].data = [env.run('EN_HEADERS')];
  const plan = env.run('Object.keys(EN_PLANS).filter(function (k) { return EN_CLOSED_PLANS.indexOf(k) < 0; })[0]');
  const r = env.call('enrolFromRequest', { ref: 'ENR-ABC123', studentName: 'Aminah Yusuf', dob: '2014-03-02', gradeLevel: 'Primary 4', programme: 'Madrasah', plan, kinName: 'Mr Yusuf', kinRelationship: 'Father', kinPhone, kinEmail: 'dad@example.com' });
  return { r, env };
}

test('enrolment accepts a UK number and keeps it as typed', () => {
  const { r, env } = enrolWith('+44 7700 900123');
  assert.equal(r.ok, true, JSON.stringify(r));
  const head = env.sheets['Enrolments'].data[0], row = env.sheets['Enrolments'].data[1];
  assert.equal(row[head.indexOf('KinPhone')], '+44 7700 900123');
});

test('enrolment refuses text that is not a phone number', () => {
  const { r } = enrolWith('call me');
  assert.equal(r.ok, false);
  assert.match(r.error, /digits|country code|number/i);
});

test('WhatsApp links keep a foreign number intact and still fix a Nigerian one', () => {
  const env = createEnv();
  assert.match(env.call('waLink_', '+44 7700 900123', 'hi'), /^https:\/\/wa\.me\/447700900123\?/);
  assert.match(env.call('waLink_', '0704 722 6487', 'hi'), /^https:\/\/wa\.me\/2347047226487\?/);
  assert.match(env.call('waLink_', '0044 7700 900123', 'hi'), /^https:\/\/wa\.me\/447700900123\?/);
  assert.match(env.call('waLink_', '08011112222', 'hi'), /^https:\/\/wa\.me\/2348011112222\?/);
});

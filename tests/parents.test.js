'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

function makeTabs(env) {
  [['SHEETS'], ['SK_SHEETS'], ['ACD_SHEETS']].forEach(function (c) {
    const defs = env.run('JSON.parse(JSON.stringify(' + c[0] + '))');
    Object.keys(defs).forEach(function (name) { if (!env.sheets[name]) { env.run("ss_().insertSheet(" + JSON.stringify(name) + ")"); env.sheets[name].data = [defs[name]]; } });
  });
}
function addRow(env, tab, obj) {
  const sh = env.sheets[tab], head = sh.data[0];
  sh.data.push(head.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
}
function world() {
  const env = createEnv();
  makeTabs(env);
  addRow(env, 'Students', { StudentID: 'HM-0001', Name: 'Aminah Yusuf', AccessCode: 'child-code-1', Level: 'Hifdh', Plan: 'Standard', Teacher: 'Ustadh Ali', NextDue: '2099-01-01', AttendancePresent: 9, AttendanceTotal: 10, Juz: 3, CurrentSurah: 'Al-Baqarah', ClassLink: 'https://meet.example/secret', Active: 'TRUE', Email: 'mum@x.com', WhatsApp: '08011112222', MonthlyFee: 15000 });
  addRow(env, 'Students', { StudentID: 'HM-0002', Name: 'Other Child', AccessCode: 'child-code-2', Level: 'Hifdh', NextDue: '2099-01-01', Active: 'TRUE' });
  addRow(env, 'Students', { StudentID: 'HM-0003', Name: 'Teen Student', AccessCode: 'child-code-3', Level: 'Teenagers', Programme: 'TBC', NextDue: '2099-01-01', Active: 'TRUE', Email: 't@x.com' });
  addRow(env, 'AcademyStudents', { StudentID: 'AC-0001', Name: 'Ibrahim Musa', AccessCode: 'child-code-4', Track: 'UTME', NextDue: '2099-01-01', Active: 'TRUE', Email: 'dad@x.com', ClassLink: 'https://meet.example/academy' });
  addRow(env, 'SkillsStudents', { StudentID: 'SK-0001', Name: 'Khadijah Bello', AccessCode: 'child-code-5', Course: 'Web Design', Cohort: 'C1', StartDate: '2026-10-01', NextDue: '2099-01-01', Active: 'TRUE', Fee: 20000 });
  addRow(env, 'Results', { StudentID: 'HM-0001', Date: '2026-11-01', Type: 'Test', Subject: 'Tajweed', Score: 18, OutOf: 20 });
  addRow(env, 'Results', { StudentID: 'HM-0002', Date: '2026-11-01', Type: 'Test', Subject: 'Secret Other', Score: 1, OutOf: 20 });
  return env;
}
const adminOf = (role) => ({ role: role, id: 'A1', name: 'Admin', kinds: [] });
function issue(env, role, id) {
  const who = env.run('(function(){ var w = ' + JSON.stringify(adminOf(role)) + '; w.kinds = RS_SCOPE[w.role]; return w; })()');
  try { return env.call('rs_reset_', who, { kind: 'parent', targetId: id, email: true, force: '1' }); }
  catch (e) { return { ok: false, error: String(e.message) }; }
}
const view = (env, id, code) => env.call('parentsFromRequest', { action: 'par_view', id: id, code: code });

test('an admin can issue a parent code, which is shown once and stored protected', () => {
  const env = world(), r = issue(env, 'admin', 'HM-0001');
  assert.equal(r.ok, true);
  assert.match(r.code, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
  assert.equal(r.forced, false);
  assert.match(r.message, /Parent code: /);
  const row = env.sheets['Parents'].data[1], head = env.sheets['Parents'].data[0];
  assert.match(String(row[head.indexOf('AccessCode')]), /^h1\$/);
  assert.equal(JSON.stringify(env.sheets['Parents'].data).includes(r.code), false);
  assert.equal(row[head.indexOf('Email')], 'mum@x.com');
  assert.equal(env.mail.length, 1);
});

test('the parent signs in with the child ID and the parent code, and sees only their child', () => {
  const env = world(), r = issue(env, 'admin', 'HM-0001'), v = view(env, 'HM-0001', r.code);
  assert.equal(v.ok, true);
  assert.equal(v.programme, 'madrasah');
  assert.equal(v.child.name, 'Aminah Yusuf');
  assert.equal(v.attendance.percent, 90);
  assert.equal(v.progress.results.length, 1);
  const s = JSON.stringify(v);
  ['Secret Other', 'Other Child', 'meet.example', 'child-code', 'h1$'].forEach(function (bad) { assert.equal(s.includes(bad), false, bad); });
});

test('the child access code does not open the parent view, and the parent code does not open the child dashboard', () => {
  const env = world(), r = issue(env, 'admin', 'HM-0001');
  assert.equal(view(env, 'HM-0001', 'child-code-1').ok, false);
  assert.ok(env.call('auth_', 'HM-0001', r.code).error);
});

test('five wrong codes lock the parent sign-in', () => {
  const env = world(), r = issue(env, 'admin', 'HM-0001');
  for (let i = 0; i < 5; i++) view(env, 'HM-0001', 'wrong-' + i);
  const locked = view(env, 'HM-0001', r.code);
  assert.equal(locked.ok, false);
  assert.match(locked.error, /Too many attempts/);
});

test('a child without a parent code, an unknown ID and an inactive parent are all refused', () => {
  const env = world(), r = issue(env, 'admin', 'HM-0001');
  assert.equal(view(env, 'HM-0002', 'anything').ok, false);
  assert.equal(view(env, 'ZZ-9999', 'anything').ok, false);
  const sh = env.sheets['Parents'], head = sh.data[0];
  sh.data[1][head.indexOf('Active')] = 'FALSE';
  assert.equal(view(env, 'HM-0001', r.code).ok, false);
});

test('an admin cannot issue a parent code outside their programme; the owner can', () => {
  const env = world();
  assert.equal(issue(env, 'academy', 'HM-0001').ok, false);
  assert.equal(issue(env, 'skills', 'AC-0001').ok, false);
  assert.equal(issue(env, 'owner', 'HM-0001').ok, true);
  assert.equal(issue(env, 'academy', 'AC-0001').ok, true);
  assert.equal(issue(env, 'skills', 'SK-0001').ok, true);
});

test('issuing again gives a new code and the old one stops working', () => {
  const env = world(), a = issue(env, 'admin', 'HM-0001'), b = issue(env, 'admin', 'HM-0001');
  assert.notEqual(a.code, b.code);
  assert.equal(env.sheets['Parents'].data.length, 2);
  assert.equal(view(env, 'HM-0001', a.code).ok, false);
  assert.equal(view(env, 'HM-0001', b.code).ok, true);
});

test('the admin search lists a parent entry for each child in scope only', () => {
  const env = world();
  const find = (role, q) => env.call('rs_find_', env.run('(function(){ var w = ' + JSON.stringify(adminOf(role)) + '; w.kinds = RS_SCOPE[w.role]; return w; })()'), { q: q }).results.filter(function (x) { return x.kind === 'parent'; });
  assert.equal(find('admin', 'aminah').length, 1);
  assert.match(find('admin', 'aminah')[0].kindLabel, /no code yet/);
  assert.equal(find('academy', 'aminah').length, 0);
  assert.equal(find('academy', 'ibrahim').length, 1);
  issue(env, 'admin', 'HM-0001');
  assert.doesNotMatch(find('admin', 'aminah')[0].kindLabel, /no code yet/);
});

test('Academy, Skills and Teenagers Circle children each get their own view', () => {
  const env = world();
  const ac = view(env, 'AC-0001', issue(env, 'academy', 'AC-0001').code), sk = view(env, 'SK-0001', issue(env, 'skills', 'SK-0001').code), tb = view(env, 'HM-0003', issue(env, 'admin', 'HM-0003').code);
  assert.equal(ac.programme, 'academy'); assert.equal(ac.progress.kind, 'academy'); assert.equal(JSON.stringify(ac).includes('meet.example'), false);
  assert.equal(sk.programme, 'skills'); assert.equal(sk.progress.course, 'Web Design');
  assert.equal(tb.programme, 'tbc'); assert.equal(tb.progress.kind, 'tbc');
  [ac, sk, tb].forEach(function (v) { assert.equal(v.ok, true); assert.equal(typeof v.fees.status, 'string'); });
});

test('a parent can change their own code', () => {
  const env = world(), r = issue(env, 'admin', 'HM-0001');
  const bad = env.call('parentsFromRequest', { action: 'par_change', id: 'HM-0001', code: r.code, newCode: 'short' });
  assert.equal(bad.ok, false);
  const ok = env.call('parentsFromRequest', { action: 'par_change', id: 'HM-0001', code: r.code, newCode: 'my-own-long-code' });
  assert.equal(ok.ok, true);
  assert.equal(view(env, 'HM-0001', r.code).ok, false);
  assert.equal(view(env, 'HM-0001', 'my-own-long-code').ok, true);
});

test('the request router sends par_ actions to the parent view', () => {
  const env = world(), r = issue(env, 'admin', 'HM-0001');
  const out = env.run('JSON.parse(doPost({ postData: { contents: ' + JSON.stringify(JSON.stringify({ action: 'par_view', id: 'HM-0001', code: r.code })) + ' } }).s)');
  assert.equal(out.ok, true);
  assert.equal(out.child.name, 'Aminah Yusuf');
});

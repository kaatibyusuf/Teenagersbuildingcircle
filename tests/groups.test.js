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
function call(env, body) { return env.run('groupsFromRequest(' + JSON.stringify(body) + ')'); }
function teacherTab(env) {   // the Teachers tab is created by Teacher.gs setup; make it here if the fake env lacks it
  if (!env.sheets.Teachers) { env.run("ss_().insertSheet('Teachers')"); env.sheets.Teachers.data = [['TeacherID', 'Name', 'AccessCode', 'Role', 'Active', 'Email', 'WhatsApp']]; }
}
const PAST = '2020-01-01', FUTURE = '2099-01-01';

function setup() {
  const env = world();
  teacherTab(env);
  addRow(env, 'Teachers', { TeacherID: 'T-1', Name: 'Ustadh Ali', AccessCode: 'teach-code-1', Role: 'Teacher', Active: 'TRUE' });
  addRow(env, 'Teachers', { TeacherID: 'T-2', Name: 'Ustadh Bello', AccessCode: 'teach-code-2', Role: 'Teacher', Active: 'TRUE' });
  addRow(env, 'Students', { StudentID: 'HM-0001', Name: 'Paid Child', AccessCode: 'child-code-1', Level: 'Hifdh', Teacher: 'Ustadh Ali', NextDue: FUTURE, Active: 'TRUE' });
  addRow(env, 'Students', { StudentID: 'HM-0002', Name: 'Late Child', AccessCode: 'child-code-2', Level: 'Hifdh', Teacher: 'Ustadh Ali', NextDue: PAST, Active: 'TRUE' });
  addRow(env, 'Students', { StudentID: 'HM-0003', Name: 'Other Teachers Child', AccessCode: 'child-code-3', Level: 'Hifdh', Teacher: 'Ustadh Bello', NextDue: FUTURE, Active: 'TRUE' });
  addRow(env, 'Students', { StudentID: 'HM-0004', Name: 'Exempt Child', AccessCode: 'child-code-4', Level: 'Hifdh', Teacher: 'Ustadh Ali', NextDue: PAST, PaymentStatus: 'Exempt', Active: 'TRUE' });
  addRow(env, 'Students', { StudentID: 'HM-0005', Name: 'Teen Child', AccessCode: 'child-code-5', Level: 'Teenagers', Programme: 'TBC', Teacher: 'Ustadh Ali', NextDue: FUTURE, Active: 'TRUE' });
  return env;
}
const T1 = { programme: 'madrasah', id: 'T-1', code: 'teach-code-1' };
const T2 = { programme: 'madrasah', id: 'T-2', code: 'teach-code-2' };
const S = function (n) { return { programme: 'madrasah', id: 'HM-000' + n, code: 'child-code-' + n }; };

function makeGroup(env) {
  const r = call(env, Object.assign({ action: 'grp_t_create', name: 'Hifdh A', studentIds: ['HM-0001', 'HM-0002', 'HM-0004'] }, T1));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.groups[0].GroupID;
}
function postClass(env, gid, extra) {
  return call(env, Object.assign({ action: 'grp_t_post', groupId: gid, kind: 'class', title: 'Today 5pm', body: 'Bring your mushaf', link: 'https://meet.google.com/abc-defg-hij', when: '2026-11-16T17:00', pinned: true }, T1, extra || {}));
}

test('a teacher makes a group of their own students and posts the class link', () => {
  const env = setup();
  const gid = makeGroup(env);
  const r = postClass(env, gid);
  assert.equal(r.ok, true, JSON.stringify(r));
  const g = r.groups[0];
  assert.equal(g.members.length, 3);
  assert.equal(g.lockedCount, 1);
  assert.equal(g.Posts[0].Link, 'https://meet.google.com/abc-defg-hij');
  assert.equal(g.Posts[0].Pinned, true);
});

test('a student who is up to date sees the posts and the class link', () => {
  const env = setup();
  postClass(env, makeGroup(env));
  const r = call(env, Object.assign({ action: 'grp_s_list' }, S(1)));
  assert.equal(r.ok, true);
  assert.equal(r.locked, false);
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].Teacher, 'Ustadh Ali');
  assert.equal(r.groups[0].Posts[0].Link, 'https://meet.google.com/abc-defg-hij');
});

test('an overdue student gets no posts and no link, only a message', () => {
  const env = setup();
  postClass(env, makeGroup(env));
  const r = call(env, Object.assign({ action: 'grp_s_list' }, S(2)));
  assert.equal(r.ok, true);
  assert.equal(r.locked, true);
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.groups[0].Posts, []);
  assert.ok(r.message.length > 0 && r.payLink);
  const text = JSON.stringify(r);
  assert.equal(text.indexOf('meet.google.com'), -1);
  assert.equal(text.indexOf('Bring your mushaf'), -1);
});

test('the student unlocks as soon as the due date moves forward', () => {
  const env = setup();
  postClass(env, makeGroup(env));
  assert.equal(call(env, Object.assign({ action: 'grp_s_list' }, S(2))).locked, true);
  const sh = env.sheets.Students, col = sh.data[0].indexOf('NextDue');
  sh.data[2][col] = FUTURE;
  const r = call(env, Object.assign({ action: 'grp_s_list' }, S(2)));
  assert.equal(r.locked, false);
  assert.equal(r.groups[0].Posts.length, 1);
});

test('exempt students are never locked', () => {
  const env = setup();
  postClass(env, makeGroup(env));
  const r = call(env, Object.assign({ action: 'grp_s_list' }, S(4)));
  assert.equal(r.locked, false);
  assert.equal(r.groups[0].Posts.length, 1);
});

test('the day of the due date is still allowed, the day after is locked', () => {
  const env = setup();
  postClass(env, makeGroup(env));
  const today = env.run('today_()'), yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const sh = env.sheets.Students, col = sh.data[0].indexOf('NextDue');
  sh.data[1][col] = today;
  assert.equal(call(env, Object.assign({ action: 'grp_s_list' }, S(1))).locked, false);
  sh.data[1][col] = yesterday;
  assert.equal(call(env, Object.assign({ action: 'grp_s_list' }, S(1))).locked, true);
});

test('a student not in the group sees nothing of it', () => {
  const env = setup();
  postClass(env, makeGroup(env));
  const r = call(env, Object.assign({ action: 'grp_s_list' }, S(3)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.groups, []);
});

test('a teacher cannot add another teacher\'s student', () => {
  const env = setup();
  const r = call(env, Object.assign({ action: 'grp_t_create', name: 'Mixed', studentIds: ['HM-0001', 'HM-0003'] }, T1));
  assert.equal(r.ok, false);
  assert.match(r.error, /own students/);
});

test('a teacher cannot read, post to, edit or delete another teacher\'s group', () => {
  const env = setup();
  const gid = makeGroup(env);
  postClass(env, gid);
  assert.deepEqual(call(env, Object.assign({ action: 'grp_t_list' }, T2)).groups, []);
  assert.equal(postClass(env, gid, T2).ok, false);
  assert.equal(call(env, Object.assign({ action: 'grp_t_members', groupId: gid, studentIds: ['HM-0001'] }, T2)).ok, false);
  assert.equal(call(env, Object.assign({ action: 'grp_t_rename', groupId: gid, name: 'Mine now' }, T2)).ok, false);
  assert.equal(call(env, Object.assign({ action: 'grp_t_delete', groupId: gid }, T2)).ok, false);
  const post = call(env, Object.assign({ action: 'grp_t_list' }, T1)).groups[0].Posts[0];
  assert.equal(call(env, Object.assign({ action: 'grp_t_unpost', postId: post.PostID }, T2)).ok, false);
  assert.equal(call(env, Object.assign({ action: 'grp_t_list' }, T1)).groups[0].Posts.length, 1);
});

test('wrong sign-in is refused, and a student cannot use a teacher action', () => {
  const env = setup();
  assert.equal(call(env, { action: 'grp_t_list', programme: 'madrasah', id: 'T-1', code: 'nope' }).ok, false);
  assert.equal(call(env, { action: 'grp_s_list', programme: 'madrasah', id: 'HM-0001', code: 'nope' }).ok, false);
  assert.equal(call(env, Object.assign({ action: 'grp_t_list' }, S(1))).ok, false);   // student ID is not a teacher ID
  assert.equal(call(env, Object.assign({ action: 'grp_s_list', programme: 'bogus' }, { id: 'HM-0001', code: 'child-code-1' })).ok, false);
});

test('a student cannot sign in to the wrong programme', () => {
  const env = setup();
  assert.equal(call(env, { action: 'grp_s_list', programme: 'tbc', id: 'HM-0001', code: 'child-code-1' }).ok, false);
  assert.equal(call(env, { action: 'grp_s_list', programme: 'madrasah', id: 'HM-0005', code: 'child-code-5' }).ok, false);
  assert.equal(call(env, { action: 'grp_s_list', programme: 'tbc', id: 'HM-0005', code: 'child-code-5' }).ok, true);
});

test('post checks: link scheme, class needs a link, length limits, formulas are stored as text', () => {
  const env = setup();
  const gid = makeGroup(env);
  assert.equal(postClass(env, gid, { link: 'javascript:alert(1)' }).ok, false);
  assert.equal(postClass(env, gid, { link: '' }).ok, false);
  assert.equal(postClass(env, gid, { when: 'tomorrow' }).ok, false);
  assert.equal(call(env, Object.assign({ action: 'grp_t_post', groupId: gid, kind: 'announcement', title: '', body: '' }, T1)).ok, false);
  const ok = call(env, Object.assign({ action: 'grp_t_post', groupId: gid, kind: 'announcement', title: '=HYPERLINK("x")', body: 'x'.repeat(5000) }, T1));
  assert.equal(ok.ok, true);
  assert.equal(ok.groups[0].Posts[0].Body.length, 2000);
});

test('pinning a new class post unpins the old one; unpost removes a post; members can be changed', () => {
  const env = setup();
  const gid = makeGroup(env);
  postClass(env, gid);
  const r = postClass(env, gid, { title: 'Tomorrow 5pm' });
  assert.equal(r.groups[0].Posts.filter(function (p) { return p.Pinned; }).length, 1);
  assert.equal(r.groups[0].Posts[0].Title, 'Tomorrow 5pm');
  const del = call(env, Object.assign({ action: 'grp_t_unpost', postId: r.groups[0].Posts[0].PostID }, T1));
  assert.equal(del.groups[0].Posts.length, 1);
  const m = call(env, Object.assign({ action: 'grp_t_members', groupId: gid, studentIds: ['HM-0001'] }, T1));
  assert.deepEqual(m.groups[0].members.map(function (x) { return x.id; }), ['HM-0001']);
  assert.deepEqual(call(env, Object.assign({ action: 'grp_s_list' }, S(2))).groups, []);   // removed from the group
});

test('a deleted group disappears for the teacher and the students', () => {
  const env = setup();
  const gid = makeGroup(env);
  call(env, Object.assign({ action: 'grp_t_delete', groupId: gid }, T1));
  assert.deepEqual(call(env, Object.assign({ action: 'grp_t_list' }, T1)).groups, []);
  assert.deepEqual(call(env, Object.assign({ action: 'grp_s_list' }, S(1))).groups, []);
});

test('the old per-student class link and reminder also respect the fee rule', () => {
  const env = setup();
  const sh = env.sheets.Students, head = sh.data[0];
  sh.data[1][head.indexOf('ClassLink')] = 'https://meet.example/old';
  sh.data[2][head.indexOf('ClassLink')] = 'https://meet.example/old';
  const paid = env.run("payload_(table_('Students').rows[0]).student");
  const late = env.run("payload_(table_('Students').rows[1]).student");
  assert.equal(paid.ClassLink, 'https://meet.example/old');
  assert.equal(late.ClassLink, '');
  assert.equal(late.ClassLocked, true);
});

test('Academy and Skills groups use their own tutors and students', () => {
  const env = setup();
  addRow(env, 'AcademyTutors', { TutorID: 'MT-1', Name: 'Mentor One', AccessCode: 'mentor-code-1', Role: 'Tutor', Active: 'TRUE' });
  addRow(env, 'AcademyStudents', { StudentID: 'AC-0001', Name: 'Ibrahim', AccessCode: 'acad-code-1', Track: 'UTME', TutorID: 'MT-1', NextDue: FUTURE, Active: 'TRUE' });
  addRow(env, 'AcademyStudents', { StudentID: 'AC-0002', Name: 'Late Ibrahim', AccessCode: 'acad-code-2', Track: 'UTME', TutorID: 'MT-1', NextDue: PAST, Active: 'TRUE' });
  const M = { programme: 'academy', id: 'MT-1', code: 'mentor-code-1' };
  const g = call(env, Object.assign({ action: 'grp_t_create', name: 'UTME Maths', studentIds: ['AC-0001', 'AC-0002'] }, M));
  assert.equal(g.ok, true, JSON.stringify(g));
  call(env, Object.assign({ action: 'grp_t_post', groupId: g.groups[0].GroupID, kind: 'class', title: 'Maths', link: 'https://meet.example/maths' }, M));
  const ok = call(env, { action: 'grp_s_list', programme: 'academy', id: 'AC-0001', code: 'acad-code-1' });
  assert.equal(ok.locked, false);
  assert.equal(ok.groups[0].Posts[0].Link, 'https://meet.example/maths');
  const late = call(env, { action: 'grp_s_list', programme: 'academy', id: 'AC-0002', code: 'acad-code-2' });
  assert.equal(late.locked, true);
  assert.equal(JSON.stringify(late).indexOf('meet.example'), -1);
});

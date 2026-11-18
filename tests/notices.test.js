const test = require('node:test'), assert = require('node:assert');
const { createEnv } = require('./helpers/gas.js');
function env() {
  const e = createEnv();
  e.run("tchEnsure_(ss_(), 'Announcements', SHEETS['Announcements'])");
  return e;
}
const RAB = 'Rābiʿah Ibtidā’iyyah';
test('exclusion keeps the level out and everyone else in', () => {
  const e = env();
  assert.equal(e.run("ann_ok_('MADRASAH, -" + RAB + "', ['MADRASAH','S1','HIFDH'])"), true);
  assert.equal(e.run("ann_ok_('MADRASAH, -" + RAB + "', ['MADRASAH','S2',key_('" + RAB + "')])"), false);
  assert.equal(e.run("ann_ok_('" + RAB + "', ['MADRASAH',key_('" + RAB + "')])"), true);
  assert.equal(e.run("ann_ok_('" + RAB + "', ['MADRASAH','HIFDH'])"), false);
  assert.equal(e.run("ann_ok_('', ['MADRASAH'])"), true);
});
test('postExamNotice posts three notices once', () => {
  const e = env();
  assert.match(e.run('postExamNotice()'), /3 notice/);
  assert.match(e.run('postExamNotice()'), /0 notice/);
  const rows = e.run("table_('Announcements').rows.map(function(r){return {T:r.Title,A:r.Audience};})");
  assert.equal(rows.length, 3);
});
test('teachers see only teacher notices; blank audience stays student-only', () => {
  const e = env();
  e.run('postExamNotice()');
  e.run("append_(table_('Announcements'), {Date:'2026-11-18', Title:'For students', Body:'x', Audience:''}, ['Date'])");
  const n = e.run("tchNotices_({TeacherID:'T1'})");
  assert.equal(n.length, 1);
  assert.match(n[0].Body, /20 to 24 January 2027/);
  assert.match(n[0].Body, /5 to 12 December 2026/);
});

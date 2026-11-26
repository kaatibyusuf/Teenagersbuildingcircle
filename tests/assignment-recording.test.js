'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

const AUDIO = Buffer.alloc(5000, 7).toString('base64');
function setup() {
  const env = createEnv(), saved = [];
  env.ctx.Utilities.base64Decode = (s) => Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b));
  env.ctx.Utilities.newBlob = (bytes, mime, name) => ({ bytes, mime, name });
  const folder = { getId: () => 'FOLDER', getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => folder,
    createFile: (blob) => { const f = { id: 'F' + (saved.length + 1), blob, trashed: false, getId() { return this.id; }, setDescription() {}, setTrashed(v) { this.trashed = v; } }; saved.push(f); return f; } };
  env.ctx.DriveApp = { getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => folder, getFolderById: () => folder, getFileById: (id) => saved.find((f) => f.id === id) };
  env.saved = saved;
  env.run("['Assignments', 'Submissions'].forEach(function (n) { tchEnsure_(ss_(), n, SHEETS[n]); })");
  env.run("append_(table_('Assignments'), { AssignmentID: 'A-1', Title: 'Recite Hadith 1 of an-Nawawi', Level: 'All', Audience: 'All', Active: 'TRUE', Due: '2099-01-01' }, [])");
  env.run("append_(table_('Assignments'), { AssignmentID: 'A-2', Title: 'Written work', Level: 'All', Audience: 'All', Active: 'TRUE', Due: '2099-01-01' }, [])");
  return env;
}
const st = { StudentID: 'HM-0001', Name: 'Amina Yusuf', Level: 'Beginner', Plan: 'Full Madrasah' };
const rows = (env, tab) => { const d = env.sheets[tab].data, h = d[0]; return d.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const send = (env, p) => env.call('rec_submit_', st, Object.assign({ audio: AUDIO, mime: 'audio/webm', ext: 'webm', seconds: 30 }, p));
const view = (env) => env.call('assignmentsFor_', st);

test('a recording sent for an assignment counts as handing it in', () => {
  const env = setup();
  assert.equal(view(env).find((a) => a.AssignmentID === 'A-1').Status, 'To do');
  const r = send(env, { assignmentId: 'A-1' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const a = view(env).find((x) => x.AssignmentID === 'A-1');
  assert.equal(a.Status, 'Submitted');
  assert.equal(a.Submission.Note, 'Voice recording');
  assert.equal(a.Submission.Rec.Seconds, 30);
  assert.match(a.Submission.Rec.RecID, /^R-/);
  const rec = rows(env, 'Recordings')[0];
  assert.equal(rec.AssignmentID, 'A-1'); assert.equal(rec.Type, 'Assignment'); assert.equal(rec.Portion, 'Recite Hadith 1 of an-Nawawi');
  assert.equal(view(env).find((x) => x.AssignmentID === 'A-2').Status, 'To do');
});

test('no surah or ayah is needed for an assignment, but a normal recitation still needs them', () => {
  const env = setup();
  assert.equal(send(env, { assignmentId: 'A-1' }).ok, true);
  assert.match(send(env, { type: 'New lesson' }).error, /surah/i);
  assert.equal(send(env, { type: 'New lesson', surah: 'Al-Fātiḥah', fromAyah: 1, toAyah: 7 }).ok, true);
});

test('handing in again replaces the earlier recording and its file', () => {
  const env = setup();
  send(env, { assignmentId: 'A-1', note: 'First try' });
  send(env, { assignmentId: 'A-1', note: 'Better' });
  assert.equal(rows(env, 'Recordings').length, 1);
  assert.equal(rows(env, 'Submissions').length, 1);
  assert.equal(rows(env, 'Submissions')[0].Note, 'Better');
  assert.equal(env.saved[0].trashed, true); assert.equal(env.saved[1].trashed, false);
});

test('an unknown or already marked assignment is refused and nothing is saved', () => {
  const env = setup();
  assert.match(send(env, { assignmentId: 'A-NOPE' }).error, /not found/);
  send(env, { assignmentId: 'A-1' });
  env.run("var t = table_('Submissions'); put_(t, 2, 'Score', 9)");
  assert.match(send(env, { assignmentId: 'A-1' }).error, /already been marked/);
  assert.equal(rows(env, 'Recordings').length, 1);
});

test('assignment recordings do not fill the "waiting for your teacher" limit or the recitation list', () => {
  const env = setup();
  env.run("append_(table_('Assignments'), { AssignmentID: 'A-3', Title: 'Third', Level: 'All', Audience: 'All', Active: 'TRUE' }, [])");
  ['A-1', 'A-2', 'A-3'].forEach((id) => assert.equal(send(env, { assignmentId: id }).ok, true));
  for (let i = 0; i < 3; i++) assert.equal(send(env, { type: 'Revision', surah: 'An-Nās' }).ok, true, 'recitation ' + i);
  const R = env.call('rec_forStudent_', st);
  assert.equal(R.items.length, 3);
  assert.ok(R.items.every((x) => !x.AssignmentID));
});

test('the teacher sees the voice answer on the assignment, can hear it, and cannot mark it as a recitation', () => {
  const env = setup();
  send(env, { assignmentId: 'A-1' });
  const all = env.call('rec_assignMapAll_');
  assert.equal(all['A-1|HM-0001'].Seconds, 30);
  assert.equal(env.call('rec_forTeacher_', {}, [{ StudentID: 'HM-0001', Name: 'Amina Yusuf' }]).length, 0);
  const recId = rows(env, 'Recordings')[0].RecID;
  env.run("tchOne_ = function () { return { row: {}, t: {} }; }");
  assert.match((() => { try { env.call('rec_mark_', {}, { recId, result: 'Pass' }); return ''; } catch (e) { return e.message; } })(), /Assignments tab/);
});

test('a student cannot withdraw an assignment recording from the recitation list', () => {
  const env = setup();
  send(env, { assignmentId: 'A-1' });
  const recId = rows(env, 'Recordings')[0].RecID;
  assert.match(env.call('rec_withdraw_', st, { recId }).error, /answer to an assignment/);
});

test('an older Recordings tab gets the new column by itself', () => {
  const env = setup();
  env.run("tchEnsure_(ss_(), 'Recordings', REC_HEADERS.slice(0, REC_HEADERS.length - 1))");
  assert.equal(env.sheets['Recordings'].data[0].includes('AssignmentID'), false);
  assert.equal(send(env, { assignmentId: 'A-1' }).ok, true);
  assert.equal(env.sheets['Recordings'].data[0].includes('AssignmentID'), true);
  assert.equal(rows(env, 'Recordings')[0].AssignmentID, 'A-1');
});

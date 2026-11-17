'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createEnv } = require('./helpers/gas');
const up = require('../frontend/js/assign-upload.js');

const FE = path.join(__dirname, '..', 'frontend');
function crc32(buf) { let c, crc = -1; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ -1) >>> 0; }
function zip(entries) {
  const parts = []; entries.forEach(([name, data]) => { const n = Buffer.from(name), d = Buffer.from(data), h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt32LE(crc32(d), 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26); parts.push(h, n, d); });
  return Buffer.concat(parts);
}
const pad = (b, n) => Buffer.concat([b, Buffer.alloc(Math.max(0, n - b.length), 1)]);
const FILES = {
  pdf: pad(Buffer.from('%PDF-1.4\n'), 600),
  png: pad(Buffer.from([0x89, 0x50, 0x4E, 0x47, 13, 10, 26, 10]), 600),
  jpg: pad(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), 600),
  webp: pad(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]), 600),
  docx: zip([['[Content_Types].xml', '<Types/>'], ['word/document.xml', '<w:document>' + 'x'.repeat(500) + '</w:document>']])
};
const b64 = (b) => b.toString('base64');

function setup() {
  const env = createEnv(), saved = [];
  env.ctx.Utilities.base64Decode = (s) => Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b));
  env.ctx.Utilities.newBlob = (bytes, mime, name) => ({ bytes, mime, name });
  env.ctx.Utilities.unzip = (blob) => {
    const b = Buffer.from(blob.bytes.map((x) => x & 255)), out = []; let i = 0;
    while (i + 30 <= b.length && b.readUInt32LE(i) === 0x04034b50) { const size = b.readUInt32LE(i + 18), nl = b.readUInt16LE(i + 26), name = b.slice(i + 30, i + 30 + nl).toString(); out.push({ getName: () => name }); i += 30 + nl + size; }
    if (!out.length) throw new Error('not a zip');
    return out;
  };
  const folder = { getId: () => 'FOLDER', getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => folder,
    createFile: (blob) => { const f = { id: 'F' + (saved.length + 1), blob, shared: null, getId() { return this.id; }, setDescription() {}, setSharing(a, p) { this.shared = [a, p]; } }; saved.push(f); return f; } };
  env.ctx.DriveApp = { getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => folder, getFolderById: () => folder, Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' } };
  env.saved = saved;
  env.run("['Assignments', 'Submissions'].forEach(function (n) { tchEnsure_(ss_(), n, SHEETS[n]); })");
  env.run("append_(table_('Assignments'), { AssignmentID: 'A-1', Title: 'Fiqh of wudu', Level: 'All', Audience: 'All', Active: 'TRUE', Due: '2099-01-01' }, [])");
  return env;
}
const st = { StudentID: 'HM-0001', Name: 'Amina Yusuf', Level: 'Beginner' };
const submit = (env, p) => env.call('submit_', st, Object.assign({ assignmentId: 'A-1' }, p));
const subs = (env) => { const d = env.sheets['Submissions'].data, h = d[0]; return d.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };

test('a student can hand in each allowed kind of file; its Drive link is stored for the teacher', () => {
  ['pdf', 'png', 'jpg', 'webp', 'docx'].forEach((ext, i) => {
    const env = setup();
    const r = submit(env, { file: b64(FILES[ext]), ext, fname: 'My work.' + ext });
    assert.equal(r.ok, true, ext + ' ' + JSON.stringify(r));
    assert.match(subs(env)[0].Link, /^https:\/\/drive\.google\.com\/file\/d\/F1\/view$/);
    assert.deepEqual(env.saved[0].shared, ['ANYONE_WITH_LINK', 'VIEW']);
    assert.match(env.saved[0].blob.name, /^A-1 HM-0001 My work\.[a-z]+$/);
  });
});

test('wrong, fake, empty or huge files are refused and nothing is saved', () => {
  const env = setup();
  const bad = [[{ file: b64(FILES.pdf), ext: 'exe' }, /photo.*Word document.*PDF/], [{ file: b64(FILES.pdf), ext: 'docx' }, /not a real Word/], [{ file: b64(FILES.png), ext: 'pdf' }, /not a real PDF/],
    [{ file: b64(Buffer.from('hello')), ext: 'pdf' }, /empty/], [{ file: b64(zip([['readme.txt', 'x'.repeat(500)]])), ext: 'docx' }, /not a real Word/],
    [{ file: b64(pad(FILES.pdf, 8 * 1024 * 1024)), ext: 'pdf' }, /too large/], [{ file: '***', ext: 'pdf' }, /did not arrive/]];
  bad.forEach(([o, re]) => { const r = submit(env, o); assert.equal(r.ok, false, JSON.stringify(o).slice(0, 40)); assert.match(r.error, re); });
  assert.equal(env.saved.length, 0); assert.equal(env.sheets['Submissions'].data.length <= 1, true);
});

test('a note alone, a link alone, or a file alone all work; nothing at all does not', () => {
  assert.equal(submit(setup(), { note: 'Done.' }).ok, true);
  assert.equal(submit(setup(), { link: 'https://example.com/x' }).ok, true);
  assert.equal(submit(setup(), { file: b64(FILES.pdf), ext: 'pdf' }).ok, true);
  assert.match(submit(setup(), {}).error, /note, a file or a link/);
});

test('a student can replace their file; a student cannot flood Drive', () => {
  const env = setup();
  assert.equal(submit(env, { file: b64(FILES.pdf), ext: 'pdf' }).ok, true);
  assert.equal(submit(env, { file: b64(FILES.png), ext: 'png' }).ok, true);
  assert.equal(subs(env).length, 1); assert.match(subs(env)[0].Link, /F2/);
  for (let i = 0; i < 12; i++) submit(env, { file: b64(FILES.pdf), ext: 'pdf' });
  assert.match(submit(env, { file: b64(FILES.pdf), ext: 'pdf' }).error, /many files/);
});

test('the browser helper accepts the same kinds and size, and both portals use it', () => {
  assert.equal(up.check('work.PDF', 1000), ''); assert.equal(up.check('p.jpeg', 1000), ''); assert.equal(up.check('a.docx', 1000), '');
  assert.match(up.check('a.exe', 10), /photo/); assert.match(up.check('a.pdf', 8 * 1024 * 1024), /too large/);
  assert.equal(up.MAX, env_max());
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'add-assignment-files.js'), 'utf8');
  assert.ok(/dashboard/.test(script) && /tbc-dashboard/.test(script) && /HS_UPLOAD\.read\(pick\)/.test(script));
});
function env_max() { return Number(createEnv().run('AF_MAX_BYTES')); }

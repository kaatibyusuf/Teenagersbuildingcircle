'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

const note = (p) => createEnv().call('sn_build_', p);
const text = (n) => [n.greeting].concat(n.paragraphs, [n.focus, n.closing]).join('\n');
const base = () => ({
  student: { StudentID: 'HM-1', Name: 'Amina Yusuf', AttendancePresent: 27, AttendanceTotal: 29, Juz: 3, CurrentSurah: 'Al-Baqarah', CurrentAyah: 142 },
  assignments: [{ Title: 'Fiqh of wudu', Status: 'Marked', MaxScore: 20, Submission: { Score: 18, Late: false } }, { Title: 'Seerah notes', Status: 'To do', Due: '2026-11-24' }],
  results: [{ Date: '2026-09-20', Subject: 'Fiqh', Score: 15, OutOf: 20 }, { Date: '2026-10-10', Subject: 'Tajwid', Score: 14, OutOf: 20 }, { Date: '2026-10-25', Subject: 'Fiqh', Score: 18, OutOf: 20 }, { Date: '2026-11-08', Subject: 'Tajwid', Score: 17, OutOf: 20 }],
  recordings: { enabled: true, items: [
    { Status: 'Marked', Submitted: '2026-11-10', Memorisation: 9, Tajwid: 6, Fluency: 4, Total: { Score: 19, OutOf: 25 }, Feedback: 'Slow down on the madd rules.', Portion: 'Al-Mulk 1-30' },
    { Status: 'Marked', Submitted: '2026-11-03', Memorisation: 8, Tajwid: 6, Fluency: 4, Total: { Score: 18, OutOf: 25 } }] },
  routine: { enabled: true, streak: 9, best: 12, fullDays: 31 }, hifdh: [{ Surah: 'Al-Ikhlas', Status: 'Memorised' }]
});

test('the note is built only from the student\'s own record and uses their numbers', () => {
  const n = note(base()), t = text(n);
  assert.match(n.greeting, /Amina/);
  assert.match(t, /(93% \(27 of 29 classes\)|27 of 29 classes \(93%\))/); assert.match(t, /9 days in a row/); assert.match(t, /Fiqh of wudu/); assert.match(t, /tajwīd/);
  assert.match(t, /Slow down on the madd rules/); assert.match(t, /Juz 3/); assert.match(t, /Al-Baqarah/);
  assert.match(n.focus, /tajwīd/);
  assert.ok(n.paragraphs.length >= 4 && n.paragraphs.every((p) => p.length > 20));
  assert.doesNotMatch(t, /undefined|NaN|null|\[object/);
});

test('a struggling student is told the truth, kindly, and the first thing to fix is named', () => {
  const p = { student: { StudentID: 'HM-2', Name: 'Yusuf Bello', AttendancePresent: 9, AttendanceTotal: 20 },
    assignments: [{ Title: 'Tawheed worksheet', Status: 'Overdue' }, { Title: 'Fiqh of salah', Status: 'Overdue' }, { Title: 'Seerah', Status: 'Overdue' }],
    results: [{ Date: '2026-09-20', Subject: 'Fiqh', Score: 10, OutOf: 20 }], recordings: { enabled: true, items: [] }, routine: { enabled: true, streak: 0, best: 3, fullDays: 4 }, hifdh: [] };
  const n = note(p), t = text(n);
  assert.equal(n.mood, 'struggling'); assert.match(t, /45%/); assert.match(t, /honest/); assert.match(t, /overdue/);
  assert.match(t, /"Tawheed worksheet", "Fiqh of salah" and 1 more/); assert.match(n.focus, /Tawheed worksheet/);
  assert.doesNotMatch(t, /you are doing well|strong/i);
});

test('someone with no record yet gets an honest note, not praise', () => {
  const n = note({ student: { StudentID: 'HM-3', Name: 'Zainab', AttendancePresent: 1, AttendanceTotal: 2 }, assignments: [], results: [], recordings: { enabled: true, items: [] }, routine: { enabled: true, streak: 0, best: 0, fullDays: 0 }, hifdh: [] });
  assert.equal(n.mood, 'new'); assert.match(text(n), /still early/); assert.match(n.focus, /first recitation/); assert.doesNotMatch(text(n), /\b\d+%/);
});

test('the signals are read together: strong attendance but weak recitation, or weak attendance but good marks', () => {
  assert.match(text(note(base())), /precision, not effort/);
  const p = base(); p.student.AttendancePresent = 10; p.student.AttendanceTotal = 20;
  assert.match(text(note(p)), /when you are present, you do well/);
});

test('it is stable within a week and does not break on odd data', () => {
  const a = text(note(base())), b = text(note(base()));
  assert.equal(a, b);
  const odd = note({ student: { StudentID: 'X', Name: '' }, assignments: [{ Title: 'T', Status: 'Marked', MaxScore: '', Submission: { Score: '' } }], results: [{ Subject: 'S', Score: 'x', OutOf: 0 }], recordings: { enabled: false, items: [{ Status: 'Marked' }] }, hifdh: [{ Surah: 'A' }] });
  assert.ok(odd.paragraphs.length >= 1); assert.doesNotMatch(text(odd), /undefined|NaN|null/);
  assert.ok(note({}).paragraphs.length >= 1);
});

test('the dashboard payload carries the note, and a failing note never blocks a login', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'backend', 'Code.gs'), 'utf8');
  assert.match(src, /function payload_\(st\) \{\s*const out = payloadBase_\(st\);\s*try \{ if \(typeof sn_build_ === 'function'\) out\.note = sn_build_\(out\); \} catch \(e\)/);
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '..', 'scripts', 'add-student-note.js'), 'utf8'), /function noteCard/);
});

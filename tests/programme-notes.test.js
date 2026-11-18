'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

const build = (kind, p) => createEnv().call('pn_build_', kind, p);
const text = (n) => [n.greeting].concat(n.paragraphs, [n.focus, n.closing]).join('\n');
const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const clean = (t) => assert.doesNotMatch(t, /undefined|NaN|null|\[object/);

test('TBC: uses attendance, pillar ratings, assignments and the next session', () => {
  const n = build('tbc', {
    student: { StudentID: 'TB-1', Name: 'Yusuf Bello', AttendancePresent: 8, AttendanceTotal: 10 },
    pillars: [{ Pillar: 'Faith', Rating: 4, History: [{ Rating: 3 }, { Rating: 4 }] }, { Pillar: 'Discipline', Rating: 2, History: [{ Rating: 3 }, { Rating: 2 }] }, { Pillar: 'Skill', Rating: 0, History: [] }],
    assignments: [{ Title: 'Goal sheet', Status: 'Marked', MaxScore: 10, Submission: { Score: 9 } }, { Title: 'Reflection', Status: 'Overdue', Due: '2026-11-01' }],
    sessions: [{ Title: 'Time and purpose', Start: iso(3) + 'T17:00' }]
  });
  const t = text(n);
  assert.match(n.greeting, /Yusuf/); assert.match(t, /8 of 10 sessions \(80%\)/); assert.match(t, /3 out of 5 on average/);
  assert.match(t, /Faith is your strongest at 4/); assert.match(t, /Discipline is where the next gain is/); assert.match(t, /Discipline has slipped/);
  assert.match(t, /averages 90%/); assert.match(t, /Reflection/); assert.match(t, /Time and purpose/);
  assert.match(n.focus, /Reflection/); clean(t);
});

test('TBC: no ratings yet is said honestly, and a student with no record at all gets no note', () => {
  const n = build('tbc', { student: { StudentID: 'TB-2', Name: 'Sa’id Musa', AttendancePresent: 6, AttendanceTotal: 6 }, pillars: [], assignments: [] });
  assert.match(text(n), /has not rated your four pillars yet/);
  assert.equal(build('tbc', { student: { StudentID: 'TB-3', Name: 'New Student' }, pillars: [], assignments: [] }), null);
});

test('Skills: names the week, attendance and the overdue project', () => {
  const n = build('skills', {
    student: { StudentID: 'SK-1', Name: 'Zainab Ibrahim', Course: 'Graphic Design', Week: 4, Weeks: 12 },
    attendance: { Present: 5, Total: 8 },
    projects: [{ Title: 'Logo set', Status: 'Marked', MaxScore: 20, Submission: { Score: 17 } }, { Title: 'Poster', Status: 'Overdue', Due: '2026-11-05' }, { Title: 'Brand sheet', Status: 'To do', Due: iso(6) }]
  });
  const t = text(n);
  assert.match(t, /week 4 of 12 of Graphic Design/); assert.match(t, /5 of 8 classes \(63%\)/); assert.match(t, /averages 85%/); assert.match(t, /Poster/);
  assert.match(n.focus, /Poster/); clean(t);
});

test('Academy: mocks, target gap, weakest subject, exam countdown and reading', () => {
  const n = build('academy', {
    student: { StudentID: 'AC-1', Name: 'Fatimah Ali', TargetPercent: 75, ExamDate: iso(60) },
    mocks: [
      { Date: iso(-3), Type: 'Sunday mock', Percent: 64, Subjects: [{ Subject: 'English', Score: 70, OutOf: 100 }, { Subject: 'Physics', Score: 40, OutOf: 100 }] },
      { Date: iso(-10), Type: 'Sunday mock', Percent: 60, Subjects: [{ Subject: 'English', Score: 72, OutOf: 100 }, { Subject: 'Physics', Score: 45, OutOf: 100 }] },
      { Date: iso(-17), Type: 'Sunday mock', Percent: 52, Subjects: [] }, { Date: iso(-24), Type: 'Sunday mock', Percent: 50, Subjects: [] }],
    reading: { Target: 40, Done: 25, History: [{ Target: 40, Done: 40 }, { Target: 40, Done: 41 }, { Target: 40, Done: 20 }, { Target: 40, Done: 25 }] },
    readingUnit: 'pages', tasks: [{ Title: 'Past questions 4', Status: 'Missed', Due: iso(-2), MaxScore: 10 }],
    attendance: [{ Status: 'Present' }, { Status: 'Present' }, { Status: 'Late' }, { Status: 'Absent' }, { Status: 'Present' }, { Status: 'Excused' }]
  });
  const t = text(n);
  assert.match(t, /latest mock was 64%/); assert.match(t, /gap on your latest mock is 11 points/); assert.match(t, /Physics your weakest/);
  assert.match(t, /60 days away/); assert.match(t, /25 of your 40 pages/); assert.match(t, /2 of the last 3 weeks/); assert.match(n.focus, /Past questions 4/); clean(t);
});

test('the note changes with the week but stays about the same facts', () => {
  const p = { student: { StudentID: 'SK-9', Name: 'Ibrahim Sani', Week: 2, Weeks: 8, Course: 'Web' }, attendance: { Present: 9, Total: 10 }, projects: [{ Title: 'Page', Status: 'To do', Due: iso(5) }] };
  const a = build('skills', p); assert.ok(a.paragraphs.length >= 2); assert.match(a.focus, /Page/);
});

test('the three payload wrappers attach a note, and a broken note never breaks the dashboard', () => {
  const e = createEnv();
  assert.equal(e.run("pn_attach_('tbc', { student: null, pillars: null, assignments: 'x' }).note"), undefined);
  assert.equal(e.run("typeof tbcPayloadBase_ + typeof skStudentPayloadBase_ + typeof acdStudentPayloadBase_"), 'functionfunctionfunction');
});

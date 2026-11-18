/**
 * Notices.gs - who sees a portal announcement, and the exam-dates notice.
 *
 * Announcements tab: Date, Title, Body, Audience.
 *   Students: MADRASAH (everyone), a StudentID, or a level name. Put a minus sign before a level to leave it out,
 *             e.g.  MADRASAH, -Rābiʿah Ibtidāʾiyyah   (everyone except that level).
 *   Teachers: TEACHERS, ALL, or a TeacherID. A blank audience is for students only.
 *
 * Run once from the editor:  postExamNotice   (it will not post twice).
 */
const NOTICE_RABIAH_ = 'Rābiʿah Ibtidā’iyyah';

function ann_ok_(cell, allowed) {
  const parts = String(cell == null ? '' : cell).split(/[,;]+/).map(key_).filter(Boolean);
  const out = parts.filter(function (p) { return p.charAt(0) === '-'; }).map(function (p) { return key_(p.slice(1)); });
  if (out.some(function (n) { return allowed.indexOf(n) >= 0; })) return false;
  const pos = parts.filter(function (p) { return p.charAt(0) !== '-'; });
  if (!pos.length) return true;
  return pos.some(function (p) { return p === 'ALL' || allowed.indexOf(p) >= 0; });
}

function tchNotices_(me) {
  const mine = ['TEACHERS', key_(me.TeacherID)];
  return table_('Announcements').rows.filter(function (r) {
    return r.Title && String(r.Audience || '').trim() && ann_ok_(r.Audience, mine);
  }).map(function (r) { return { Date: iso_(r.Date), Title: r.Title, Body: r.Body }; })
    .sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 20);
}

function postExamNotice() {
  const t = table_('Announcements'), have = {};
  t.rows.forEach(function (r) { have[String(r.Title)] = true; });
  const d = today_();
  const list = [
    { Title: 'Madrasah examinations: 20 to 24 January 2027',
      Body: 'Bismillah. The Madrasah examinations will hold from 20 to 24 January 2027, in shāʾ Allāh. Keep those days free and revise what you have been taught this term. If anything is unclear, ask your teacher early. The timetable for each paper will follow.',
      Audience: 'MADRASAH, -' + NOTICE_RABIAH_ },
    { Title: 'Final examinations: 5 to 12 December 2026',
      Body: 'Bismillah. Your final examinations begin on 5 December and end on 12 December 2026, in shāʾ Allāh. These dates are for Rābiʿah Ibtidāʾiyyah only and come before the rest of the Madrasah. Revise steadily, rest well before each paper, and ask your teacher about anything you are unsure of.',
      Audience: NOTICE_RABIAH_ },
    { Title: 'Madrasah examination dates',
      Body: 'The Madrasah examinations hold from 20 to 24 January 2027. The one exception is Rābiʿah Ibtidāʾiyyah, whose final examinations run from 5 to 12 December 2026. Please plan your syllabus and revision so that each class is ready by its date, and make sure your students know which dates apply to them.',
      Audience: 'TEACHERS' }
  ];
  let n = 0;
  list.forEach(function (x) {
    if (have[x.Title]) return;
    append_(t, { Date: d, Title: x.Title, Body: x.Body, Audience: x.Audience }, ['Date']);
    n++;
  });
  return n + ' notice(s) posted.';
}

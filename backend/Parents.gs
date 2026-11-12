/**
 * Parent view (Parents.gs). A read-only page for a parent or guardian, for all programmes: Madrasah, Teenagers Building Circle,
 * Academy and Skills School. Add this as a NEW file next to Code.gs, replace Code.gs, Codes.gs and Resets.gs with the updated copies,
 * and add parent.html to the website (see the notes that came with this file).
 *
 * HOW A PARENT SIGNS IN
 *  - With their child's Student ID (HM-0001, AC-0001, SK-0001) and a separate PARENT code. The child's own access code never works here,
 *    and the parent code never works on the child's dashboard. The parent code is stored protected, like every access code (Codes.gs).
 *  - Wrong attempts are limited the same way as the other sign-ins (15 minute lockout).
 *
 * HOW STAFF GIVE A PARENT A CODE
 *  - In any admin page, open "Reset code" and search for the child. A "Parent / guardian of <child>" entry appears. Press Reset code.
 *    The first time, the Parents tab row is created for you (using the child's email and WhatsApp number as the contact, which you can
 *    edit in the tab). The code is shown once and can be emailed or sent on WhatsApp. Pressing it again later gives a new code.
 *  - Madrasah/TBC admins can do this for Madrasah and TBC children, Academy admins for Academy, Skills admins for Skills, and the owner for all.
 *  - To stop a parent's access, set Active to FALSE in the Parents tab.
 *
 * WHAT A PARENT SEES (their own child only): fee status and recent payments, attendance, progress (hifdh and results, pillars, mocks and
 * scores, or course week), marked work with the teacher's feedback, and the school announcements. NEVER class links, the child's access code,
 * other students, or leaderboards of other students.
 */
const PAR_TAB = 'Parents';
const PAR_HEAD = ['ParentID', 'Name', 'AccessCode', 'Programme', 'StudentID', 'Email', 'WhatsApp', 'Active', 'Created'];
const PAR_SCOPE = { owner: ['madrasah', 'academy', 'skills'], admin: ['madrasah'], academy: ['academy'], skills: ['skills'] };
const PAR_STUDENT_TABS = { madrasah: 'Students', academy: 'AcademyStudents', skills: 'SkillsStudents' };
const PAR_LABEL = { madrasah: 'Madrasah', tbc: 'Teenagers Building Circle', academy: 'Himaayah Academy', skills: 'Skills School' };

function par_fail_(m) { throw new Error('USER:' + m); }
function par_tab_() {
  let sh = ss_().getSheetByName(PAR_TAB);
  if (!sh) { sh = ss_().insertSheet(PAR_TAB); sh.getRange(1, 1, 1, PAR_HEAD.length).setValues([PAR_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return table_(PAR_TAB);
}
function par_rows_(prog) { try { return table_(PAR_STUDENT_TABS[prog]).rows; } catch (e) { return []; } }

/* The child's row, whichever programme: { prog, st } or null. */
function par_student_(id) {
  const k = key_(id);
  if (!k) return null;
  const progs = Object.keys(PAR_STUDENT_TABS);
  for (let i = 0; i < progs.length; i++) {
    const st = par_rows_(progs[i]).filter(function (r) { return key_(r.StudentID) === k; })[0];
    if (st) return { prog: progs[i], st: st };
  }
  return null;
}

/* ---------- used by Resets.gs so the admin "Reset code" panel can create and reset parent codes ---------- */
function par_inScope_(who, prog) { return (PAR_SCOPE[who.role] || []).indexOf(prog) >= 0; }
function par_ensure_(who, studentId) {
  const f = par_student_(studentId);
  if (!f) par_fail_('That child was not found.');
  if (!par_inScope_(who, f.prog)) par_fail_('You are not allowed to give a parent code for that child.');
  const t = par_tab_(), id = String(f.st.StudentID).trim();
  const have = t.rows.filter(function (r) { return key_(r.ParentID) === key_(id); })[0];
  if (have) return have;
  append_(t, { ParentID: id, Name: 'Parent of ' + String(f.st.Name || id).trim(), AccessCode: '', Programme: f.prog, StudentID: id,
    Email: String(f.st.Email || '').trim(), WhatsApp: String(f.st.WhatsApp || '').trim(), Active: 'TRUE', Created: today_() }, ['ParentID', 'Name', 'Programme', 'StudentID', 'Email', 'WhatsApp']);
  return par_tab_().rows.filter(function (r) { return key_(r.ParentID) === key_(id); })[0];
}
function par_hits_(who, q, qd, out) {
  let parents = {};
  try { par_tab_().rows.forEach(function (r) { if (r.ParentID) parents[key_(r.ParentID)] = r; }); } catch (e) { parents = {}; }
  (PAR_SCOPE[who.role] || []).forEach(function (prog) {
    par_rows_(prog).forEach(function (s) {
      if (out.length >= RS_MAX_RESULTS) return;
      const id = String(s.StudentID || '').trim(); if (!id) return;
      const nm = String(s.Name || '').trim(), pr = parents[key_(id)];
      const em = pr ? String(pr.Email || '').trim() : String(s.Email || '').trim(), ph = pr ? String(pr.WhatsApp || '') : String(s.WhatsApp || '');
      const hit = id.toLowerCase().indexOf(q) >= 0 || nm.toLowerCase().indexOf(q) >= 0 || (em && em.toLowerCase().indexOf(q) >= 0) || (qd.length >= 4 && ph && rs_digits_(ph).indexOf(qd) >= 0);
      if (!hit) return;
      out.push({ kind: 'parent', kindLabel: 'Parent / guardian of ' + nm + (pr && String(pr.AccessCode || '').trim() ? '' : ' (no code yet)'), id: id, name: pr ? String(pr.Name || '') : 'Parent of ' + nm,
        active: key_(s.Active) !== 'FALSE' && (!pr || key_(pr.Active) !== 'FALSE'), emailMasked: rs_valid_(em) ? rs_mask_(em) : '', hasPhone: !!rs_digits_(ph), self: false });
    });
  });
}

/* ---------- sign-in ---------- */
function par_auth_(id, code) {
  id = key_(id).slice(0, 40); code = String(code || '').trim();
  if (!id || !code) return { error: 'Enter your child\'s Student ID and your parent code.' };
  const cache = CacheService.getScriptCache(), lk = 'lock:Parents:' + id, fk = 'fail:Parents:' + id;
  if (cache.get(lk)) return { error: 'Too many attempts. Please try again in 15 minutes.' };
  let row = null;
  try { row = par_tab_().rows.filter(function (r) { return key_(r.ParentID) === id; })[0]; } catch (e) { row = null; }
  const f = row ? par_student_(id) : null;
  const ok = row && f && key_(row.Active) !== 'FALSE' && key_(f.st.Active) !== 'FALSE' && String(row.AccessCode).trim() !== '' && code_ok_(row.AccessCode, code);
  if (!ok) {
    const n = Number(cache.get(fk) || 0) + 1;
    if (n >= LOCKOUT_TRIES) { cache.put(lk, '1', LOCKOUT_SECONDS); cache.remove(fk); } else cache.put(fk, String(n), LOCKOUT_SECONDS);
    return { error: 'Wrong ID or parent code.' };
  }
  cache.remove(fk);
  return { row: row, prog: f.prog, st: f.st };
}

/* ---------- what the parent sees ---------- */
function par_pct_(a, b) { return b > 0 ? Math.round(1000 * a / b) / 10 : null; }
function par_work_(items) {   // items: { Title, Status, Due, Score, MaxScore, Feedback }
  const c = { todo: 0, submitted: 0, overdue: 0, marked: 0 };
  items.forEach(function (x) { if (x.Status === 'Marked') c.marked++; else if (x.Status === 'Submitted') c.submitted++; else if (x.Status === 'Overdue' || x.Status === 'Missed') c.overdue++; else c.todo++; });
  const done = items.filter(function (x) { return x.Status === 'Marked'; }).sort(function (a, b) { return String(a.Due) < String(b.Due) ? 1 : -1; }).slice(0, 8)
    .map(function (x) { return { Title: String(x.Title || ''), Due: x.Due || '', Score: x.Score, OutOf: x.MaxScore || '', Feedback: String(x.Feedback || '') }; });
  return { counts: c, marked: done };
}
function par_news_(rows) { return rows.slice(0, 5).map(function (r) { return { Date: r.Date, Title: r.Title, Body: r.Body }; }); }
function par_payload_(prog, st) {
  const id = key_(st.StudentID), first = { id: String(st.StudentID).trim(), name: String(st.Name || '').trim() };
  const status = payStatus_(st);
  const fees = function (amount, payments) { return { status: status, nextDue: iso_(st.NextDue), amount: Number(amount) || 0, payments: payments.slice(0, 6), payLink: payLink_(st.StudentID) }; };
  const pays = function (rows) { return rows.map(function (r) { return { Date: iso_(r.Date), Amount: Number(r.Amount) || 0, Months: Number(r.Months) || 1, Reference: r.Reference }; }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }); };
  if (prog === 'madrasah' && typeof tbcIs_ === 'function' && tbcIs_(st)) {
    const p = tbc_payload_(st);
    const work = par_work_(p.assignments.map(function (a) { return { Title: a.Title, Status: a.Status, Due: a.Due, Score: a.Submission ? a.Submission.Score : '', MaxScore: a.MaxScore, Feedback: a.Submission ? a.Submission.Feedback : '' }; }));
    return { programme: 'tbc', child: { id: first.id, name: first.name, detail: p.student.Cohort || 'Teenagers Building Circle', teacher: p.student.Facilitator },
      fees: fees(p.student.MonthlyFee, p.payments), attendance: { present: p.student.AttendancePresent, total: p.student.AttendanceTotal, percent: par_pct_(p.student.AttendancePresent, p.student.AttendanceTotal) },
      progress: { kind: 'tbc', pillars: p.pillars.map(function (x) { return { Pillar: x.Pillar, Rating: x.Rating, Note: x.Note, Date: x.Date }; }) }, work: work, announcements: par_news_(p.announcements) };
  }
  if (prog === 'madrasah') {
    const mine = function (n) { return table_(n).rows.filter(function (r) { return key_(r.StudentID) === id; }); };
    const as = assignmentsFor_(st).map(function (a) { return { Title: a.Title, Status: a.Status, Due: a.Due, Score: a.Submission ? a.Submission.Score : '', MaxScore: a.MaxScore, Feedback: a.Submission ? a.Submission.Feedback : '' }; });
    const present = Number(st.AttendancePresent) || 0, total = Number(st.AttendanceTotal) || 0;
    return { programme: 'madrasah', child: { id: first.id, name: first.name, detail: [st.Level, st.Plan].filter(Boolean).join(' · '), teacher: String(st.Teacher || '') },
      fees: fees(st.MonthlyFee, pays(mine('Payments').filter(function (p) { return String(p.Status).trim().toLowerCase() === 'confirmed'; }))),
      attendance: { present: present, total: total, percent: par_pct_(present, total) },
      progress: { kind: 'madrasah', juz: Number(st.Juz) || 0, surah: String(st.CurrentSurah || ''), ayah: String(st.CurrentAyah || ''),
        hifdh: mine('Hifdh').filter(function (r) { return r.Surah; }).map(function (r) { return { Surah: r.Surah, Status: r.Status }; }),
        results: mine('Results').filter(function (r) { return r.Subject; }).map(function (r) { return { Date: iso_(r.Date), Type: r.Type, Subject: r.Subject, Score: r.Score, OutOf: r.OutOf }; }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 12) },
      work: par_work_(as),
      announcements: par_news_(table_('Announcements').rows.filter(function (r) { return r.Title && matches_(r.Audience, ['MADRASAH', id]); }).map(function (r) { return { Date: iso_(r.Date), Title: r.Title, Body: r.Body }; }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; })) };
  }
  if (prog === 'academy') {
    const p = acd_studentPayload_(st, ''), m = p.metrics || {};
    return { programme: 'academy', child: { id: first.id, name: first.name, detail: [p.student.Track, p.student.Group].filter(Boolean).join(' · '), teacher: p.student.Tutor },
      fees: fees(p.student.MonthlyFee, p.payments), attendance: { present: m.present || 0, total: m.sessions || 0, percent: par_pct_(m.present || 0, m.sessions || 0) },
      progress: { kind: 'academy', track: p.student.Track, examDate: p.student.ExamDate, target: p.student.TargetPercent, overall: m.overall, mocks: m.mocks, mockCount: m.mockCount, tasks: m.tasks, cbt: m.cbt,
        mockResults: (p.mocks || []).slice(0, 6), sundayMocks: (p.tests || []).filter(function (t) { return t.Kind === 'Sunday mock' && t.Last; }).slice(0, 6).map(function (t) { return { Title: t.Title, Score: t.Last.Score, OutOf: t.Last.OutOf, Date: String(t.Last.Submitted).slice(0, 10) }; }) },
      work: par_work_((p.tasks || []).map(function (t) { return { Title: t.Title, Status: t.Status, Due: t.Due, Score: t.Score, MaxScore: t.MaxScore, Feedback: t.Feedback }; })), announcements: par_news_(p.announcements) };
  }
  const p = sk_studentPayload_(st);
  return { programme: 'skills', child: { id: first.id, name: first.name, detail: [p.student.Course, p.student.Cohort].filter(Boolean).join(' · '), teacher: p.student.Tutor },
    fees: fees(p.student.Fee, p.payments), attendance: { present: p.attendance.Present, total: p.attendance.Total, percent: par_pct_(p.attendance.Present, p.attendance.Total) },
    progress: { kind: 'skills', course: p.student.Course, cohort: p.student.Cohort, week: p.student.Week, weeks: p.student.Weeks, status: p.student.Status, certificate: p.student.Certificate },
    work: par_work_((p.projects || []).map(function (x) { return { Title: x.Title, Status: x.Status, Due: x.Due, Score: x.Submission ? x.Submission.Score : '', MaxScore: x.MaxScore, Feedback: x.Submission ? x.Submission.Feedback : '' }; })), announcements: par_news_(p.announcements) };
}

/* ---------- entry point (called from doPost in Code.gs) ---------- */
function parentsFromRequest(p) {
  try {
    const op = String(p.action || '');
    const a = par_auth_(p.id, p.code);
    if (a.error) return { ok: false, error: a.error };
    if (op === 'par_view') {
      const out = par_payload_(a.prog, a.st);
      out.ok = true; out.programmeLabel = PAR_LABEL[out.programme]; out.parentName = String(a.row.Name || ''); out.today = today_();
      return out;
    }
    if (op === 'par_change') {
      const code = String(p.newCode || '').trim();
      if (code.length < 8 || code.length > 40) return { ok: false, error: 'Your new code must be 8 to 40 characters.' };
      if (/\s/.test(code)) return { ok: false, error: 'Your new code cannot contain spaces.' };
      if (code_ok_(a.row.AccessCode, code)) return { ok: false, error: 'Choose a code different from your current one.' };
      if (key_(code) === key_(a.row.ParentID)) return { ok: false, error: 'Do not use the Student ID as your code.' };
      const lock = LockService.getScriptLock(); lock.waitLock(20000);
      try { put_(par_tab_(), a.row._row, 'AccessCode', code, true); } finally { lock.releaseLock(); }
      return { ok: true };
    }
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    if (/^USER:/.test(String(err && err.message))) return { ok: false, error: String(err.message).slice(5) };
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

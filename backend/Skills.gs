/**
 * Himaayah Skills School backend (Public Speaking, Graphic Design, Data Analysis)
 *
 * Serves the three Skills School portals on the website:
 *   skills-dashboard.html  students   actions sk_login, sk_submit
 *   skills-tutor.html      tutors     actions skt_login, skt_project, skt_mark, skt_attendance, skt_class, skt_complete, skt_password
 *   skills-admin.html      admins     actions ska_login, ska_payment, ska_assign, ska_password
 *
 * Add this file to the SAME Apps Script project as Code.gs (it uses Code.gs helpers and
 * en_code from Enrol.gs).
 *
 * SETUP (once): run skillsSetup from the editor (or Himaayah menu → Set up the Skills School tabs).
 * It creates the Skills tabs and a first admin login, shown in a pop-up.
 *
 * Skills students get IDs like SK-0001. New Skills School enrolments from the website create
 * their account here automatically (see Enrol.gs).
 */

/* ===== SETTINGS ===== */
const SK_DASHBOARD_URL = 'https://www.himaayahschools.com/skills-dashboard.html';
const SK_ID_PREFIX = 'SK-';
const SK_COURSES = { 'Public Speaking': 4, 'Graphic Design': 6, 'Data Analysis': 8 };   // course → length in weeks
const SK_COHORTS = ['Cohort 1', 'Cohort 2'];   // offered in the admin "Assign" tab (any cohort already used is added too)
const SK_PAYMENT_REMINDER_DAYS = [7, 3, 0];

/* ===== TABS AND COLUMNS ===== */
const SK = { Students: 'SkillsStudents', Tutors: 'SkillsTutors', Admins: 'SkillsAdmins', Projects: 'SkillsProjects', Submissions: 'SkillsSubmissions', Attendance: 'SkillsAttendance', Payments: 'SkillsPayments', Announcements: 'SkillsAnnouncements' };
const SK_SHEETS = {
  SkillsStudents: ['StudentID', 'Name', 'AccessCode', 'Course', 'Cohort', 'TutorID', 'StartDate', 'Status', 'PaymentStatus', 'NextDue', 'Fee', 'Period', 'NextClass', 'ClassLink', 'Certificate', 'Email', 'WhatsApp', 'Active', 'Enrolled', 'Ref'],
  SkillsTutors: ['TutorID', 'Name', 'AccessCode', 'Role', 'Email', 'WhatsApp', 'Active'],
  SkillsAdmins: ['AdminID', 'Name', 'AccessCode', 'Email', 'Active'],
  SkillsProjects: ['ProjectID', 'Course', 'Cohort', 'Week', 'Title', 'Brief', 'Due', 'Link', 'MaxScore', 'Active', 'CreatedBy', 'Created'],
  SkillsSubmissions: ['SubmissionID', 'ProjectID', 'StudentID', 'Submitted', 'Link', 'Note', 'Score', 'Feedback', 'Marked', 'MarkedBy'],
  SkillsAttendance: ['StudentID', 'Date', 'Present', 'TutorID', 'Recorded'],
  SkillsPayments: ['PaymentID', 'StudentID', 'Date', 'Amount', 'Months', 'Reference', 'Method', 'ConfirmedBy', 'Recorded'],
  SkillsAnnouncements: ['Date', 'Title', 'Body', 'Audience']
};

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function skillsFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (a === 'sk_login' || a === 'sk_submit') {
      const au = acd_auth_(SK.Students, 'StudentID', p);
      if (au.error) return { ok: false, error: au.error };
      if (a === 'sk_submit') { const r = sk_submit_(au.row, p); if (!r.ok) return r; }
      return sk_studentPayload_(acd_reload_(SK.Students, 'StudentID', au.row.StudentID));
    }
    if (/^skt_/.test(a)) {
      const au = acd_auth_(SK.Tutors, 'TutorID', p);
      if (au.error) return { ok: false, error: au.error };
      let r = { ok: true };
      if (a === 'skt_project') r = sk_saveProject_(au.row, p);
      else if (a === 'skt_mark') r = sk_mark_(au.row, p);
      else if (a === 'skt_attendance') r = sk_attendance_(au.row, p);
      else if (a === 'skt_class') r = sk_class_(au.row, p);
      else if (a === 'skt_complete') r = sk_complete_(au.row, p);
      else if (a === 'skt_password') r = acd_setCode_(au.t, au.row, p.newCode);
      else if (a !== 'skt_login') r = { ok: false, error: 'Unknown action.' };
      if (!r.ok) return r;
      return sk_tutorPayload_(acd_reload_(SK.Tutors, 'TutorID', au.row.TutorID));
    }
    if (/^ska_/.test(a)) {
      const au = acd_auth_(SK.Admins, 'AdminID', p);
      if (au.error) return { ok: false, error: au.error };
      let r = { ok: true };
      if (a === 'ska_payment') r = sk_confirmPayment_(au.row, p);
      else if (a === 'ska_assign') r = sk_assign_(p);
      else if (a === 'ska_password') r = acd_setCode_(au.t, au.row, p.newCode);
      else if (a !== 'ska_login') r = { ok: false, error: 'Unknown action.' };
      if (!r.ok) return r;
      return sk_adminPayload_(acd_reload_(SK.Admins, 'AdminID', au.row.AdminID));
    }
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: /Missing tab|Missing column/.test(String(err.message)) ? 'The Skills School is not set up yet. Please contact the school.' : 'Something went wrong. Please try again.' };
  }
}

/* ===== HELPERS ===== */
function sk_weeks_(course) { return SK_COURSES[String(course || '').trim()] || 0; }
function sk_week_(st) {   // current course week, 0 = not started yet
  const start = iso_(st.StartDate); if (!start) return 0;
  const d = dn_(today_()) - dn_(start);
  if (d < 0) return 0;
  return Math.min(sk_weeks_(st.Course) || 99, Math.floor(d / 7) + 1);
}
function sk_status_(st) {
  const raw = String(st.Status || '').trim();
  if (raw) return raw;
  const start = iso_(st.StartDate), w = sk_weeks_(st.Course);
  if (start && w && dn_(today_()) - dn_(start) >= w * 7) return 'Finished';
  return start ? 'In progress' : 'Starting soon';
}
function sk_tutorNames_() {
  const m = {};
  table_(SK.Tutors).rows.forEach(function (t) { if (t.TutorID) m[key_(t.TutorID)] = String(t.Name || ''); });
  return m;
}
function sk_projectsFor_(st, P) {
  const course = key_(st.Course), cohort = key_(st.Cohort);
  return P.rows.filter(function (p) {
    return p.ProjectID && p.Title && key_(p.Active) !== 'FALSE' && key_(p.Course) === course && matches_(p.Cohort, [cohort]);
  });
}
function sk_studentProjects_(st, P, Sub) {
  const id = key_(st.StudentID), today = today_(), mine = {};
  Sub.rows.forEach(function (s) { if (key_(s.StudentID) === id) mine[String(s.ProjectID)] = s; });
  return sk_projectsFor_(st, P).map(function (p) {
    const s = mine[String(p.ProjectID)], due = iso_(p.Due), scored = s && s.Score !== '' && s.Score != null;
    return {
      ProjectID: String(p.ProjectID), Title: p.Title, Brief: p.Brief, Week: Number(p.Week) || '', Due: due, Link: String(p.Link || ''), MaxScore: Number(p.MaxScore) || '',
      Status: scored ? 'Marked' : s ? 'Submitted' : (due && due < today) ? 'Overdue' : 'To do',
      Submission: s ? { Submitted: iso_(s.Submitted, true), Link: String(s.Link || ''), Note: s.Note, Score: scored ? s.Score : '', Feedback: s.Feedback, Late: !!(due && iso_(s.Submitted) > due) } : null
    };
  }).sort(function (x, y) {
    const rx = x.Status === 'Marked' ? 1 : 0, ry = y.Status === 'Marked' ? 1 : 0;
    if (rx !== ry) return rx - ry;
    return (x.Due || '9999') < (y.Due || '9999') ? -1 : 1;
  });
}
function sk_att_(A, id) {
  const rows = A.rows.filter(function (r) { return key_(r.StudentID) === id && r.Date; })
    .map(function (r) { return { Date: iso_(r.Date), Present: key_(r.Present) === 'YES' || key_(r.Present) === 'TRUE' }; })
    .sort(function (a, b) { return a.Date < b.Date ? 1 : -1; });
  return { Present: rows.filter(function (r) { return r.Present; }).length, Total: rows.length, Recent: rows.slice(0, 10) };
}

/* ===== STUDENT ===== */
function sk_studentPayload_(st) {
  const id = key_(st.StudentID), tutors = sk_tutorNames_();
  return {
    ok: true, today: today_(),
    student: {
      StudentID: String(st.StudentID).trim(), Name: st.Name, Course: String(st.Course || ''), Cohort: String(st.Cohort || ''), Tutor: tutors[key_(st.TutorID)] || '',
      StartDate: iso_(st.StartDate), Weeks: sk_weeks_(st.Course), Week: sk_week_(st), Status: sk_status_(st),
      PaymentStatus: payStatus_(st), NextDue: iso_(st.NextDue), Fee: Number(st.Fee) || 0, Period: String(st.Period || ''),
      NextClass: iso_(st.NextClass, true), ClassLink: String(st.ClassLink || ''), Certificate: String(st.Certificate || '')
    },
    projects: sk_studentProjects_(st, table_(SK.Projects), table_(SK.Submissions)),
    attendance: sk_att_(table_(SK.Attendance), id),
    announcements: table_(SK.Announcements).rows.filter(function (r) { return r.Title && matches_(r.Audience, ['SKILLS', key_(st.Course), key_(st.Cohort), id]); })
      .map(function (r) { return { Date: iso_(r.Date), Title: r.Title, Body: r.Body }; })
      .sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 20),
    payments: table_(SK.Payments).rows.filter(function (r) { return key_(r.StudentID) === id; })
      .map(function (r) { return { Date: iso_(r.Date), Amount: Number(r.Amount) || 0, Months: Number(r.Months) || 0, Reference: r.Reference }; })
      .sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 12)
  };
}
function sk_submit_(st, p) {
  const pid = String(p.projectId || '').trim();
  const proj = sk_studentProjects_(st, table_(SK.Projects), table_(SK.Submissions)).filter(function (x) { return x.ProjectID === pid; })[0];
  if (!proj) return { ok: false, error: 'Project not found.' };
  if (proj.Status === 'Marked') return { ok: false, error: 'This project has already been marked.' };
  const link = String(p.link || '').trim().slice(0, 500), note = String(p.note || '').trim().slice(0, 2000);
  if (!link && !note) return { ok: false, error: 'Add a link to your work or a note.' };
  if (link && !/^https?:\/\//i.test(link)) return { ok: false, error: 'The link must start with http:// or https://' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const t = table_(SK.Submissions), id = key_(st.StudentID);
    const ex = t.rows.filter(function (r) { return String(r.ProjectID) === pid && key_(r.StudentID) === id; })[0];
    if (ex) { put_(t, ex._row, 'Submitted', new Date()); put_(t, ex._row, 'Link', link, true); put_(t, ex._row, 'Note', note, true); }
    else append_(t, { SubmissionID: 'SS-' + Utilities.getUuid().slice(0, 8).toUpperCase(), ProjectID: pid, StudentID: id, Submitted: new Date(), Link: link, Note: note }, ['ProjectID', 'StudentID', 'Link', 'Note']);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/* ===== TUTOR ===== */
function sk_isAdmin_(tu) { return String(tu.Role || '').trim().toLowerCase() === 'admin'; }
function sk_mine_(tu) {
  const admin = sk_isAdmin_(tu);
  return table_(SK.Students).rows.filter(function (s) {
    return s.StudentID && key_(s.Active) !== 'FALSE' && (admin || key_(s.TutorID) === key_(tu.TutorID));
  });
}
function sk_tutorPayload_(tu) {
  const admin = sk_isAdmin_(tu), P = table_(SK.Projects), Sub = table_(SK.Submissions), A = table_(SK.Attendance);
  const mine = sk_mine_(tu), names = {}, courses = {}, cohorts = {};
  mine.forEach(function (s) { names[key_(s.StudentID)] = s.Name; if (s.Course) courses[String(s.Course).trim()] = 1; if (s.Cohort) cohorts[String(s.Cohort).trim()] = 1; });
  const students = mine.map(function (s) {
    const id = key_(s.StudentID), att = sk_att_(A, id), pr = sk_studentProjects_(s, P, Sub);
    return {
      StudentID: String(s.StudentID).trim(), Name: s.Name, Course: String(s.Course || ''), Cohort: String(s.Cohort || ''), StartDate: iso_(s.StartDate),
      Week: sk_week_(s), Weeks: sk_weeks_(s.Course), Status: sk_status_(s), NextClass: iso_(s.NextClass, true), ClassLink: String(s.ClassLink || ''),
      Certificate: String(s.Certificate || ''), Wa: acd_wa_(s.WhatsApp), PaymentStatus: admin ? payStatus_(s) : '',
      Present: att.Present, Total: att.Total,
      Submitted: pr.filter(function (x) { return x.Status === 'Submitted'; }).length, Marked: pr.filter(function (x) { return x.Status === 'Marked'; }).length,
      Outstanding: pr.filter(function (x) { return x.Status === 'To do' || x.Status === 'Overdue'; }).length
    };
  }).sort(function (a, b) { return String(a.Course + a.Name).localeCompare(String(b.Course + b.Name)); });
  const projects = P.rows.filter(function (p) { return p.ProjectID && p.Title && key_(p.Active) !== 'FALSE' && (admin || courses[String(p.Course).trim()] || key_(p.CreatedBy) === key_(tu.TutorID)); })
    .map(function (p) {
      const subs = Sub.rows.filter(function (s) { return String(s.ProjectID) === String(p.ProjectID) && names[key_(s.StudentID)]; }).map(function (s) {
        const scored = s.Score !== '' && s.Score != null;
        return { SubmissionID: String(s.SubmissionID), StudentID: String(s.StudentID).trim(), Name: names[key_(s.StudentID)], Submitted: iso_(s.Submitted, true), Link: String(s.Link || ''), Note: s.Note, Score: scored ? s.Score : '', Feedback: s.Feedback || '', Late: !!(iso_(p.Due) && iso_(s.Submitted) > iso_(p.Due)) };
      });
      return {
        ProjectID: String(p.ProjectID), Course: String(p.Course || ''), Cohort: String(p.Cohort || ''), Week: Number(p.Week) || '', Title: p.Title, Brief: p.Brief,
        Due: iso_(p.Due), Link: String(p.Link || ''), MaxScore: Number(p.MaxScore) || '', Submissions: subs, Pending: subs.filter(function (s) { return s.Score === ''; }).length
      };
    }).sort(function (a, b) { return (b.Due || '') < (a.Due || '') ? -1 : 1; });
  const courseList = admin ? Object.keys(SK_COURSES) : Object.keys(courses);
  const cohortList = SK_COHORTS.slice(); Object.keys(cohorts).forEach(function (c) { if (cohortList.indexOf(c) < 0) cohortList.push(c); });
  return {
    ok: true, today: today_(), teacher: { TeacherID: String(tu.TutorID).trim(), Name: tu.Name, Role: admin ? 'Admin' : 'Tutor' },
    students: students, projects: projects, courses: courseList.length ? courseList : Object.keys(SK_COURSES), cohorts: cohortList
  };
}
function sk_pickMine_(tu, ids) {
  const mine = {}; sk_mine_(tu).forEach(function (s) { mine[key_(s.StudentID)] = s; });
  ids = (Array.isArray(ids) ? ids : []).map(key_);
  if (!ids.length) return { error: 'Tick at least one student.' };
  const out = ids.map(function (i) { return mine[i]; });
  if (out.some(function (x) { return !x; })) return { error: 'One of those students is not assigned to you.' };
  return { list: out };
}
function sk_saveProject_(tu, p) {
  const course = String(p.course || '').trim(), cohort = String(p.cohort || '').trim().slice(0, 40), title = String(p.title || '').trim().slice(0, 120);
  const brief = String(p.brief || '').trim().slice(0, 3000), due = String(p.due || ''), link = String(p.link || '').trim().slice(0, 500);
  const week = String(p.week == null ? '' : p.week).trim(), max = String(p.maxScore == null ? '' : p.maxScore).trim();
  if (!SK_COURSES[course]) return { ok: false, error: 'Choose the course.' };
  if (!title) return { ok: false, error: 'Give the project a title.' };
  if (due && !acd_isDay_(due)) return { ok: false, error: 'Choose a valid due date.' };
  if (link && !/^https?:\/\//i.test(link)) return { ok: false, error: 'The link must start with http:// or https://' };
  if (week && !(Number(week) >= 1 && Number(week) <= 52)) return { ok: false, error: 'The week must be a number from 1 to 52.' };
  if (max && !(Number(max) > 0 && Number(max) <= 1000)) return { ok: false, error: 'The maximum score must be more than 0.' };
  if (!sk_isAdmin_(tu) && !sk_mine_(tu).some(function (s) { return String(s.Course).trim() === course; })) return { ok: false, error: 'You have no students on that course.' };
  append_(table_(SK.Projects), {
    ProjectID: 'PR-' + Utilities.getUuid().slice(0, 6).toUpperCase(), Course: course, Cohort: cohort, Week: week ? Number(week) : '', Title: title, Brief: brief,
    Due: due, Link: link, MaxScore: max ? Number(max) : '', Active: 'TRUE', CreatedBy: String(tu.TutorID), Created: new Date()
  }, ['Course', 'Cohort', 'Title', 'Brief', 'Due', 'Link', 'CreatedBy']);
  return { ok: true };
}
function sk_mark_(tu, p) {
  const sid = String(p.submissionId || '').trim(), score = String(p.score == null ? '' : p.score).trim(), fb = String(p.feedback || '').trim().slice(0, 3000);
  const Sub = table_(SK.Submissions), s = Sub.rows.filter(function (r) { return String(r.SubmissionID) === sid; })[0];
  if (!s) return { ok: false, error: 'Submission not found.' };
  if (!sk_mine_(tu).some(function (x) { return key_(x.StudentID) === key_(s.StudentID); })) return { ok: false, error: 'That student is not assigned to you.' };
  const proj = table_(SK.Projects).rows.filter(function (r) { return String(r.ProjectID) === String(s.ProjectID); })[0];
  const max = proj ? Number(proj.MaxScore) || 0 : 0;
  if (score === '' && !fb) return { ok: false, error: 'Enter a score or some feedback.' };
  if (score !== '' && !(Number(score) >= 0 && (!max || Number(score) <= max))) return { ok: false, error: max ? 'The score must be between 0 and ' + max + '.' : 'Enter a valid score.' };
  put_(Sub, s._row, 'Score', score === '' ? 'Reviewed' : Number(score));
  put_(Sub, s._row, 'Feedback', fb, true); put_(Sub, s._row, 'Marked', new Date()); put_(Sub, s._row, 'MarkedBy', String(tu.TutorID), true);
  return { ok: true };
}
function sk_attendance_(tu, p) {
  const date = String(p.date || '');
  if (!acd_isDay_(date) || date > today_()) return { ok: false, error: 'Choose a valid date that is not in the future.' };
  const present = (Array.isArray(p.present) ? p.present : []).map(key_), all = (Array.isArray(p.studentIds) ? p.studentIds : []).map(key_);
  const pick = sk_pickMine_(tu, all);
  if (pick.error) return { ok: false, error: pick.error };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const A = table_(SK.Attendance);
    pick.list.forEach(function (s) {
      const id = key_(s.StudentID), val = present.indexOf(id) >= 0 ? 'Yes' : 'No';
      const ex = A.rows.filter(function (r) { return key_(r.StudentID) === id && iso_(r.Date) === date; })[0];
      if (ex) { put_(A, ex._row, 'Present', val); put_(A, ex._row, 'TutorID', String(tu.TutorID), true); put_(A, ex._row, 'Recorded', new Date()); }
      else { const row = append_(A, { StudentID: id, Date: date, Present: val, TutorID: String(tu.TutorID), Recorded: new Date() }, ['StudentID', 'Date', 'TutorID']); A.rows.push({ _row: row, StudentID: id, Date: date }); }
    });
  } finally { lock.releaseLock(); }
  return { ok: true };
}
function sk_class_(tu, p) {
  const when = String(p.nextClass || ''), link = String(p.link || '').trim().slice(0, 500);
  if (!when && !link) return { ok: false, error: 'Enter a date and time, or a link.' };
  if (when && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) return { ok: false, error: 'Choose a valid date and time.' };
  if (link && !/^https?:\/\//i.test(link)) return { ok: false, error: 'The class link must start with http:// or https://' };
  const pick = sk_pickMine_(tu, p.studentIds);
  if (pick.error) return { ok: false, error: pick.error };
  const S = table_(SK.Students);
  pick.list.forEach(function (s) { if (when) put_(S, s._row, 'NextClass', when, true); if (link) put_(S, s._row, 'ClassLink', link, true); });
  return { ok: true };
}
function sk_complete_(tu, p) {
  const cert = String(p.certificate || '').trim().slice(0, 500);
  if (cert && !/^https?:\/\//i.test(cert)) return { ok: false, error: 'The certificate link must start with http:// or https://' };
  const pick = sk_pickMine_(tu, p.studentIds);
  if (pick.error) return { ok: false, error: pick.error };
  const S = table_(SK.Students);
  pick.list.forEach(function (s) {
    put_(S, s._row, 'Status', 'Completed');
    if (cert) put_(S, s._row, 'Certificate', cert, true);
    sendEmail_(s, SCHOOL_NAME + ': ' + String(s.Course || 'course') + ' completed', 'Assalaamu alaykum ' + String(s.Name).split(' ')[0] + '. Congratulations on completing ' + String(s.Course || 'your course') +
      ' at the Himaayah Skills School.' + (cert ? ' Your certificate: ' + cert : '') + ' Jazakumullahu khayran.\n\n' + SK_DASHBOARD_URL);
  });
  return { ok: true };
}

/* ===== ADMIN ===== */
function sk_adminPayload_(ad) {
  const tutors = sk_tutorNames_(), names = {};
  const students = table_(SK.Students).rows.filter(function (s) { return s.StudentID && key_(s.Active) !== 'FALSE'; }).map(function (s) {
    names[key_(s.StudentID)] = s.Name;
    return {
      StudentID: String(s.StudentID).trim(), Name: s.Name, Plan: String(s.Course || ''), Level: String(s.Cohort || ''), StartDate: iso_(s.StartDate),
      Fee: Number(s.Fee) || 0, MonthlyFee: Number(s.Fee) || 0, Period: String(s.Period || ''), PaymentStatus: payStatus_(s), NextDue: iso_(s.NextDue),
      TeacherID: String(s.TutorID || '').trim(), Teacher: tutors[key_(s.TutorID)] || '', Status: sk_status_(s)
    };
  });
  const levels = SK_COHORTS.slice();
  students.forEach(function (s) { if (s.Level && levels.indexOf(s.Level) < 0) levels.push(s.Level); });
  return {
    ok: true, today: today_(), admin: { AdminID: String(ad.AdminID).trim(), Name: ad.Name }, students: students,
    teachers: table_(SK.Tutors).rows.filter(function (t) { return t.TutorID && key_(t.Active) !== 'FALSE'; }).map(function (t) { return { TeacherID: String(t.TutorID).trim(), Name: t.Name }; }),
    levels: levels,
    payments: table_(SK.Payments).rows.filter(function (r) { return r.StudentID; }).map(function (r) {
      return { Date: iso_(r.Date), StudentID: String(r.StudentID).trim(), Name: names[key_(r.StudentID)] || '', Amount: Number(r.Amount) || 0, Months: Number(r.Months) || 0, Reference: r.Reference };
    }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 20)
  };
}
function sk_confirmPayment_(ad, p) {
  const id = key_(p.studentId), amount = Number(p.amount), months = Math.round(Number(p.months) || 0), date = String(p.date || ''), ref = String(p.reference || '').trim().slice(0, 60);
  if (!(amount > 0)) return { ok: false, error: 'Enter the amount received.' };
  if (!(months >= 0 && months <= 24)) return { ok: false, error: 'Months must be between 0 and 24.' };
  if (!acd_isDay_(date) || date > today_()) return { ok: false, error: 'The date cannot be in the future.' };
  let s = null, nd = '';
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const S = table_(SK.Students);
    s = S.rows.filter(function (r) { return key_(r.StudentID) === id; })[0];
    if (!s) return { ok: false, error: 'Student not found.' };
    if (months > 0) {   // courses billed every few months move the next due date; one-time courses just become Paid
      const cur = iso_(s.NextDue), base = (cur && cur >= date) ? cur : date;
      nd = addMonths_(base, months);
      put_(S, s._row, 'NextDue', nd, true);
      s.NextDue = nd;
    }
    s.PaymentStatus = 'Paid'; s.PaymentStatus = payStatus_(s);
    put_(S, s._row, 'PaymentStatus', s.PaymentStatus);
    append_(table_(SK.Payments), {
      PaymentID: 'P-' + Utilities.getUuid().slice(0, 6).toUpperCase(), StudentID: String(s.StudentID).trim(), Date: date, Amount: amount, Months: months,
      Reference: ref, Method: 'Bank transfer', ConfirmedBy: String(ad.AdminID), Recorded: new Date()
    }, ['StudentID', 'Date', 'Reference', 'ConfirmedBy']);
  } finally { lock.releaseLock(); }
  sendEmail_(s, SCHOOL_NAME + ': payment received', 'Assalaamu alaykum ' + String(s.Name).split(' ')[0] + '. We have received your Skills School payment of ' + naira_(amount) + '.' +
    (nd ? ' Your next payment is due on ' + nice_(nd) + '.' : '') + ' Jazakumullahu khayran.\n\n' + SK_DASHBOARD_URL);
  return { ok: true };
}
function sk_assign_(p) {
  const tid = String(p.teacherId || '').trim(), cohort = String(p.level || '').trim().slice(0, 40), start = String(p.startDate || '');
  const ids = (Array.isArray(p.studentIds) ? p.studentIds : []).map(key_);
  if (!ids.length) return { ok: false, error: 'Tick at least one student.' };
  if (!tid && !cohort && !start) return { ok: false, error: 'Choose a tutor, a cohort or a start date to apply.' };
  if (start && !acd_isDay_(start)) return { ok: false, error: 'Choose a valid start date.' };
  if (tid && !table_(SK.Tutors).rows.some(function (t) { return key_(t.TutorID) === key_(tid); })) return { ok: false, error: 'Tutor not found.' };
  const S = table_(SK.Students);
  const rows = ids.map(function (i) { return S.rows.filter(function (r) { return key_(r.StudentID) === i; })[0]; });
  if (rows.some(function (r) { return !r; })) return { ok: false, error: 'Student not found.' };
  rows.forEach(function (s) {
    if (tid) put_(S, s._row, 'TutorID', tid, true);
    if (cohort) put_(S, s._row, 'Cohort', cohort, true);
    if (start) put_(S, s._row, 'StartDate', start, true);
  });
  return { ok: true };
}

/* ===== NEW ENROLMENT FROM THE WEBSITE (called by Enrol.gs) =====
   info: { name, plan, amount, months, email, phone, ref, method }   months: 0 one-time, 2 every two months */
function sk_createAccount_(info) {
  const S = table_(SK.Students);
  let max = 0;
  S.rows.forEach(function (r) { const m = new RegExp('^' + SK_ID_PREFIX + '(\\d+)$', 'i').exec(String(r.StudentID || '').trim()); if (m) max = Math.max(max, +m[1]); });
  const id = SK_ID_PREFIX + String(max + 1).padStart(4, '0'), code = en_code();
  const course = String(info.plan || '').split('—').pop().trim(), today = today_(), months = info.months || 0;
  append_(S, {
    StudentID: id, Name: info.name, AccessCode: code, Course: course, Cohort: '', TutorID: '', StartDate: '', Status: '', PaymentStatus: 'Paid',
    NextDue: months ? addMonths_(today, months) : '', Fee: info.amount, Period: months ? 'Every ' + months + ' months' : 'One-time',
    NextClass: '', ClassLink: '', Certificate: '', Email: info.email, WhatsApp: info.phone, Active: 'TRUE', Enrolled: today, Ref: info.ref
  }, ['StudentID', 'Name', 'AccessCode', 'Course', 'NextDue', 'Period', 'Email', 'WhatsApp', 'Enrolled', 'Ref']);
  append_(table_(SK.Payments), {
    PaymentID: 'P-' + Utilities.getUuid().slice(0, 6).toUpperCase(), StudentID: id, Date: today, Amount: info.amount, Months: months,
    Reference: info.ref, Method: info.method || 'Bank transfer', ConfirmedBy: 'Enrolment', Recorded: new Date()
  }, ['StudentID', 'Date', 'Reference', 'ConfirmedBy']);
  return { id: id, code: code };
}

/* ===== DAILY JOB (called from dailyJob in Code.gs): status refresh and payment reminders for courses billed every few months ===== */
function sk_dailyJob_() {
  let S;
  try { S = table_(SK.Students); } catch (e) { return 0; }
  const today = today_(), now = dn_(today), R = table_('Reminders'), seen = {}, rows = [];
  R.rows.forEach(function (r) { if (r.Key) seen[String(r.Key)] = true; });
  S.rows.forEach(function (s) {
    if (!s.StudentID || key_(s.Active) === 'FALSE' || String(s.Status).trim() === 'Completed') return;
    const nd = iso_(s.NextDue);
    if (!nd || String(s.PaymentStatus).trim().toLowerCase() === 'exempt') return;
    const want = payStatus_(s);
    if (want !== String(s.PaymentStatus || '').trim()) put_(S, s._row, 'PaymentStatus', want);
    const d = dn_(nd) - now, first = String(s.Name).split(' ')[0], fee = Number(s.Fee) ? ' (' + naira_(s.Fee) + ')' : '';
    let type = '', msg = '';
    if (SK_PAYMENT_REMINDER_DAYS.indexOf(d) >= 0) { type = 'Payment due'; msg = 'Assalaamu alaykum ' + first + '. A reminder that your ' + s.Course + ' fee' + fee + ' is due ' + when_(d) + ' (' + nice_(nd) + '). Pay by card here and your dashboard updates straight away: ' + payLink_(s.StudentID) + ' . If you pay by bank transfer, please send your receipt on WhatsApp. Jazakumullahu khayran.'; }
    else if (d < 0 && (d === -1 || d === -3 || d === -7 || (d < -7 && d % 7 === 0))) { type = 'Payment overdue'; msg = 'Assalaamu alaykum ' + first + '. Your ' + s.Course + ' fee' + fee + ' was due on ' + nice_(nd) + ' and is now ' + (-d) + ' day' + (d === -1 ? '' : 's') + ' overdue. Pay by card here: ' + payLink_(s.StudentID) + ' , or pay by transfer and send your receipt on WhatsApp. Message us if there is a problem.'; }
    if (!type) return;
    const key = today + '|' + key_(s.StudentID) + '|SK ' + type + '|' + nd + '/' + d;
    if (seen[key]) return;
    seen[key] = true;
    const status = sendEmail_(s, SCHOOL_NAME + ': ' + type.toLowerCase() + ' reminder', msg);
    const cells = { Date: today, StudentID: s.StudentID, Name: s.Name, Type: 'Skills ' + type.toLowerCase(), Message: msg, WhatsAppLink: waLink_(s.WhatsApp, msg), EmailStatus: status, Done: '', Key: key };
    rows.push(R.head.map(function (h) { return cells[h] === undefined ? '' : cells[h]; }));
  });
  if (rows.length) R.sh.getRange(R.sh.getLastRow() + 1, 1, rows.length, R.head.length).setValues(rows);
  return rows.length;
}

/* ===== ONE-TIME SETUP ===== */
function skillsSetup() {
  const ss = ss_();
  Object.keys(SK_SHEETS).forEach(function (name) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name), want = SK_SHEETS[name];
    const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    if (!have.some(Boolean)) sh.getRange(1, 1, 1, want.length).setValues([want]);
    else want.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h); } });
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  });
  dropdown_(ss, SK.Students, 'Course', Object.keys(SK_COURSES), false);
  dropdown_(ss, SK.Students, 'Status', ['', 'Starting soon', 'In progress', 'Completed', 'Withdrawn'], false);
  dropdown_(ss, SK.Students, 'PaymentStatus', ['Paid', 'Due', 'Overdue', 'Exempt'], false);
  dropdown_(ss, SK.Students, 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, SK.Tutors, 'Role', ['Tutor', 'Admin'], true);
  dropdown_(ss, SK.Tutors, 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, SK.Admins, 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, SK.Projects, 'Course', Object.keys(SK_COURSES), false);
  dropdown_(ss, SK.Projects, 'Active', ['TRUE', 'FALSE'], true);
  dropdown_(ss, SK.Attendance, 'Present', ['Yes', 'No'], true);
  const A = table_(SK.Admins);
  let msg = 'Skills School tabs are ready.';
  if (!A.rows.some(function (r) { return r.AdminID; })) {
    const code = en_code() + en_code();
    append_(A, { AdminID: 'SA-001', Name: 'Skills Admin', AccessCode: code, Email: '', Active: 'TRUE' }, ['AdminID', 'Name', 'AccessCode']);
    msg += '\n\nFirst admin login for skills-admin.html:\nAdmin ID: SA-001\nAccess code: ' + code + '\n\nChange the name in the SkillsAdmins tab, and the code after signing in (Account tab).';
  }
  console.log(msg);   // shown in the Execution log when run from the editor
  try { ss.toast(msg.split('\n')[0] + ' The admin login is in the SkillsAdmins tab.', SCHOOL_NAME, 15); } catch (e) {}
  return msg;
}

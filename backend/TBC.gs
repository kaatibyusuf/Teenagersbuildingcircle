/**
 * Himaayah Teenagers Building Circle API (TBC.gs)
 * Add this file to the SAME Apps Script project as Code.gs, Teacher.gs and Admin.gs. Setup steps are in SETUP-TBC.md.
 *
 * Session guides (12 monthly guides, 4,000 naira each) are bought from the student dashboard and downloaded from there; facilitators can download all of them.
 * The facilitator writes a monthly report from the Reports tab; "End month and send" emails it to the parent or guardian.
 *
 * Three groups of actions, all routed from doPost in Code.gs:
 *   tbc_login, tbc_submit                          the student dashboard (tbc-dashboard.html)
 *   tbcf_login, tbcf_attendance, tbcf_checkin,     the facilitator page (tbc-facilitator.html), signed in with a Teachers-tab login
 *   tbcf_session, tbcf_session_delete, tbcf_password
 *   tbca_login, tbca_payment, tbca_assign,         the TBC admin page (tbc-admin.html), signed in with an Admins-tab login
 *   tbca_password
 *
 * TBC students live in the Students tab like everyone else. A Programme column marks them ("TBC").
 * New enrolments that have no Programme yet are recognised by "Teenagers" in the Level column (what Enrol.gs writes).
 */

/* ===== SETTINGS ===== */
const TBC_PILLARS = ['Deen', 'Educational Development', 'Skills', 'Personal Development'];
const TBC_RATINGS = ['Needs support', 'Developing', 'On track', 'Strong', 'Excelling'];   // 1 to 5
const TBC_COHORTS = ['Cohort 1'];                 // edit to your cohort names; the TBC admin assigns students to one of these
const TBC_START = '2026-12-01';                  // first day of Month 1 (1 December 2026). Used to point students to the guide for the current month.
const TBC_RESERVE = 10;                           // emails kept back each day for receipts and logins when monthly reports are sent
const TBC_TABS = {
  Pillars: ['StudentID', 'Date', 'Pillar', 'Rating', 'Note', 'By'],
  TBCSessions: ['SessionID', 'Start', 'Title', 'Pillar', 'Link', 'Notes', 'Audience', 'CreatedBy'],
  TBCGuides: ['StudentID', 'Slug', 'Ref', 'Date'],
  TBCReports: ['Month', 'StudentID', 'Name', 'To', 'Status', 'Sent', 'Note', 'Focus', 'SentBy']
};

/* ===== SETUP: run once from the editor ===== */
function tbcSetup() {
  const ss = ss_();
  Object.keys(TBC_TABS).forEach(function (name) { tchEnsure_(ss, name, TBC_TABS[name]); });
  tchEnsure_(ss, 'Students', ['Programme']);
  const t = table_('Students');
  let n = 0;
  t.rows.forEach(function (s) { if (s.StudentID && !String(s.Programme || '').trim() && tbcIs_(s)) { put_(t, s._row, 'Programme', 'TBC', true); n++; } });
  tbcInstallRetry();
  try { ss.toast('TBC tabs are ready. ' + n + ' student(s) marked as TBC.', SCHOOL_NAME); } catch (e) {}
}

function tbcInstallRetry() {   // a daily morning job that sends reports that were left "Waiting" for the email limit
  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'tbcRetryWaiting'; });
  if (!has) ScriptApp.newTrigger('tbcRetryWaiting').timeBased().everyDays(1).atHour(7).create();
}
function tbcRetryWaiting() {   // runs by itself every morning; can also be run by hand
  const t = table_('TBCReports'), waiting = t.rows.filter(function (r) { return String(r.Status) === 'Waiting'; });
  if (!waiting.length) return;
  const students = {}; table_('Students').rows.forEach(function (s) { students[key_(s.StudentID)] = s; });
  const ctx = tbcRpCtx_(), t0 = Date.now(); let sent = 0, left = 0;
  waiting.forEach(function (w) {
    const st = students[key_(w.StudentID)], month = String(iso_(w.Month) || w.Month).slice(0, 7);
    if (!st) return;
    const me = { TeacherID: String(w.SentBy || '') };
    const r = tbcRpBuild_(st, month, ctx);
    if (!r.to.length) { tbcRpSave_(me, month, st, null, null, { Status: 'No email' }); return; }
    if (MailApp.getRemainingDailyQuota() - r.to.length < TBC_RESERVE || Date.now() - t0 > 240000) { left++; return; }
    try {
      MailApp.sendEmail({ to: r.to.join(','), name: SCHOOL_NAME, subject: 'Teenagers Building Circle: ' + r.first + '’s report for ' + r.monthName, body: tbcRpText_(r, false), htmlBody: tbcRpHtml_(r) });
      tbcRpSave_(me, month, st, null, null, { Status: 'Sent', Sent: new Date(), To: r.to.join(', ') }); sent++;
    } catch (e) { console.error(e); tbcRpSave_(me, month, st, null, null, { Status: 'Failed' }); }
  });
  console.log('TBC report retry: ' + sent + ' sent, ' + left + ' still waiting.');
}

/* ===== HELPERS ===== */
function tbcIs_(s) {
  const p = key_(s.Programme);
  if (p) return p === 'TBC';
  return /TEENAGER/.test(key_(s.Level)) || /TEENAGER/.test(key_(s.Plan));
}
function tbcCohort_(s) { const l = String(s.Level || '').trim(); return /teenager/i.test(l) ? '' : l; }
function tbcRows_(name) { try { return table_(name).rows; } catch (e) { return []; } }
function tbcNames_(cell) {
  const people = tbcRows_('Teachers');
  return String(cell || '').split(/[,;]+/).map(function (x) {
    const k = key_(x); if (!k) return '';
    const t = people.filter(function (r) { return key_(r.Name) === k || key_(r.TeacherID) === k; })[0];
    return t ? String(t.Name).trim() : String(x).trim();
  }).filter(Boolean).join(', ');
}
function tbcNewest_(a, b) { const x = iso_(a.Date), y = iso_(b.Date); return x < y ? 1 : x > y ? -1 : (b._row || 0) - (a._row || 0); }
function tbcPillarRows_(rows) {
  return rows.filter(function (r) { return TBC_PILLARS.indexOf(String(r.Pillar)) >= 0 && Number(r.Rating) >= 1; }).sort(tbcNewest_);
}
function tbcPillarSummary_(rows) {   // rows: one student's check-ins
  const all = tbcPillarRows_(rows);
  return TBC_PILLARS.map(function (name) {
    const mine = all.filter(function (r) { return r.Pillar === name; });
    const last = mine[0];
    return {
      Pillar: name, Rating: last ? Number(last.Rating) : 0, Note: last ? String(last.Note || '') : '', Date: last ? iso_(last.Date) : '',
      History: mine.slice(0, 8).reverse().map(function (r) { return { Date: iso_(r.Date), Rating: Number(r.Rating) }; })
    };
  });
}
function tbcSession_(r) {
  return { SessionID: String(r.SessionID), Start: iso_(r.Start, true), Title: r.Title, Pillar: r.Pillar || '', Link: r.Link || '', Notes: r.Notes || '', Audience: r.Audience || '', CreatedBy: r.CreatedBy || '' };
}
function tbcSessions_(forStudent) {
  const today = today_();
  const all = tbcRows_('TBCSessions').filter(function (r) { return r.SessionID && r.Title && iso_(r.Start); }).filter(function (r) {
    return !forStudent || matches_(r.Audience, [key_(tbcCohort_(forStudent)), key_(forStudent.StudentID)]);
  }).map(tbcSession_).sort(function (a, b) { return a.Start < b.Start ? -1 : 1; });
  const up = all.filter(function (x) { return x.Start.slice(0, 10) >= today; }), past = all.filter(function (x) { return x.Start.slice(0, 10) < today; });
  return up.slice(0, 12).concat(past.slice(-4));
}
function tbcAud_(cell, allowed) {   // announcements: must name TBC, ALL, the cohort or the student (blank stays Madrasah-only)
  return String(cell == null ? '' : cell).split(/[,;]+/).map(key_).filter(Boolean).some(function (p) { return p === 'ALL' || allowed.indexOf(p) >= 0; });
}

/* ===== STUDENT ===== */
function tbc_payload_(st) {
  const id = key_(st.StudentID), mine = function (n) { return tbcRows_(n).filter(function (r) { return key_(r.StudentID) === id; }); };
  const cohort = tbcCohort_(st);
  return {
    ok: true,
    student: {
      StudentID: String(st.StudentID).trim(), Name: st.Name, Cohort: cohort, Plan: st.Plan, Facilitator: tbcNames_(st.Teacher),
      PaymentStatus: payStatus_(st), NextDue: iso_(st.NextDue), MonthlyFee: Number(st.MonthlyFee) || 0,
      AttendancePresent: Number(st.AttendancePresent) || 0, AttendanceTotal: Number(st.AttendanceTotal) || 0
    },
    guides: tbcGuidesFor_(st), guideMonth: tbcGuideMonth_(),
    pillars: tbcPillarSummary_(mine('Pillars')),
    sessions: tbcSessions_(st),
    attendance: mine('Attendance').map(function (r) { return { Date: iso_(r.Date), Status: r.Status }; }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 12),
    assignments: assignmentsFor_(st),
    announcements: tbcRows_('Announcements').filter(function (r) { return r.Title && tbcAud_(r.Audience, ['TBC', id, key_(cohort)]); }).map(function (r) {
      return { Date: iso_(r.Date), Title: r.Title, Body: r.Body };
    }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 20),
    payments: mine('Payments').filter(function (p) { return String(p.Status).trim().toLowerCase() === 'confirmed'; }).map(function (p) {
      return { Date: iso_(p.Date), Amount: Number(p.Amount) || 0, Months: Number(p.Months) || 1, Reference: p.Reference };
    }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 12)
  };
}
function tbcStudent_(p) {
  const a = auth_(p.id, p.code);
  if (a.error) return { ok: false, error: a.error };
  if (!tbcIs_(a.st)) return { ok: false, error: 'This login is for the Teenagers Building Circle. Madrasah students sign in on the student dashboard.' };
  if (p.action === 'tbc_submit') { const r = submit_(a.st, p); if (!r.ok) return r; }
  return tbc_payload_(a.st);
}

/* ===== FACILITATOR (uses the Teachers tab and Teacher.gs helpers) ===== */
function tbcf_payload_(me) {
  const admin = tchAdmin_(me), m = tchMine_(me), rows = m.rows.filter(tbcIs_), ids = {};
  rows.forEach(function (r) { ids[key_(r.StudentID)] = true; });
  const mine = function (n) { return tbcRows_(n).filter(function (r) { return ids[key_(r.StudentID)]; }); };
  const pil = mine('Pillars'), by = {};
  pil.forEach(function (r) { (by[key_(r.StudentID)] = by[key_(r.StudentID)] || []).push(r); });
  const students = rows.map(function (r) {
    return {
      StudentID: String(r.StudentID).trim(), Name: r.Name, Cohort: tbcCohort_(r), AttendancePresent: Number(r.AttendancePresent) || 0, AttendanceTotal: Number(r.AttendanceTotal) || 0,
      PaymentStatus: admin ? payStatus_(r) : '', Wa: tchWa_(r.WhatsApp), Pillars: tbcPillarSummary_(by[key_(r.StudentID)] || [])
    };
  }).sort(function (a, b) { return String(a.Name).toLowerCase() < String(b.Name).toLowerCase() ? -1 : 1; });
  const cohorts = {}; students.forEach(function (s) { if (s.Cohort) cohorts[s.Cohort] = true; });
  TBC_COHORTS.forEach(function (c) { cohorts[c] = true; });
  return {
    ok: true, today: today_(), teacher: { TeacherID: String(me.TeacherID).trim(), Name: me.Name, Role: admin ? 'Admin' : 'Facilitator' },
    students: students, pillars: TBC_PILLARS, ratings: TBC_RATINGS, cohorts: Object.keys(cohorts).sort(), guides: tbcGuidesStaff_(me), guideMonth: tbcGuideMonth_(),
    attendance: mine('Attendance').map(function (r) { return { StudentID: String(r.StudentID).trim(), Date: iso_(r.Date), Status: r.Status }; }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 800),
    sessions: tbcSessions_(null)
  };
}
function tbcf_checkin_(me, p) {
  const o = tchOne_(me, p.studentId), date = tchClean_(p.date, 10) || today_(), entries = Array.isArray(p.entries) ? p.entries : [];
  if (!tbcIs_(o.row)) tchFail_('That student is not in the Teenagers Building Circle.');
  if (!tchDay_(date) || date > today_()) tchFail_('Choose a valid date that is not in the future.');
  const todo = entries.filter(function (x) { return x && x.rating !== '' && x.rating != null; });
  if (!todo.length) tchFail_('Give at least one pillar a rating.');
  todo.forEach(function (x) {
    if (TBC_PILLARS.indexOf(String(x.pillar)) < 0) tchFail_('Unknown pillar.');
    const n = tchNum_(x.rating); if (!(n >= 1 && n <= 5 && Math.floor(n) === n)) tchFail_('Ratings are from 1 to 5.');
  });
  const t = table_('Pillars'), sid = key_(o.row.StudentID), done = {};
  todo.forEach(function (x) {
    if (done[x.pillar]) return; done[x.pillar] = true;
    const note = tchClean_(x.note, 500), rating = Number(x.rating);
    const ex = t.rows.filter(function (r) { return key_(r.StudentID) === sid && iso_(r.Date) === date && String(r.Pillar) === x.pillar; })[0];
    if (ex) { put_(t, ex._row, 'Rating', rating); put_(t, ex._row, 'Note', note, true); put_(t, ex._row, 'By', me.TeacherID, true); }
    else append_(t, { StudentID: o.row.StudentID, Date: date, Pillar: x.pillar, Rating: rating, Note: note, By: me.TeacherID }, ['Date', 'Note', 'By']);
  });
}
function tbcf_session_(me, p) {
  const title = tchClean_(p.title, 100), start = tchClean_(p.start, 16), pillar = tchClean_(p.pillar, 40), link = tchClean_(p.link, 500), notes = tchClean_(p.notes, 500), aud = tchClean_(p.audience, 60);
  if (!title) tchFail_('Enter a title.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) || !tchDay_(start.slice(0, 10))) tchFail_('Enter the session date and time.');
  if (pillar && TBC_PILLARS.indexOf(pillar) < 0) tchFail_('Unknown pillar.');
  if (link && !/^https?:\/\//i.test(link)) tchFail_('The link must start with http:// or https://');
  append_(table_('TBCSessions'), { SessionID: 'S-' + tchRand_(6), Start: start, Title: title, Pillar: pillar, Link: link, Notes: notes, Audience: aud, CreatedBy: me.TeacherID }, ['Start', 'Title', 'Pillar', 'Link', 'Notes', 'Audience', 'CreatedBy']);
}
function tbcf_sessionDelete_(me, p) {
  const t = table_('TBCSessions'), id = tchClean_(p.sessionId, 40), r = t.rows.filter(function (x) { return String(x.SessionID) === id; })[0];
  if (!r) tchFail_('Session not found.');
  if (!tchAdmin_(me) && key_(r.CreatedBy) !== key_(me.TeacherID)) tchFail_('You can only remove sessions you posted.');
  t.sh.deleteRow(r._row);
}
function tbcFacilitator_(p) {
  try {
    const a = tchAuth_(p.id, p.code);
    if (a.error) return { ok: false, error: a.error };
    const me = a.me, act = String(p.action || ''); let extra = null;
    if (act !== 'tbcf_login') {
      const lock = LockService.getScriptLock();
      lock.waitLock(15000);
      try {
        switch (act) {
          case 'tbcf_report_load': extra = tbcf_reportLoad_(me, p); break;
          case 'tbcf_report_save': tbcf_reportSave_(me, p); extra = tbcf_reportLoad_(me, p); break;
          case 'tbcf_report_end': extra = tbcf_reportEnd_(me, p); break;
          case 'tbcf_report_preview': extra = tbcf_reportPreview_(me, p); break;
          case 'tbcf_attendance': tchAttendance_(me, p); break;
          case 'tbcf_checkin': tbcf_checkin_(me, p); break;
          case 'tbcf_session': tbcf_session_(me, p); break;
          case 'tbcf_session_delete': tbcf_sessionDelete_(me, p); break;
          case 'tbcf_password': tchPassword_(me, p); break;
          default: tchFail_('Unknown action.');
        }
      } finally { lock.releaseLock(); }
    }
    return extra || tbcf_payload_(me);
  } catch (err) {
    if (/^USER:/.test(String(err && err.message))) return { ok: false, error: String(err.message).slice(5) };
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* ===== ADMIN (uses the Admins tab and Admin.gs) ===== */
function tbcAdmin_(p) {
  const q = {}; Object.keys(p).forEach(function (k) { q[k] = p[k]; });
  q.action = String(p.action).replace(/^tbca_/, 'admin_');
  return adminFromRequest(q, true);
}


/* ===== SESSION GUIDES (12 monthly guides) =====
   The catalogue (GD_CAT in GuidesCatalogue.gs) marks them with m (month number). Payment, receipt and the signed
   download link are the same as the Himaayah Store (Guides.gs). A purchase from the student dashboard carries the
   StudentID, and guideCardPayment_ calls tbc_recordGuides_ so the dashboard knows which guides the student owns. */
function tbcGuideMonth_() {   // which month of the programme it is now (0 = not started or no start date set)
  if (!TBC_START) return 0;
  const a = String(TBC_START).slice(0, 7), b = today_().slice(0, 7);
  const n = (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) + 1;
  return n < 1 ? 0 : Math.min(n, 12);
}
function tbcGuideList_() {
  return Object.keys(GD_CAT).filter(function (s) { return GD_CAT[s].m; }).map(function (s) {
    return { Slug: s, Title: GD_CAT[s].t, Month: GD_CAT[s].m, Price: GD_CAT[s].p };
  }).sort(function (a, b) { return a.Month - b.Month; });
}
function tbcGuidesFor_(st) {
  const id = key_(st.StudentID), own = {};
  tbcRows_('TBCGuides').forEach(function (r) { if (key_(r.StudentID) === id && r.Slug && r.Ref) own[String(r.Slug)] = String(r.Ref); });
  return tbcGuideList_().map(function (g) { g.Owned = !!own[g.Slug]; g.Url = g.Owned ? gd_link_(g.Slug, own[g.Slug]) : ''; return g; });
}
function tbcGuidesStaff_(me) {   // facilitators and admins get every guide without paying
  const ref = ('STAFF-' + String(me.TeacherID).trim()).slice(0, 50);
  return tbcGuideList_().map(function (g) { g.Owned = true; g.Url = gd_link_(g.Slug, ref); return g; });
}
function tbc_recordGuides_(studentId, slugs, ref) {   // called from Guides.gs after a confirmed payment
  try {
    const id = key_(studentId); if (!id) return;
    const st = tbcRows_('Students').filter(function (r) { return key_(r.StudentID) === id; })[0];
    if (!st || !tbcIs_(st)) return;
    tchEnsure_(ss_(), 'TBCGuides', TBC_TABS.TBCGuides);
    const t = table_('TBCGuides');
    slugs.forEach(function (s) { if (GD_CAT[s] && GD_CAT[s].m) append_(t, { StudentID: st.StudentID, Slug: s, Ref: ref, Date: today_() }, ['Date', 'Ref']); });
  } catch (e) { console.error(e); }
}

/* ===== MONTHLY REPORT ===== */
function tbcMonth_(m) {
  m = String(m || '').trim();
  if (!m) return today_().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || m > today_().slice(0, 7)) tchFail_('Choose a month that has started.');
  return m;
}
function tbcRpCtx_() {
  const kin = {};
  tbcRows_(typeof EN_TAB === 'string' ? EN_TAB : 'Enrolments').forEach(function (r) {
    const id = key_(r.StudentID); if (!id) return;
    const k = kin[id] = kin[id] || { emails: [], phone: '' };
    [r.KinEmail, r.LoginEmail].forEach(function (e) { e = String(e || '').trim().toLowerCase(); if (validEmail_(e) && k.emails.indexOf(e) < 0) k.emails.push(e); });
    if (!k.phone && r.KinPhone) k.phone = tchWa_(r.KinPhone);
  });
  return { att: tbcRows_('Attendance'), pil: tbcRows_('Pillars'), A: table_('Assignments'), S: table_('Submissions'), kin: kin, saved: tbcRows_('TBCReports') };
}
function tbcRpSaved_(ctx, month, id) {
  return ctx.saved.filter(function (r) { return String(iso_(r.Month) || r.Month).slice(0, 7) === month && key_(r.StudentID) === key_(id); })[0] || null;
}
function tbcRpBuild_(st, month, ctx) {
  const R = rp_range_(month), id = key_(st.StudentID), first = rp_first_(st.Name);
  const a = { Present: 0, Late: 0, Absent: 0, Excused: 0 };
  ctx.att.forEach(function (r) { if (key_(r.StudentID) === id && rp_in_(r.Date, R)) { const x = String(r.Status).trim(); if (a.hasOwnProperty(x)) a[x]++; } });
  const attended = a.Present + a.Late, total = attended + a.Absent;
  const mine = tbcPillarRows_(ctx.pil.filter(function (r) { return key_(r.StudentID) === id; }));
  const pillars = TBC_PILLARS.map(function (name) {
    const all = mine.filter(function (r) { return r.Pillar === name; });   // newest first
    const inM = all.filter(function (r) { return rp_in_(r.Date, R); }), before = all.filter(function (r) { return iso_(r.Date) < R.from; })[0];
    const last = inM[0] || null, avg = inM.length ? Math.round(10 * inM.reduce(function (n, r) { return n + Number(r.Rating); }, 0) / inM.length) / 10 : 0;
    const rating = last ? Number(last.Rating) : 0, prev = before ? Number(before.Rating) : 0;
    return { Pillar: name, Rating: rating, Label: rating ? TBC_RATINGS[rating - 1] : '', Avg: avg, Checks: inM.length, Note: last ? String(last.Note || '') : '',
      Trend: rating && prev ? (rating > prev ? 'up' : rating < prev ? 'down' : 'same') : '' };
  });
  const asg = assignmentsFor_(st, ctx.A, ctx.S).filter(function (x) { return rp_in_(x.Assigned, R) || rp_in_(x.Due, R); });
  const handed = asg.filter(function (x) { return x.Status === 'Submitted' || x.Status === 'Marked'; }).length;
  const scores = asg.filter(function (x) { return x.Status === 'Marked' && Number(x.MaxScore) > 0; }).map(function (x) { return 100 * Number(x.Submission.Score) / Number(x.MaxScore); });
  const saved = tbcRpSaved_(ctx, month, id), kin = ctx.kin[id] || { emails: [], phone: '' };
  let to = kin.emails.slice(0, 2);
  if (!to.length && validEmail_(st.Email)) to = [String(st.Email).trim().toLowerCase()];
  return {
    id: String(st.StudentID).trim(), name: String(st.Name), first: first, month: month, monthName: rp_monthName_(month), facilitator: tbcNames_(st.Teacher),
    att: { attended: attended, total: total, excused: a.Excused, pct: total ? Math.round(100 * attended / total) : null },
    pillars: pillars,
    asg: { given: asg.length, handed: handed, avg: scores.length ? Math.round(scores.reduce(function (n, x) { return n + x; }, 0) / scores.length) : null },
    fee: rp_fee_(st), note: saved ? String(saved.Note || '') : '', focus: saved ? String(saved.Focus || '') : '',
    status: saved && String(saved.Status || '') ? String(saved.Status) : 'Not sent', sent: saved && saved.Sent ? iso_(saved.Sent, true) : '',
    to: to, phone: kin.phone || tchWa_(st.WhatsApp)
  };
}
function tbcRpText_(r, forWa) {
  const L = [];
  L.push('Assalaamu alaykum. This is ' + r.first + '’s Teenagers Building Circle report for ' + r.monthName + '.', '');
  L.push('Attendance: ' + (r.att.total ? r.att.attended + ' of ' + r.att.total + ' sessions (' + r.att.pct + '%)' : 'no sessions recorded') + (r.att.excused ? ', ' + r.att.excused + ' excused' : ''));
  r.pillars.forEach(function (p) { L.push(p.Pillar + ': ' + (p.Rating ? p.Label + ' (' + p.Rating + '/5)' + (p.Trend === 'up' ? ', improving' : p.Trend === 'down' ? ', needs attention' : '') : 'not rated this month') + (p.Note && !forWa ? '. ' + p.Note : '')); });
  L.push('Assignments: ' + (r.asg.given ? r.asg.handed + ' of ' + r.asg.given + ' handed in' + (r.asg.avg !== null ? ', average ' + r.asg.avg + '%' : '') : 'none set this month'));
  if (r.note) L.push('', 'Facilitator’s note: ' + r.note);
  if (r.focus) L.push('', 'Focus for next month: ' + r.focus);
  if (!forWa) L.push('', 'Fees: ' + r.fee.line + ' Pay or check at https://www.himaayahschools.com/pay?id=' + encodeURIComponent(r.id));
  L.push('', (r.facilitator ? r.facilitator + ', ' : '') + SCHOOL_NAME);
  return L.join('\n');
}
function tbcRpHtml_(r) {
  const e = rp_e_, row = function (a, b) { return '<tr><td style="padding:9px 0;border-bottom:1px solid #e3ebf2;color:#5b6b78;width:42%">' + e(a) + '</td><td style="padding:9px 0;border-bottom:1px solid #e3ebf2"><b>' + b + '</b></td></tr>'; };
  const pil = r.pillars.map(function (p) {
    const trend = p.Trend === 'up' ? ' <span style="color:#1b7f4b">&#9650; improving</span>' : p.Trend === 'down' ? ' <span style="color:#c2453d">&#9660; needs attention</span>' : '';
    return '<tr><td style="padding:10px 0;border-bottom:1px solid #e3ebf2;vertical-align:top;width:42%"><b>' + e(p.Pillar) + '</b></td><td style="padding:10px 0;border-bottom:1px solid #e3ebf2">' +
      (p.Rating ? '<b>' + e(p.Label) + '</b> (' + p.Rating + '/5)' + trend + (p.Note ? '<br><span style="color:#5b6b78">' + e(p.Note) + '</span>' : '') : '<span style="color:#5b6b78">Not rated this month</span>') + '</td></tr>';
  }).join('');
  const box = function (title, t) { return t ? '<div style="background:#eef6fc;border-radius:12px;padding:14px 16px;margin:16px 0"><b style="color:#094570">' + e(title) + '</b><br>' + e(t).replace(/\n/g, '<br>') + '</div>' : ''; };
  return '<div style="font-family:Arial,sans-serif;max-width:600px;color:#0b2a3f;line-height:1.55">' +
    '<table width="100%" style="border-bottom:3px solid #094570;padding-bottom:10px"><tr><td><img src="' + GD_SITE + '/logo.png" width="48" height="48" alt="Himaayah Schools" style="vertical-align:middle;border-radius:8px"> <b style="font-size:17px;vertical-align:middle;margin-left:8px">Teenagers Building Circle</b></td><td style="text-align:right;color:#5b6b78;font-size:13px">MONTHLY REPORT<br><b style="color:#0b2a3f">' + e(r.monthName) + '</b></td></tr></table>' +
    '<p>Assalaamu alaykum,</p><p>Here is <b>' + e(r.name) + '</b>’s report for ' + e(r.monthName) + '.</p>' +
    '<h3 style="color:#094570;margin:18px 0 4px">Attendance</h3><table width="100%" style="border-collapse:collapse;font-size:15px">' +
    row('Sessions attended', r.att.total ? r.att.attended + ' of ' + r.att.total + ' (' + r.att.pct + '%)' : 'None recorded') + (r.att.excused ? row('Excused', String(r.att.excused)) : '') + '</table>' +
    '<h3 style="color:#094570;margin:18px 0 4px">The four pillars</h3><table width="100%" style="border-collapse:collapse;font-size:15px">' + pil + '</table>' +
    '<h3 style="color:#094570;margin:18px 0 4px">Assignments</h3><table width="100%" style="border-collapse:collapse;font-size:15px">' +
    row('Handed in', r.asg.given ? r.asg.handed + ' of ' + r.asg.given : 'None set this month') + (r.asg.avg !== null ? row('Average mark', r.asg.avg + '%') : '') + '</table>' +
    box('Facilitator’s note', r.note) + box('Focus for next month', r.focus) +
    '<p style="color:#5b6b78;font-size:13px">Fees: ' + e(r.fee.line) + ' <a href="https://www.himaayahschools.com/pay?id=' + encodeURIComponent(r.id) + '">Pay or check fees</a></p>' +
    '<p>Any questions? Reply to this email or <a href="https://wa.me/' + GD_WA + '">message us on WhatsApp</a>.</p><p>' + e(r.facilitator ? r.facilitator + ', ' : '') + e(SCHOOL_NAME) + '</p></div>';
}
function tbcRpOut_(r) {   // what the facilitator page needs for one student
  const wa = r.phone ? 'https://wa.me/' + r.phone + '?text=' + encodeURIComponent(tbcRpText_(r, true)) : '';
  return { StudentID: r.id, Name: r.name, Att: r.att, Pillars: r.pillars, Asg: r.asg, Note: r.note, Focus: r.focus, Status: r.status, Sent: r.sent, Emails: r.to.length, Wa: wa, Text: tbcRpText_(r, true) };
}
function tbcRpMine_(me) { return tchMine_(me).rows.filter(tbcIs_); }
function tbcf_reportLoad_(me, p) {
  const month = tbcMonth_(p.month), ctx = tbcRpCtx_();
  const rows = tbcRpMine_(me).map(function (st) { return tbcRpOut_(tbcRpBuild_(st, month, ctx)); }).sort(function (a, b) { return String(a.Name).toLowerCase() < String(b.Name).toLowerCase() ? -1 : 1; });
  return { ok: true, report: { month: month, label: rp_monthName_(month), rows: rows, quota: MailApp.getRemainingDailyQuota() } };
}
function tbcRpSave_(me, month, st, note, focus, extra) {   // saves the facilitator's words; extra = {Status, Sent, To}
  tchEnsure_(ss_(), 'TBCReports', TBC_TABS.TBCReports);
  const t = table_('TBCReports'), id = key_(st.StudentID);
  let ex = t.rows.filter(function (r) { return String(iso_(r.Month) || r.Month).slice(0, 7) === month && key_(r.StudentID) === id; })[0];
  if (!ex) {
    append_(t, { Month: month, StudentID: st.StudentID, Name: st.Name, To: '', Status: 'Not sent', Sent: '', Note: note === null ? '' : note, Focus: focus === null ? '' : focus, SentBy: me.TeacherID }, ['Month', 'Note', 'Focus', 'To']);
  } else {
    if (note !== null) put_(t, ex._row, 'Note', note, true);
    if (focus !== null) put_(t, ex._row, 'Focus', focus, true);
  }
  if (extra) {
    ex = table_('TBCReports').rows.filter(function (r) { return String(iso_(r.Month) || r.Month).slice(0, 7) === month && key_(r.StudentID) === id; })[0];
    Object.keys(extra).forEach(function (k) { put_(table_('TBCReports'), ex._row, k, extra[k], k === 'To'); });
    put_(table_('TBCReports'), ex._row, 'SentBy', me.TeacherID, true);
  }
}
function tbcf_reportSave_(me, p) {
  const month = tbcMonth_(p.month), o = tchOne_(me, p.studentId);
  if (!tbcIs_(o.row)) tchFail_('That student is not in the Teenagers Building Circle.');
  tbcRpSave_(me, month, o.row, tchClean_(p.note, 1200), tchClean_(p.focus, 600));
}
function tbcf_reportPreview_(me, p) {   // shows exactly what the parent will receive; nothing is saved or sent
  const month = tbcMonth_(p.month), id = key_(p.studentId);
  const st = tbcRpMine_(me).filter(function (x) { return key_(x.StudentID) === id; })[0];
  if (!st) return { ok: false, error: 'Student not found.' };
  const r = tbcRpBuild_(st, month, tbcRpCtx_());
  if (typeof p.note === 'string') r.note = tchClean_(p.note, 1200);
  if (typeof p.focus === 'string') r.focus = tchClean_(p.focus, 600);
  return { ok: true, preview: { subject: 'Teenagers Building Circle: ' + r.first + '’s report for ' + r.monthName, to: r.to, html: tbcRpHtml_(r) } };
}
function tbcf_reportEnd_(me, p) {
  const month = tbcMonth_(p.month), items = Array.isArray(p.items) ? p.items : [], mine = tbcRpMine_(me), t0 = Date.now();
  const byId = {}; mine.forEach(function (st) { byId[key_(st.StudentID)] = st; });
  items.forEach(function (x) { const st = byId[key_(x && x.studentId)]; if (st) tbcRpSave_(me, month, st, tchClean_(x.note, 1200), tchClean_(x.focus, 600)); });
  const only = Array.isArray(p.only) && p.only.length ? {} : null; if (only) p.only.forEach(function (x) { only[key_(x)] = true; });
  const ctx = tbcRpCtx_(), results = [];
  mine.forEach(function (st) {
    if (only && !only[key_(st.StudentID)]) return;
    const r = tbcRpBuild_(st, month, ctx), id = r.id;
    if (r.status === 'Sent' && !p.resend) { results.push({ StudentID: id, Result: 'Already sent' }); return; }
    if (!r.to.length) { tbcRpSave_(me, month, st, null, null, { Status: 'No email' }); results.push({ StudentID: id, Result: 'No email' }); return; }
    if (MailApp.getRemainingDailyQuota() - r.to.length < TBC_RESERVE || Date.now() - t0 > 240000) { tbcRpSave_(me, month, st, null, null, { Status: 'Waiting' }); results.push({ StudentID: id, Result: 'Waiting' }); return; }
    try {
      MailApp.sendEmail({ to: r.to.join(','), name: SCHOOL_NAME, subject: 'Teenagers Building Circle: ' + r.first + '’s report for ' + r.monthName, body: tbcRpText_(r, false), htmlBody: tbcRpHtml_(r) });
      tbcRpSave_(me, month, st, null, null, { Status: 'Sent', Sent: new Date(), To: r.to.join(', ') });
      results.push({ StudentID: id, Result: 'Sent' });
    } catch (e) { console.error(e); tbcRpSave_(me, month, st, null, null, { Status: 'Failed' }); results.push({ StudentID: id, Result: 'Failed' }); }
  });
  const out = tbcf_reportLoad_(me, { month: month });
  out.results = results;
  return out;
}

/* ===== ENTRY POINT (called from doPost in Code.gs) ===== */
function tbcFromRequest(p) {
  try {
    const act = String(p.action || '');
    if (/^tbcf_/.test(act)) return tbcFacilitator_(p);
    if (/^tbca_/.test(act)) return tbcAdmin_(p);
    if (act === 'tbc_login' || act === 'tbc_submit') return tbcStudent_(p);
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/**
 * Monthly progress reports to parents
 *
 * On the 1st of each month the daily job (Code.gs) queues one report per active student for the
 * month that has just ended, then sends as many as the email quota allows. Whatever is left is
 * sent by the next days' runs, so a big school never runs out of quota in one go.
 *
 * Each report has: attendance, progress (Hifdh, mock scores or course week), work set and handed in,
 * results, the teacher's note for the month (optional) and the fee status with a Pay fees link.
 * It goes to the next-of-kin email from the enrolment form and the student's own email.
 *
 * Tabs (created automatically):
 *   Progress reports   one row per student per month: who it went to and whether it was sent
 *   Report notes       optional: Month (e.g. 2026-10), StudentID, Note. A short comment from the teacher
 *                      for that month's report. Add them before the 1st.
 *   Report snapshots   what was counted last time, so the next report can show the change
 *
 * Menu (Himaayah):
 *   Progress reports: send me a sample   asks for a Student ID and emails that report to you only
 *   Progress reports: send this month's now   queues last month's reports and starts sending
 *
 * SETUP: add this file, then Deploy → Manage deployments → New version. Nothing else:
 * the daily job you already installed runs it.
 */

const RP_ON = true;            // false = no automatic reports
const RP_DAY = 1;              // day of the month reports start going out
const RP_LAST_DAY = 10;        // stop sending a month's reports after this day (they'd be stale)
const RP_RESERVE = 25;         // emails kept back each day for receipts, logins and reminders
const RP_TAB = 'Progress reports';
const RP_HEAD = ['Month', 'StudentID', 'Name', 'Programme', 'To', 'Status', 'Sent', 'Summary'];
const RP_NOTES_TAB = 'Report notes';
const RP_NOTES_HEAD = ['Month', 'StudentID', 'Note', 'By'];
const RP_SNAP_TAB = 'Report snapshots';
const RP_SNAP_HEAD = ['Month', 'StudentID', 'AttPresent', 'AttTotal', 'Juz', 'Hifdh', 'Status', 'Taken'];

/* ===== tabs ===== */
function rp_t_(name, head) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); }
  else {
    const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    head.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h).setFontWeight('bold'); } });
  }
  return table_(name);
}
function rp_tryTable_(name) { try { return table_(name); } catch (e) { return { rows: [], head: [] }; } }

/* ===== months ===== */
function rp_monthKey_(isoDay) { return String(isoDay).slice(0, 7); }                       // 2026-10
function rp_prevMonth_(key) { return addMonths_(key + '-01', -1).slice(0, 7); }
function rp_monthName_(key) {
  const p = key.split('-').map(Number);
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][p[1] - 1] + ' ' + p[0];
}
function rp_range_(key) {   // first and last day of the month
  const from = key + '-01', to = addMonths_(from, 1);
  return { from: from, to: new Date((dn_(to) - 1) * 86400000).toISOString().slice(0, 10), days: dn_(to) - dn_(from) };
}
function rp_in_(v, R) { const d = iso_(v); return !!d && d >= R.from && d <= R.to; }
function rp_first_(name) { return String(name || '').trim().split(/\s+/)[0] || 'your child'; }
function rp_pc_(a, b) { return b ? Math.round(100 * a / b) : null; }

/* ===== who gets a report ===== */
function rp_students_() {
  const out = [];
  const add = function (tab, programme) {
    rp_tryTable_(tab).rows.forEach(function (s) {
      if (!s.StudentID || !s.Name || key_(s.Active) === 'FALSE') return;
      out.push({ tab: tab, s: s, id: String(s.StudentID).trim(), programme: typeof programme === 'function' ? programme(s) : programme });
    });
  };
  add('Students', function (s) { return /tbc|teen/i.test(String(s.Plan) + ' ' + String(s.Level)) ? 'Teenagers Building Circle' : 'Madrasah'; });
  add('AcademyStudents', 'Academy');
  add('SkillsStudents', 'Skills School');
  return out;
}
function rp_emailMap_() {   // StudentID → next-of-kin and login emails from the enrolment form
  const m = {};
  rp_tryTable_(typeof EN_TAB === 'string' ? EN_TAB : 'Enrolments').rows.forEach(function (r) {
    const id = key_(r.StudentID); if (!id) return;
    (m[id] = m[id] || []).push(String(r.KinEmail || ''), String(r.LoginEmail || ''));
  });
  return m;
}
function rp_to_(x, emails) {
  const list = [String(x.s.Email || '')].concat(emails[key_(x.id)] || []).map(function (e) { return e.trim().toLowerCase(); })
    .filter(function (e, i, a) { return validEmail_(e) && a.indexOf(e) === i; });
  return list.slice(0, 3);
}

/* ===== building one report ===== */
function rp_snapshot_(key, id) {
  const t = rp_tryTable_(RP_SNAP_TAB);
  return t.rows.filter(function (r) { return String(r.Month) === key && key_(r.StudentID) === key_(id); })[0] || null;
}
function rp_saveSnap_(key, id, snap) {
  const t = rp_t_(RP_SNAP_TAB, RP_SNAP_HEAD);
  const ex = t.rows.filter(function (r) { return String(r.Month) === key && key_(r.StudentID) === key_(id); })[0];
  const row = ex ? ex._row : t.sh.getLastRow() + 1;
  [['Month', key], ['StudentID', id], ['AttPresent', snap.AttPresent || 0], ['AttTotal', snap.AttTotal || 0], ['Juz', snap.Juz || 0], ['Hifdh', snap.Hifdh || 0], ['Status', snap.Status || ''], ['Taken', new Date()]]
    .forEach(function (kv) { put_(t, row, kv[0], kv[1], kv[0] === 'Month' || kv[0] === 'StudentID' || kv[0] === 'Status'); });
}
function rp_note_(key, id) {
  const n = rp_tryTable_(RP_NOTES_TAB).rows.filter(function (r) { return String(iso_(r.Month) || r.Month).slice(0, 7) === key && key_(r.StudentID) === key_(id) && String(r.Note || '').trim(); })[0];
  return n ? { note: String(n.Note).trim(), by: String(n.By || '').trim() } : null;
}
function rp_fee_(s) {
  const status = payStatus_(s), nd = iso_(s.NextDue);
  return { status: status, nextDue: nd, line: status === 'Exempt' ? 'No fees to pay.' : status === 'Overdue' ? 'Overdue since ' + nice_(nd) + '.'
    : status === 'Due' ? 'Due on ' + nice_(nd) + '.' : nd ? 'Paid up. Next payment due ' + nice_(nd) + '.' : 'Paid up.' };
}

/* Returns { first, programme, sections: [{title, rows:[[label, value]], list:[...]}], highlights:[...], fee, note, snap, milestone } */
function rp_build_(x, key, ctx) {
  const R = rp_range_(key), s = x.s, id = key_(x.id), prev = rp_snapshot_(rp_prevMonth_(key), x.id);
  const rep = { first: rp_first_(s.Name), name: String(s.Name), id: x.id, programme: x.programme, month: rp_monthName_(key), sections: [], highlights: [], fee: rp_fee_(s), note: rp_note_(key, x.id), snap: {}, milestone: '' };

  if (x.tab === 'Students') {
    const pres = Number(s.AttendancePresent) || 0, tot = Number(s.AttendanceTotal) || 0;
    const dp = prev ? Math.max(0, pres - (Number(prev.AttPresent) || 0)) : pres, dt = prev ? Math.max(0, tot - (Number(prev.AttTotal) || 0)) : tot;
    const att = prev ? [['Classes attended', dt ? dp + ' of ' + dt + ' (' + rp_pc_(dp, dt) + '%)' : 'No classes recorded'], ['Since joining', tot ? pres + ' of ' + tot + ' (' + rp_pc_(pres, tot) + '%)' : '–']]
      : [['Classes attended so far', tot ? pres + ' of ' + tot + ' (' + rp_pc_(pres, tot) + '%)' : 'No classes recorded']];
    rep.sections.push({ title: 'Attendance', rows: att });
    if (dt) rep.highlights.push('Attendance ' + rp_pc_(dp, dt) + '%');

    if (x.programme === 'Madrasah') {
      const hif = ctx.hifdh[id] || [], done = hif.filter(function (h) { return /memori[sz]ed|done|complete|finished|revised/i.test(String(h.Status)); }).length;
      const juz = Number(s.Juz) || 0, prevJuz = prev ? Number(prev.Juz) || 0 : null, prevDone = prev ? Number(prev.Hifdh) || 0 : null;
      const rows = [];
      if (s.CurrentSurah) rows.push(['Now memorising', String(s.CurrentSurah) + (s.CurrentAyah ? ', from ayah ' + s.CurrentAyah : '')]);
      if (juz) rows.push(['Juz', String(juz) + (prevJuz != null && juz > prevJuz ? ' (up from ' + prevJuz + ')' : '')]);
      if (hif.length) rows.push(['Surahs completed', String(done) + (prevDone != null && done > prevDone ? ' (' + (done - prevDone) + ' new this month)' : '')]);
      const working = hif.filter(function (h) { return !/memori[sz]ed|done|complete|finished|revised/i.test(String(h.Status)); }).slice(0, 4).map(function (h) { return h.Surah + (h.Status ? ': ' + h.Status : ''); });
      rep.sections.push({ title: 'Hifdh progress', rows: rows.length ? rows : [['Progress', 'The teacher will update this soon.']], list: working.length ? ['Working on: ' + working.join('; ')] : [] });
      if (prevJuz != null && juz > prevJuz) { rep.milestone = 'completed Juz ' + prevJuz + ' and moved on to Juz ' + juz; rep.highlights.push('Moved up to Juz ' + juz); }
      else if (prevDone != null && done > prevDone) rep.highlights.push((done - prevDone) + ' new surah' + (done - prevDone === 1 ? '' : 's') + ' memorised');
      rep.snap.Juz = juz; rep.snap.Hifdh = done;
    }
    rep.snap.AttPresent = pres; rep.snap.AttTotal = tot;

    // work set this month (Assignments) and results
    try {
      const work = assignmentsFor_(s, ctx.A, ctx.S).filter(function (a) { return rp_in_(a.Due || a.Assigned, R); });
      if (work.length) {
        const handed = work.filter(function (a) { return a.Submission; }).length;
        const marked = work.filter(function (a) { return a.Status === 'Marked' && Number(a.MaxScore) > 0; });
        const avg = marked.length ? Math.round(marked.reduce(function (t, a) { return t + 100 * Number(a.Submission.Score) / Number(a.MaxScore); }, 0) / marked.length) : null;
        rep.sections.push({ title: 'Assignments', rows: [['Handed in', handed + ' of ' + work.length], ['Average mark', avg == null ? 'Not marked yet' : avg + '%']] });
        rep.highlights.push(handed + ' of ' + work.length + ' assignments handed in');
      }
    } catch (e) { console.error(e); }
    const res = (ctx.results[id] || []).filter(function (r) { return rp_in_(r.Date, R) && r.Subject; });
    if (res.length) rep.sections.push({ title: 'Results', rows: res.slice(0, 8).map(function (r) { return [String(r.Type ? r.Type + ': ' : '') + r.Subject, r.Score + (r.OutOf ? ' / ' + r.OutOf : '')]; }) });
  }

  if (x.tab === 'AcademyStudents' && typeof acd_metrics_ === 'function') {
    const C = ctx.acd || (ctx.acd = acd_ctx_()), keys = acd_keys_(s), today = today_();
    // attendance in the month
    let pres = 0, tot = 0;
    (C.by(ACD.Attendance)[id] || []).forEach(function (r) {
      if (!rp_in_(r.Date, R)) return;
      const st = String(r.Status || ''); if (!st || st === 'Excused') return;
      tot++; if (st === 'Present' || st === 'Late') pres++;
    });
    rep.sections.push({ title: 'Attendance', rows: [['Classes attended', tot ? pres + ' of ' + tot + ' (' + rp_pc_(pres, tot) + '%)' : 'No classes recorded']] });
    // mocks in the month
    const sit = acd_sittings_({ rows: C.by(ACD.Mocks)[id] || [] }, id).filter(function (q) { return rp_in_(q.Date, R); });
    const mockRows = sit.slice(0, 5).map(function (q) { return [nice_(q.Date) + (q.Type ? ' · ' + q.Type : ''), q.Percent + '%']; });
    if (s.TargetPercent) mockRows.push(['Target', s.TargetPercent + '%']);
    rep.sections.push({ title: 'Mock exams', rows: mockRows.length ? mockRows : [['Mocks', 'No mock this month']] });
    // daily tasks due in the month
    const subs = {}; (C.by(ACD.TaskSubs)[id] || []).forEach(function (r) { subs[String(r.TaskID)] = r; });
    let set = 0, done = 0, mSum = 0, mN = 0;
    C.get(ACD.Tasks).rows.forEach(function (t) {
      if (!t.TaskID || key_(t.Active) === 'FALSE' || !matches_(t.Audience, keys) || !rp_in_(t.Due || t.Created, R)) return;
      const sb = subs[String(t.TaskID)]; set++; if (sb) done++;
      if (sb && sb.Marked !== '' && sb.Score !== '' && Number(t.MaxScore) > 0) { mSum += 100 * Number(sb.Score) / Number(t.MaxScore); mN++; }
    });
    const work = [['Daily tasks handed in', set ? done + ' of ' + set : 'None set']];
    if (mN) work.push(['Average task score', Math.round(mSum / mN) + '%']);
    const kinds = {}; C.get(ACD.Tests).rows.forEach(function (q) { kinds[String(q.TestID)] = String(q.Kind); });
    const cbt = (C.by(ACD.Attempts)[id] || []).filter(function (r) { return r.Submitted && rp_in_(r.Submitted, R) && kinds[String(r.TestID)] !== 'Sunday mock'; });
    if (cbt.length) work.push(['CBT practice', cbt.length + ' test' + (cbt.length === 1 ? '' : 's') + ', average ' + Math.round(cbt.reduce(function (t, r) { return t + (Number(r.Percent) || 0); }, 0) / cbt.length) + '%']);
    const rd = (C.by(ACD.Reading)[id] || []).filter(function (r) { return Number(r.Target) > 0 && rp_in_(r.Week, R); });
    if (rd.length) work.push(['Reading club', Math.round(rd.reduce(function (t, r) { return t + Math.min(100, 100 * (Number(r.Done) || 0) / Number(r.Target)); }, 0) / rd.length) + '% of weekly targets']);
    rep.sections.push({ title: 'Work and practice', rows: work });
    // overall score and leaderboard position (last 30 days, as on the dashboard)
    const board = ctx.board || (ctx.board = acd_board_(C));
    const me = board.filter(function (b) { return key_(b.s.StudentID) === id; })[0];
    const ov = [];
    if (me) ov.push(['Overall score (last 30 days)', Math.round(me.m.overall) + ' / 100'], ['Leaderboard', 'Position ' + me.rank + ' of ' + board.length]);
    if (s.ExamDate) ov.push(['Exam date', nice_(iso_(s.ExamDate))]);
    if (ov.length) rep.sections.push({ title: 'Overall', rows: ov });
    if (tot) rep.highlights.push('Attendance ' + rp_pc_(pres, tot) + '%');
    if (sit.length) rep.highlights.push('Latest mock ' + sit[0].Percent + '%');
    if (set) rep.highlights.push(done + ' of ' + set + ' daily tasks done');
  }

  if (x.tab === 'SkillsStudents' && typeof sk_week_ === 'function') {
    const att = (ctx.skAtt[id] || []).filter(function (r) { return rp_in_(r.Date, R); });
    const p = att.filter(function (r) { return key_(r.Present) === 'YES' || key_(r.Present) === 'TRUE'; }).length;
    rep.sections.push({ title: 'Attendance', rows: [['Classes attended', att.length ? p + ' of ' + att.length + ' (' + rp_pc_(p, att.length) + '%)' : 'No classes recorded']] });
    const weeks = sk_weeks_(s.Course), status = sk_status_(s);
    const course = [['Course', String(s.Course || '')], ['Progress', status === 'In progress' && weeks ? 'Week ' + sk_week_(s) + ' of ' + weeks : status]];
    if (s.Certificate) course.push(['Certificate', String(s.Certificate)]);
    rep.sections.push({ title: 'Course', rows: course });
    const prj = sk_studentProjects_(s, ctx.P, ctx.Sub).filter(function (q) { return rp_in_(q.Due, R) || (q.Submission && rp_in_(q.Submission.Submitted, R)); });
    if (prj.length) {
      rep.sections.push({ title: 'Projects', rows: prj.slice(0, 6).map(function (q) { return [q.Title, q.Status === 'Marked' ? q.Submission.Score + (q.MaxScore ? ' / ' + q.MaxScore : '') : q.Status]; }) });
      rep.highlights.push(prj.filter(function (q) { return q.Submission; }).length + ' of ' + prj.length + ' projects handed in');
    }
    if (att.length) rep.highlights.unshift('Attendance ' + rp_pc_(p, att.length) + '%');
    const prevStatus = prev ? String(prev.Status || '') : '';
    if (/finish|complete/i.test(status) && !/finish|complete/i.test(prevStatus)) { rep.milestone = 'completed the ' + s.Course + ' course'; rep.highlights.push('Finished the course'); }
    rep.snap.Status = status;
  }
  return rep;
}
function rp_ctx_() {
  const by = function (t) { const m = {}; t.rows.forEach(function (r) { const k = key_(r.StudentID); if (k) (m[k] = m[k] || []).push(r); }); return m; };
  return {
    hifdh: by(rp_tryTable_('Hifdh')), results: by(rp_tryTable_('Results')), A: rp_tryTable_('Assignments'), S: rp_tryTable_('Submissions'),
    skAtt: by(rp_tryTable_('SkillsAttendance')), P: rp_tryTable_('SkillsProjects'), Sub: rp_tryTable_('SkillsSubmissions')
  };
}

/* ===== the email ===== */
function rp_e_(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function rp_dash_(programme) {
  return { 'Academy': 'https://www.himaayahschools.com/academy-dashboard.html', 'Skills School': 'https://www.himaayahschools.com/skills-dashboard.html',
           'Teenagers Building Circle': 'https://www.himaayahschools.com/tbc-dashboard.html' }[programme] || DASHBOARD_URL;
}
function rp_email_(rep) {
  const subject = SCHOOL_NAME + ': ' + rep.first + "'s progress report for " + rep.month;
  const feeColor = rep.fee.status === 'Overdue' ? '#B42318' : rep.fee.status === 'Due' ? '#9A5B00' : '#1B7F4B';
  let text = 'Assalaamu alaykum,\n\nHere is ' + rep.first + "'s progress report for " + rep.month + ' (' + rep.programme + ', ' + rep.id + ').\n';
  if (rep.highlights.length) text += '\nThis month: ' + rep.highlights.join(' · ') + '\n';
  let html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#0B1F2E;max-width:560px;margin:0 auto;line-height:1.5">' +
    '<p style="margin:0 0 4px;color:#4A6072;font-size:13px">' + rp_e_(SCHOOL_NAME) + ' · ' + rp_e_(rep.programme) + '</p>' +
    '<h1 style="font-size:22px;margin:0 0 6px">' + rp_e_(rep.first) + '’s progress in ' + rp_e_(rep.month) + '</h1>' +
    '<p style="margin:0 0 18px;color:#4A6072">Assalaamu alaykum. Here is how ' + rp_e_(rep.first) + ' did last month.</p>';
  if (rep.highlights.length) html += '<p style="background:#EEF6FC;border-radius:10px;padding:12px 14px;margin:0 0 18px"><b>This month:</b> ' + rp_e_(rep.highlights.join(' · ')) + '</p>';
  rep.sections.forEach(function (sec) {
    text += '\n' + sec.title.toUpperCase() + '\n' + sec.rows.map(function (r) { return '  ' + r[0] + ': ' + r[1]; }).join('\n') + '\n' + (sec.list || []).map(function (l) { return '  ' + l + '\n'; }).join('');
    html += '<h2 style="font-size:15px;margin:18px 0 6px">' + rp_e_(sec.title) + '</h2><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">' +
      sec.rows.map(function (r) { return '<tr><td style="padding:7px 0;border-bottom:1px solid #E3E9EE;color:#4A6072">' + rp_e_(r[0]) + '</td><td style="padding:7px 0;border-bottom:1px solid #E3E9EE;text-align:right"><b>' + rp_e_(r[1]) + '</b></td></tr>'; }).join('') + '</table>' +
      (sec.list || []).map(function (l) { return '<p style="font-size:13px;color:#4A6072;margin:6px 0 0">' + rp_e_(l) + '</p>'; }).join('');
  });
  if (rep.note) {
    text += '\nFROM ' + (rep.note.by ? rep.note.by.toUpperCase() : 'THE TEACHER') + '\n  ' + rep.note.note + '\n';
    html += '<h2 style="font-size:15px;margin:18px 0 6px">From ' + rp_e_(rep.note.by || 'the teacher') + '</h2><p style="margin:0;background:#F6F4EE;border-radius:10px;padding:12px 14px;white-space:pre-line">' + rp_e_(rep.note.note) + '</p>';
  }
  text += '\nFEES\n  ' + rep.fee.line + (rep.fee.status === 'Paid' || rep.fee.status === 'Exempt' ? '' : '\n  Pay online: ' + payLink_(rep.id)) + '\n';
  html += '<h2 style="font-size:15px;margin:18px 0 6px">Fees</h2><p style="margin:0;color:' + feeColor + '"><b>' + rp_e_(rep.fee.line) + '</b></p>' +
    (rep.fee.status === 'Paid' || rep.fee.status === 'Exempt' ? '' : '<p style="margin:10px 0 0"><a href="' + rp_e_(payLink_(rep.id)) + '" style="display:inline-block;background:#094570;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">Pay fees online</a></p>');
  const dash = rp_dash_(rep.programme);
  text += '\nSee everything on the student dashboard: ' + dash + '\nQuestions? Reply to this email or message us on WhatsApp.\n\nJazakumullahu khayran,\n' + SCHOOL_NAME;
  html += '<p style="margin:22px 0 0;font-size:14px">See the details any time on the <a href="' + rp_e_(dash) + '" style="color:#094570">student dashboard</a>. Questions? Reply to this email.</p>' +
    '<p style="margin:16px 0 0;font-size:14px">Jazakumullahu khayran,<br>' + rp_e_(SCHOOL_NAME) + '</p></div>';
  return { subject: subject, text: text, html: html };
}

/* ===== queue and send ===== */
function rp_queue_(key) {
  const t = rp_t_(RP_TAB, RP_HEAD), have = {};
  t.rows.forEach(function (r) { if (String(r.Month) === key) have[key_(r.StudentID)] = true; });
  const emails = rp_emailMap_(), add = [];
  rp_students_().forEach(function (x) {
    if (have[key_(x.id)]) return;
    const to = rp_to_(x, emails);
    add.push([key, x.id, String(x.s.Name), x.programme, to.join(', '), to.length ? 'Queued' : 'No email', '', '']);
  });
  if (add.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, add.length, RP_HEAD.length).setNumberFormat('@').setValues(add);
  return add.length;
}
function rp_send_(key, maxMs) {
  const start = Date.now(), t = rp_t_(RP_TAB, RP_HEAD), all = {};
  rp_students_().forEach(function (x) { all[key_(x.id)] = x; });
  const ctx = rp_ctx_();
  let sent = 0;
  for (let i = 0; i < t.rows.length; i++) {
    const r = t.rows[i];
    if (String(r.Month) !== key || String(r.Status) !== 'Queued') continue;
    if (Date.now() - start > (maxMs || 240000)) break;
    const to = String(r.To || '').split(/\s*,\s*/).filter(validEmail_);
    if (MailApp.getRemainingDailyQuota() < RP_RESERVE + Math.max(1, to.length)) break;
    const x = all[key_(r.StudentID)];
    if (!x) { put_(t, r._row, 'Status', 'Not active'); continue; }
    try {
      const rep = rp_build_(x, key, ctx), mail = rp_email_(rep);
      MailApp.sendEmail({ to: to.join(','), subject: mail.subject, body: mail.text, htmlBody: mail.html, name: SCHOOL_NAME });
      put_(t, r._row, 'Status', 'Sent'); put_(t, r._row, 'Sent', iso_(new Date(), true), true);
      put_(t, r._row, 'Summary', rep.highlights.join(' · ').slice(0, 300), true);
      rp_saveSnap_(key, x.id, rep.snap);
      if (typeof sp_progressUpdate_ === 'function') { try { sp_progressUpdate_(x, rep, key); } catch (e) { console.error(e); } }   // sponsors (Sponsors.gs)
      sent++;
    } catch (err) { console.error(err); put_(t, r._row, 'Status', 'Error'); put_(t, r._row, 'Summary', String(err.message).slice(0, 200), true); }
  }
  return sent;
}
function rp_dailyJob_() {   // called from dailyJob in Code.gs
  if (!RP_ON) return;
  const today = today_(), day = Number(today.slice(8, 10)), key = rp_prevMonth_(rp_monthKey_(today));
  if (day < RP_DAY || day > RP_LAST_DAY) return;
  const t = rp_t_(RP_TAB, RP_HEAD);
  if (!t.rows.some(function (r) { return String(r.Month) === key; })) rp_queue_(key);
  rp_send_(key);
}
/* For the owner dashboard: how far this month's reports have got */
function rp_status_() {
  const key = rp_prevMonth_(rp_monthKey_(today_())), c = { month: rp_monthName_(key), queued: 0, sent: 0, noEmail: 0, errors: 0, total: 0 };
  rp_tryTable_(RP_TAB).rows.forEach(function (r) {
    if (String(r.Month) !== key) return;
    c.total++; const s = String(r.Status);
    if (s === 'Sent') c.sent++; else if (s === 'Queued') c.queued++; else if (s === 'No email') c.noEmail++; else if (s === 'Error') c.errors++;
  });
  return c;
}

/* ===== menu ===== */
function reportSample() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Progress report sample', 'Student ID to preview (for example HM-0001, AC-0001 or SK-0001). The report is emailed to you only.', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  ui.alert(rp_sample_(a.getResponseText(), Session.getEffectiveUser().getEmail()));
}
function rp_sample_(rawId, to) {
  const id = key_(rawId), x = rp_students_().filter(function (y) { return key_(y.id) === id; })[0];
  if (!x) return 'No active student with the ID ' + rawId + '.';
  if (!validEmail_(to)) return 'Could not find your email address.';
  const key = rp_prevMonth_(rp_monthKey_(today_())), rep = rp_build_(x, key, rp_ctx_()), mail = rp_email_(rep);
  MailApp.sendEmail({ to: to, subject: '[Sample] ' + mail.subject, body: mail.text, htmlBody: mail.html, name: SCHOOL_NAME });
  const would = rp_to_(x, rp_emailMap_());
  return 'Sample sent to ' + to + '. The real report would go to: ' + (would.join(', ') || 'nobody (no email on file)') + '.';
}
function reportsSendNow() {
  const key = rp_prevMonth_(rp_monthKey_(today_()));
  const added = rp_queue_(key), sent = rp_send_(key), st = rp_status_();
  const msg = 'Reports for ' + rp_monthName_(key) + ': ' + st.sent + ' sent, ' + st.queued + ' waiting for tomorrow\'s email quota, ' + st.noEmail + ' with no email on file.' + (added ? ' (' + added + ' added to the list.)' : '');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

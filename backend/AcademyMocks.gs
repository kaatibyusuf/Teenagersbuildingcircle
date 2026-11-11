/**
 * AcademyMocks.gs - the weekly UTME Sunday mock for the Academy (same standard as the scholarship exam).
 *
 * WHAT IT DOES, ON ITS OWN
 *  - Every Thursday evening it builds the coming Sunday's mock: four tests, one for each subject combination (see ACM_COMBOS).
 *    Each is 180 questions: English (60) plus three subjects (40 each), scored out of 400 like the real UTME.
 *    The students on the UTME track see all four in the CBT tab and pick ONE before they start. Sitting one locks the others.
 *  - The mock opens on Sunday at ACM_OPEN_HOUR and the last time to start is ACM_CLOSE_HOUR. Students have ACM_MINUTES once they begin.
 *  - Questions come from the AcademyMockBank tab. Each week the questions used least (and longest ago) are picked, so nothing repeats until the bank is used up.
 *  - The answers and explanations are shown to each student after the mock closes.
 *  - On Monday morning every student gets a report by email (total out of 400, each subject, rank, change since last week, weakest subject),
 *    and the week's leaderboard is shown in the Leaderboard tab of the student dashboard.
 *
 * SETUP (once): Himaayah menu > Academy mock: set up the weekly schedule. Then add questions to the bank (see AcademyMockBankPack1.gs, or paste rows into the AcademyMockBank tab).
 * Needs Academy.gs (updated), and the AcademyMockBank tab is created for you.
 */
const ACM_COMBOS = [
  { key: 'sci', name: 'Sciences and Medicine', group: 'Sciences', subjects: ['English', 'Biology', 'Chemistry', 'Physics'] },
  { key: 'eng', name: 'Engineering and Technology', group: 'Sciences', subjects: ['English', 'Mathematics', 'Physics', 'Chemistry'] },
  { key: 'art', name: 'Arts, Law and Humanities', group: 'Arts', subjects: ['English', 'Literature', 'Government', 'Islamic Studies'] },
  { key: 'soc', name: 'Social Sciences and Management', group: 'Arts', subjects: ['English', 'Mathematics', 'Economics', 'Government'] }
];
const ACM_AUDIENCE = 'UTME';          // the Academy track that sits the mock
const ACM_OPEN_HOUR = 9;              // Sunday, school time
const ACM_CLOSE_HOUR = 21;            // last time to START (Sunday, school time)
const ACM_MINUTES = 120;
const ACM_ENGLISH_Q = 60, ACM_OTHER_Q = 40;
const ACM_REPORT_ABSENT = true;       // also email students who did not sit
const ACM_ADMIN_EMAIL = '';           // leave empty to skip the summary email, or put an address here

function acm_hash_(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function acm_rng_(seed) { let a = acm_hash_(seed); return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function acm_shuffle_(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function acm_need_(sub) { return sub === 'English' ? ACM_ENGLISH_Q : ACM_OTHER_Q; }
function acm_say_(m) { console.log(m); try { ss_().toast(m, 'Academy mock', 12); } catch (e) {} }

/* ---------- the question bank ---------- */
// rows: [subject, passage, question, right, wrong1, wrong2, wrong3, explanation]; skips questions already in the bank
function acm_bankAdd_(rows) {
  const t = acd_t_(ACD.MockBank), have = {};
  t.rows.forEach(function (r) { have[String(r.Subject) + '|' + String(r.Question) + '|' + String(r.Right)] = 1; });
  let n = 0 + t.rows.length; const out = []; let added = 0;
  rows.forEach(function (r) {
    const k = r[0] + '|' + r[2] + '|' + r[3]; if (have[k]) return; have[k] = 1; n++; added++;
    out.push(['MB' + ('00000' + n).slice(-5), r[0], r[1] || '', r[2], r[3], r[4], r[5], r[6], r[7] || '', 0, '', 'TRUE']);
  });
  if (out.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, out.length, ACD_SHEETS[ACD.MockBank].length).setNumberFormat('@').setValues(out);
  return added;
}
function academyMockBankStatus() {
  const t = acd_t_(ACD.MockBank), c = {}, u = {};
  t.rows.forEach(function (r) { if (key_(r.Active) === 'FALSE') return; const s = String(r.Subject); c[s] = (c[s] || 0) + 1; if (!(Number(r.Uses) > 0)) u[s] = (u[s] || 0) + 1; });
  const subs = Object.keys(c).sort(), lines = subs.map(function (s) { return s + ': ' + (u[s] || 0) + ' unused of ' + c[s] + ' (a week needs ' + acm_need_(s) + ')'; });
  acm_say_(lines.length ? lines.join(' | ') : 'The mock bank is empty. Add questions first.');
  return lines;
}

/* ---------- build a week's mock ---------- */
function acm_dayOffset_(days) { return Utilities.formatDate(new Date(Date.now() + days * 86400000), tz_(), 'yyyy-MM-dd'); }
function acm_nextSunday_() {   // the Sunday after today (today excluded)
  const u = Number(Utilities.formatDate(new Date(), tz_(), 'u'));   // 1 = Monday ... 7 = Sunday
  return acm_dayOffset_(7 - u === 0 ? 7 : 7 - u);
}
function academyMockWeekly(sundayIso) {
  const sunday = (typeof sundayIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sundayIso)) ? sundayIso : acm_nextSunday_();
  const series = 'MOCK-' + sunday, lock = LockService.getScriptLock(); lock.waitLock(60000);
  try {
    const T = acd_t_(ACD.Tests);
    if (T.rows.some(function (r) { return String(r.Series) === series; })) { acm_say_('The mock for ' + sunday + ' already exists.'); return { ok: true, existing: true }; }
    const bank = acd_t_(ACD.MockBank), subs = [];
    ACM_COMBOS.forEach(function (c) { c.subjects.forEach(function (s) { if (subs.indexOf(s) < 0) subs.push(s); }); });
    const pick = {}, warn = [];
    subs.forEach(function (s) {
      const pool = bank.rows.filter(function (r) { return String(r.Subject) === s && key_(r.Active) !== 'FALSE' && r.Question; });
      const rnd = acm_rng_(series + '|pick|' + s);
      const ranked = pool.map(function (r) { return { r: r, k: (Number(r.Uses) || 0) * 1e6 + (r.LastUsed ? 5e5 : 0) + rnd() * 1000 }; }).sort(function (a, b) { return a.k - b.k; });
      const need = acm_need_(s);
      if (ranked.length < need) { warn.push(s + ': only ' + ranked.length + ' questions in the bank, needs ' + need); return; }
      const unused = ranked.filter(function (x) { return !(Number(x.r.Uses) > 0); }).length;
      if (unused < need) warn.push(s + ': only ' + unused + ' unused questions were left, so some questions are repeats');
      pick[s] = acm_shuffle_(ranked.slice(0, need).map(function (x) { return x.r; }), acm_rng_(series + '|order|' + s));
    });
    const missing = subs.filter(function (s) { return !pick[s]; });
    if (missing.length) { const m = 'Could not build the mock for ' + sunday + '. Add more questions for: ' + missing.join(', '); acm_say_(m); acm_alert_(m + '\n' + warn.join('\n')); return { ok: false, error: m }; }
    // letters: the right answer is placed in a random position, the same for everyone that week
    const built = {};
    subs.forEach(function (s) {
      built[s] = pick[s].map(function (r, i) {
        const opts = [String(r.Right), String(r.Wrong1), String(r.Wrong2), String(r.Wrong3)], order = acm_shuffle_([0, 1, 2, 3], acm_rng_(series + '|' + r.BankID));
        const L = ['A', 'B', 'C', 'D'], o = {}; order.forEach(function (oi, pos) { o[L[pos]] = opts[oi]; });
        return { Question: (r.Passage ? String(r.Passage) + '\n\n' : '') + String(r.Question), A: o.A, B: o.B, C: o.C, D: o.D, Answer: L[order.indexOf(0)], Explanation: String(r.Explanation || ''), Subj: s };
      });
    });
    const Q = acd_t_(ACD.Questions), head = Q.head, niceDate = nice_(sunday);
    ACM_COMBOS.forEach(function (c) {
      const tid = acd_id_('CB-'); let no = 0; const rows = [];
      c.subjects.forEach(function (s) { built[s].forEach(function (q) { no++; const o = Object.assign({ TestID: tid, No: no }, q); rows.push(head.map(function (h) { return o[h] === undefined ? '' : o[h]; })); }); });
      append_(T, { TestID: tid, Title: 'UTME Sunday Mock · ' + c.name + ' · ' + niceDate, Subject: c.group, Kind: 'Sunday mock', Audience: ACM_AUDIENCE,
        Opens: sunday + 'T' + ('0' + ACM_OPEN_HOUR).slice(-2) + ':00', Closes: sunday + 'T' + ('0' + ACM_CLOSE_HOUR).slice(-2) + ':00', Minutes: ACM_MINUTES, Questions: rows.length,
        TutorID: 'SYSTEM', Active: 'TRUE', Created: today_(), Series: series, Combo: c.name }, ['TestID', 'Title', 'Subject', 'Kind', 'Audience', 'Opens', 'Closes', 'TutorID', 'Created', 'Series', 'Combo']);
      Q.sh.getRange(Q.sh.getLastRow() + 1, 1, rows.length, head.length).setNumberFormat('@').setValues(rows);
    });
    // mark the bank rows as used
    const ids = {}; subs.forEach(function (s) { pick[s].forEach(function (r) { ids[String(r.BankID)] = 1; }); });
    const uc = bank.head.indexOf('Uses') + 1, lc = bank.head.indexOf('LastUsed') + 1, n = bank.rows.length;
    if (n) {
      const uses = bank.sh.getRange(2, uc, n, 1).getValues(), last = bank.sh.getRange(2, lc, n, 1).getValues();
      bank.rows.forEach(function (r, i) { if (ids[String(r.BankID)]) { uses[i][0] = (Number(uses[i][0]) || 0) + 1; last[i][0] = sunday; } });
      bank.sh.getRange(2, uc, n, 1).setValues(uses); bank.sh.getRange(2, lc, n, 1).setValues(last);
    }
    if (warn.length) acm_alert_('The Sunday mock for ' + sunday + ' was created, but:\n' + warn.join('\n') + '\nAdd more questions to the AcademyMockBank tab.');
    acm_say_('Created the Sunday mock for ' + sunday + ' (4 subject combinations).' + (warn.length ? ' Warning: ' + warn.join('; ') : ''));
    return { ok: true, series: series, warnings: warn };
  } finally { lock.releaseLock(); }
}
function academyMockCreateNow() { return academyMockWeekly(); }
function acm_alert_(msg) { if (!ACM_ADMIN_EMAIL) return; try { MailApp.sendEmail({ to: ACM_ADMIN_EMAIL, name: SCHOOL_NAME, subject: SCHOOL_NAME + ' Academy mock: attention', body: msg }); } catch (e) {} }

/* ---------- standings (used by the leaderboard and the report) ---------- */
function acm_series_(C) {   // [{ series, opens, closes, closed, testIds }] newest first
  const m = {}, now = acd_now_();
  C.get(ACD.Tests).rows.forEach(function (x) {
    const s = String(x.Series || ''); if (!s || key_(x.Active) === 'FALSE') return;
    const e = m[s] || (m[s] = { series: s, opens: iso_(x.Opens, true), closes: iso_(x.Closes, true), testIds: [] }); e.testIds.push(String(x.TestID));
  });
  return Object.keys(m).map(function (k) { const e = m[k]; e.closed = !!e.closes && now > e.closes; return e; }).sort(function (a, b) { return a.opens < b.opens ? 1 : -1; });
}
function acm_standings_(C, ser) {   // [{ id, name, total, rank, combo, testId, attemptId }] best first; one result per student
  const ids = {}; ser.testIds.forEach(function (t) { ids[t] = 1; });
  const comboOf = {}; C.get(ACD.Tests).rows.forEach(function (x) { if (ids[String(x.TestID)]) comboOf[String(x.TestID)] = String(x.Combo || ''); });
  const stu = {}; C.get(ACD.Students).rows.forEach(function (s) { if (s.StudentID) stu[key_(s.StudentID)] = s; });
  const best = {};
  C.get(ACD.Attempts).rows.forEach(function (a) {
    if (!a.Submitted || !ids[String(a.TestID)]) return;
    const id = key_(a.StudentID), tot = Number(a.Score) || 0;
    if (!best[id] || tot > best[id].total) best[id] = { id: id, total: tot, combo: comboOf[String(a.TestID)], testId: String(a.TestID), attemptId: String(a.AttemptID), name: stu[id] ? String(stu[id].Name) : id };
  });
  const list = Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); });
  let rank = 0, last = null; list.forEach(function (x, i) { if (x.total !== last) { rank = i + 1; last = x.total; } x.rank = rank; });
  return list;
}
// the Sunday mock board for the student dashboard: the latest mock that has closed, plus this student's last results
function acm_board_(C, st) {
  try {
    const all = acm_series_(C); if (!all.length) return null;
    const cache = CacheService.getScriptCache();
    const closed = all.filter(function (s) { return s.closed; });
    if (!closed.length) return { Open: true, Title: '', Top: [], Total: 0, History: [] };
    const cur = closed[0], ck = 'acm_st_' + cur.series; let list = null;
    try { const c = cache.get(ck); if (c) list = JSON.parse(c); } catch (e) {}
    if (!list) { list = acm_standings_(C, cur); try { cache.put(ck, JSON.stringify(list), 300); } catch (e) {} }
    const me = key_(st.StudentID);
    const top = list.slice(0, 10).map(function (x) { return { Rank: x.rank, Name: acd_short_(x.name), Score: x.total, Combo: x.combo, Me: x.id === me }; });
    const mine = list.filter(function (x) { return x.id === me; })[0];
    const hist = closed.slice(0, 8).map(function (s) {
      const l = s.series === cur.series ? list : acm_standings_(C, s), m = l.filter(function (x) { return x.id === me; })[0];
      return m ? { Date: s.series.replace('MOCK-', ''), Score: m.total, Rank: m.rank, Of: l.length } : null;
    }).filter(Boolean);
    return { Open: false, Date: cur.series.replace('MOCK-', ''), Top: top, Total: list.length, Me: mine ? { Rank: mine.rank, Score: mine.total, Combo: mine.combo } : null, History: hist };
  } catch (e) { console.error(e); return null; }
}

/* ---------- the Monday report ---------- */
function academyMockReport(force) {
  const props = PropertiesService.getScriptProperties();
  const C = acd_ctx_(), all = acm_series_(C), closed = all.filter(function (s) { return s.closed; });
  if (!closed.length) { acm_say_('No mock has closed yet.'); return; }
  const ser = closed[0], flag = 'acm_reported_' + ser.series;
  if (props.getProperty(flag) && force !== true) { acm_say_('The report for ' + ser.series + ' was already sent.'); return; }
  const list = acm_standings_(C, ser), prev = closed[1] ? acm_standings_(C, closed[1]) : [];
  const prevOf = {}; prev.forEach(function (x) { prevOf[x.id] = x; });
  const stu = C.get(ACD.Students).rows.filter(function (s) { return s.StudentID && key_(s.Active) !== 'FALSE' && key_(s.Track) === key_(ACM_AUDIENCE); });
  const qByTest = {}; ser.testIds.forEach(function (t) { qByTest[t] = acd_questions_(t); });
  const attemptRow = {}; C.get(ACD.Attempts).rows.forEach(function (a) { attemptRow[String(a.AttemptID)] = a; });
  const date = nice_(ser.series.replace('MOCK-', '')), top3 = list.slice(0, 3).map(function (x) { return x.rank + '. ' + acd_short_(x.name) + ' (' + x.total + ')'; }).join('\n');
  const avg = list.length ? Math.round(10 * list.reduce(function (a, x) { return a + x.total; }, 0) / list.length) / 10 : 0;
  let sent = 0, absent = 0;
  const by = {}; list.forEach(function (x) { by[x.id] = x; });
  stu.forEach(function (s) {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    const id = key_(s.StudentID), x = by[id], first = String(s.Name || '').split(' ')[0] || 'Student';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s.Email || '').trim())) return;
    let subject, body;
    if (x) {
      const a = attemptRow[x.attemptId], qs = qByTest[x.testId] || []; let ans = {}; try { ans = JSON.parse(String(a.Answers || '{}')); } catch (e) {}
      const bd = acd_breakdown_(qs, ans), weakest = bd.items.slice().sort(function (p, q) { return p.Score - q.Score; })[0];
      const p0 = prevOf[id], delta = p0 ? Math.round(10 * (x.total - p0.total)) / 10 : null;
      subject = 'Your UTME mock: ' + x.total + ' / 400 (position ' + x.rank + ' of ' + list.length + ')';
      body = 'Assalaamu alaykum ' + first + ',\n\nHere is your result for the UTME Sunday mock of ' + date + ' (' + x.combo + ').\n\nTotal: ' + x.total + ' / 400\nPosition: ' + x.rank + ' of ' + list.length + ' students\nAcademy average: ' + avg + '\n' +
        (delta == null ? '' : 'Change since last mock: ' + (delta >= 0 ? '+' : '') + delta + '\n') + '\nBy subject (each out of 100):\n' +
        bd.items.map(function (i) { return '  ' + i.Subject + ': ' + i.Score + '  (' + i.Correct + ' of ' + i.Of + ' right)'; }).join('\n') + '\n\n' +
        (weakest && weakest.Score < 100 ? 'Your weakest subject this week was ' + weakest.Subject + '. Spend extra time there before the next mock.\n\n' : '') +
        'Top of the table:\n' + top3 + '\n\nThe answers and explanations are in the CBT tab of your Academy dashboard. Go through every question you got wrong.\n\nThe next mock is on Sunday at ' + ACM_OPEN_HOUR + ':00. Pick your subject combination before you start.';
    } else if (ACM_REPORT_ABSENT) {
      absent++; subject = 'You missed this Sunday\'s UTME mock'; body = 'Assalaamu alaykum ' + first + ',\n\nYou did not sit the UTME Sunday mock of ' + date + '. The Academy average was ' + avg + ' / 400 across ' + list.length + ' students.\n\nThe answers and explanations are in the CBT tab of your dashboard, so you can still work through the paper. Please make the next one: it counts towards your mock record and the leaderboard.';
    } else return;
    try { MailApp.sendEmail({ to: String(s.Email).trim(), name: SCHOOL_NAME, subject: subject, body: body + '\n\n' + SCHOOL_NAME + '\n' + ACD_DASHBOARD_URL }); sent++; } catch (e) { console.error(e); }
  });
  props.setProperty(flag, new Date().toISOString());
  if (ACM_ADMIN_EMAIL) { try { MailApp.sendEmail({ to: ACM_ADMIN_EMAIL, name: SCHOOL_NAME, subject: SCHOOL_NAME + ' UTME mock summary ' + ser.series.replace('MOCK-', ''), body: list.length + ' students sat the mock. Average ' + avg + ' / 400. Top three:\n' + top3 + '\n' + absent + ' did not sit. ' + sent + ' reports sent.' }); } catch (e) {} }
  acm_say_('Mock report sent: ' + sent + ' email(s). ' + list.length + ' sat, ' + absent + ' absent.');
}
function academyMockReportAgain() { academyMockReport(true); }

/* ---------- schedule ---------- */
function academyMockSetup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { const f = t.getHandlerFunction(); if (f === 'academyMockWeeklyJob' || f === 'academyMockReportJob') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('academyMockWeeklyJob').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(18).create();
  ScriptApp.newTrigger('academyMockReportJob').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  acm_say_('Done. Every Thursday at 6 pm the next Sunday mock is built, and every Monday at 7 am the reports are emailed. Check Project Settings: the time zone must be Africa/Lagos.');
}
function academyMockWeeklyJob() { try { academyMockWeekly(); } catch (e) { console.error(e); acm_alert_('The Sunday mock could not be built: ' + e); } }
function academyMockReportJob() { try { academyMockReport(); } catch (e) { console.error(e); acm_alert_('The mock report failed: ' + e); } }

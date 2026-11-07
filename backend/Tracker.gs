/**
 * Daily revision tracker (tracker.html)
 *
 * What the student sees today comes from the Murajaah tab (StudentID, Day, Portion), the same plan teachers set on the
 * teacher dashboard. If the teacher has not set a plan for today, the student sees one tick box to use when they have revised.
 * Ticks are saved in the "RevisionLog" tab, one row per student, day and portion.
 * Setup: none. The tab is created the first time a student ticks a box (or run setupTracker once).
 *
 * A day counts as revised when at least one of that day's portions is ticked.
 * The streak counts back from today. If today is not ticked yet, yesterday keeps the streak alive.
 */

const TRK_TAB = 'RevisionLog';
const TRK_HEADERS = ['StudentID', 'Date', 'Portion', 'Done', 'Updated'];
const TRK_DEFAULT_PORTION = 'My revision for today';
const TRK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function setupTracker() {
  trk_table_();
  try { ss_().toast('The RevisionLog tab is ready.', SCHOOL_NAME); } catch (e) {}
}
function trk_table_() {
  const ss = ss_();
  let sh = ss.getSheetByName(TRK_TAB);
  if (!sh) {
    sh = ss.insertSheet(TRK_TAB);
    sh.getRange(1, 1, 1, TRK_HEADERS.length).setValues([TRK_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return table_(TRK_TAB);
}
function trk_isoDay_(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
function trk_dow_(isoDay) { return new Date(dn_(isoDay) * 86400000).getUTCDay(); }
function trk_dayMatch_(cell, dow) {   // "Monday", "Mon" or "monday, wednesday"
  const want = TRK_DAYS[dow].slice(0, 3).toLowerCase();
  return String(cell || '').split(/[,;&\/]+/).some(function (x) { return x.trim().slice(0, 3).toLowerCase() === want; });
}
function trk_isTrue_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }

function trk_plan_(st, isoDay) {
  const id = key_(st.StudentID), dow = trk_dow_(isoDay);
  const rows = table_('Murajaah').rows.filter(function (r) { return key_(r.StudentID) === id && r.Day && r.Portion && trk_dayMatch_(r.Day, dow); });
  const seen = {}, out = [];
  rows.forEach(function (r) { const p = String(r.Portion).trim(); if (p && !seen[p]) { seen[p] = 1; out.push(p); } });
  return out;
}

function trk_build_(st) {
  const id = key_(st.StudentID), today = today_(), tn = dn_(today);
  const log = trk_table_().rows.filter(function (r) { return key_(r.StudentID) === id && r.Date; });
  const doneOn = {}, todayDone = {};
  log.forEach(function (r) {
    const d = iso_(r.Date);
    if (trk_isTrue_(r.Done)) { doneOn[d] = true; if (d === today) todayDone[String(r.Portion).trim()] = true; }
  });
  const planned = trk_plan_(st, today);
  const portions = planned.length ? planned : [TRK_DEFAULT_PORTION];
  const tasks = portions.map(function (p) { return { portion: p, done: !!todayDone[p] }; });
  // streaks
  const days = Object.keys(doneOn).sort();
  let longest = 0, run = 0, prev = null;
  days.forEach(function (d) { run = (prev !== null && dn_(d) === prev + 1) ? run + 1 : 1; prev = dn_(d); if (run > longest) longest = run; });
  let streak = 0, cur = doneOn[today] ? tn : tn - 1;
  while (doneOn[trk_isoDay_(cur)]) { streak++; cur--; }
  longest = Math.max(longest, streak);
  const strip = [];
  for (let i = 13; i >= 0; i--) { const d = trk_isoDay_(tn - i); strip.push({ date: d, day: TRK_DAYS[trk_dow_(d)].slice(0, 3), done: !!doneOn[d] }); }
  const monday = tn - ((trk_dow_(today) + 6) % 7);
  let week = 0; for (let n = monday; n <= tn; n++) if (doneOn[trk_isoDay_(n)]) week++;
  return {
    ok: true, student: { name: st.Name, level: st.Level }, today: today, weekday: TRK_DAYS[trk_dow_(today)],
    planned: planned.length > 0, tasks: tasks, streak: streak, longest: longest, totalDays: days.length, week: week, strip: strip
  };
}

function trackerRequest(p) {
  const a = auth_(p.id, p.code);
  if (a.error) return { ok: false, error: a.error };
  const st = a.st;
  if (p.op === 'tick') {
    const today = today_(), portion = String(p.portion || '').trim();
    const allowed = trk_plan_(st, today); if (!allowed.length) allowed.push(TRK_DEFAULT_PORTION);
    if (allowed.indexOf(portion) < 0) return { ok: false, error: 'That revision item is not on today’s plan. Refresh the page and try again.' };
    const want = p.done === true || p.done === 'true';
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const t = trk_table_(), id = key_(st.StudentID);
      const ex = t.rows.filter(function (r) { return key_(r.StudentID) === id && iso_(r.Date) === today && String(r.Portion).trim() === portion; })[0];
      if (ex) { put_(t, ex._row, 'Done', want); put_(t, ex._row, 'Updated', new Date()); }
      else append_(t, { StudentID: String(st.StudentID).trim(), Date: today, Portion: portion, Done: want, Updated: new Date() }, ['Portion']);
    } finally { lock.releaseLock(); }
  }
  return trk_build_(st);
}

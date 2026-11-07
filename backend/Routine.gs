/**
 * Himaayah Daily Hifdh Routine (Routine.gs)
 *
 * Add this as a NEW file next to Code.gs. Every name starts with "rt" or "RT_", so it cannot clash.
 * Uses Code.gs helpers (ss_, table_, put_, append_, iso_, today_, key_, dn_).
 *
 * What it does
 *   Madrasah students (the same students as the recordings card) see "Today's routine" on their dashboard: a short list of steps
 *   (read, listen, memorise, recite by heart, record, revise...). They tick each step, and the ticks are saved here,
 *   one row per student per day, so the routine follows them from phone to laptop and staff can see who keeps it up.
 *   The steps themselves are set in dashboard.html (ROUTINES), so they can be changed without touching this file.
 *
 * Setup: none. The "Routine" tab is created the first time a student ticks a step (or run setupRoutine once).
 */

const RT_TAB = 'Routine';
const RT_HEADERS = ['StudentID', 'Date', 'Done', 'Counts', 'Steps', 'Complete', 'Updated'];
const RT_ELIGIBLE = /hif[dzẓ]|tahf[iīe]|mur[aā]+ja|revision/i;   // same students as the recordings card
const RT_MURAAJAH = /mur[aā]+ja|revision/i;                       // these get the revision routine instead of the new-lesson one
const RT_KEEP_DAYS = 14;                                         // days shown in the streak strip

function setupRoutine() {
  rt_table_();
  try { ss_().toast('The Routine tab is ready.', SCHOOL_NAME); } catch (e) {}
}

function rt_eligible_(st) {   // same students as the recordings card (Recordings.gs), so the two settings never disagree
  if (typeof rec_eligible_ === 'function') return rec_eligible_(st);
  return RT_ELIGIBLE.test(String(st.Plan || '')) || RT_ELIGIBLE.test(String(st.Level || ''));
}
function rt_kind_(st) {
  const lvl = String(st.Level || ''), plan = String(st.Plan || '');
  if (RT_MURAAJAH.test(lvl)) return 'muraajah';
  if (/hif[dzẓ]|tahf/i.test(lvl)) return 'hifdh';
  return RT_MURAAJAH.test(plan) ? 'muraajah' : 'hifdh';
}
function rt_table_() {
  const ss = ss_();
  let sh = ss.getSheetByName(RT_TAB);
  if (!sh) {
    sh = ss.insertSheet(RT_TAB);
    sh.getRange(1, 1, 1, RT_HEADERS.length).setValues([RT_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return table_(RT_TAB);
}
function rt_ids_(v) { return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
function rt_counts_(v) { try { const o = JSON.parse(String(v || '{}')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function rt_full_(r) { const n = Number(r.Steps) || 0; return n > 0 && rt_ids_(r.Done).length >= n; }

/* ===== WHAT THE STUDENT SEES (added to the dashboard payload in Code.gs) ===== */
function rt_forStudent_(st) {
  if (!rt_eligible_(st)) return { enabled: false };
  const id = key_(st.StudentID), today = today_();
  const rows = ss_().getSheetByName(RT_TAB) ? table_(RT_TAB).rows.filter(function (r) { return key_(r.StudentID) === id && r.Date; }) : [];
  const byDay = {};
  rows.forEach(function (r) { byDay[iso_(r.Date)] = r; });
  const t = byDay[today];
  // streak: full days in a row, ending today (or yesterday, so an unfinished today does not break it yet)
  let streak = 0, day = dn_(today);
  if (!(t && rt_full_(t))) day -= 1;
  const isoOf = function (n) { return new Date(n * 86400000).toISOString().slice(0, 10); };
  while (byDay[isoOf(day)] && rt_full_(byDay[isoOf(day)])) { streak++; day--; }
  // best streak and total full days
  const fullDays = Object.keys(byDay).filter(function (k) { return rt_full_(byDay[k]); }).sort();
  let best = 0, run = 0, prev = null;
  fullDays.forEach(function (k) { const n = dn_(k); run = prev !== null && n === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = n; });
  const strip = [];
  for (let i = RT_KEEP_DAYS - 1; i >= 0; i--) {
    const k = isoOf(dn_(today) - i), r = byDay[k];
    strip.push({ date: k, done: r ? rt_ids_(r.Done).length : 0, steps: r ? Number(r.Steps) || 0 : 0, full: !!(r && rt_full_(r)) });
  }
  return { enabled: true, kind: rt_kind_(st), today: today, done: t ? rt_ids_(t.Done) : [], counts: t ? rt_counts_(t.Counts) : {},
    streak: streak, best: Math.max(best, streak), fullDays: fullDays.length, strip: strip };
}

/* ===== STUDENT TICKS A STEP (called from doPost in Code.gs after sign-in) ===== */
function rtStudentRequest(st, p) {
  try {
    if (p.action !== 'rt_save') return { ok: false, error: 'Unknown action.' };
    if (!rt_eligible_(st)) return { ok: false, error: 'The daily routine is for Madrasah students.' };
    const today = today_();
    if (String(p.date || '') !== today) return { ok: false, error: 'A new day has started. Please refresh the page.', stale: true };
    const steps = Math.round(Number(p.steps) || 0);
    if (!(steps >= 1 && steps <= 20)) return { ok: false, error: 'Bad routine.' };
    const done = (Array.isArray(p.done) ? p.done : []).map(function (x) { return String(x); }).filter(function (x) { return /^[a-z0-9-]{1,24}$/.test(x); });
    const uniq = done.filter(function (x, i) { return done.indexOf(x) === i; }).slice(0, steps);
    const counts = {};
    Object.keys(p.counts || {}).slice(0, 20).forEach(function (k) {
      const n = Math.round(Number(p.counts[k]) || 0);
      if (/^[a-z0-9-]{1,24}$/.test(k) && n > 0) counts[k] = Math.min(n, 500);
    });
    const lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      const t = rt_table_(), id = String(st.StudentID).trim();
      const row = t.rows.filter(function (r) { return key_(r.StudentID) === key_(id) && iso_(r.Date) === today; })[0];
      const vals = { Done: uniq.join(','), Counts: JSON.stringify(counts), Steps: steps, Complete: uniq.length >= steps ? 'TRUE' : '', Updated: new Date() };
      if (row) Object.keys(vals).forEach(function (k) { put_(t, row._row, k, vals[k], k === 'Done' || k === 'Counts'); });
      else append_(t, Object.assign({ StudentID: id, Date: today }, vals), ['StudentID', 'Date', 'Done', 'Counts']);
    } finally { lock.releaseLock(); }
    return { ok: true, routine: rt_forStudent_(st) };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Could not save. Please try again.' };
  }
}

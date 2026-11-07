/**
 * Class timetable (timetable.html and the Madrasah student dashboard)
 *
 * One "Timetable" tab holds the weekly classes for every group:
 *   Programme   Madrasah, Academy, Skills School or Teenagers Building Circle
 *   Group       the class: for the Madrasah, the level exactly as in the Students tab (Level column),
 *               e.g. "Thāniyah Ibtidā’iyyah"; for the Academy, the class group; for the Skills School, the course
 *   Day         Monday … Sunday
 *   Start, End  24-hour times such as 20:30 and 21:10 (or 8:30pm)
 *   Subject     e.g. Tawheed
 *   Teacher     optional
 *   Link        optional Google Meet or Telegram link. Only shown to signed-in students, never on the public page.
 *   Notes       optional
 *   Active      FALSE hides a row
 *
 * Students see their group's timetable on their dashboard and can add it to their calendar.
 * The public page timetable.html shows every group (without links).
 *
 * SETUP: add this file, run Himaayah → Set up the timetable once (it creates the tab with the
 * Tamheedi, Thāniyah Ibtidā’iyyah and Rābiʿah Ibtidā’iyyah timetables filled in, and adds any of them that are missing), then Deploy → New version.
 */

const TT_TAB = 'Timetable';
const TT_HEAD = ['Programme', 'Group', 'Day', 'Start', 'End', 'Subject', 'Teacher', 'Link', 'Notes', 'Active'];
const TT_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TT_SEED = [
  // Tamheedi
  ['Madrasah', 'Tamheedi', 'Monday', '19:00', '20:00', 'Arabiyyah'],
  ['Madrasah', 'Tamheedi', 'Monday', '20:30', '21:30', 'Tajweed'],
  ['Madrasah', 'Tamheedi', 'Tuesday', '19:00', '20:00', 'Tawheed'],
  ['Madrasah', 'Tamheedi', 'Tuesday', '20:30', '21:30', 'Fiqh'],
  ['Madrasah', 'Tamheedi', 'Wednesday', '19:00', '20:00', 'Fiqh'],
  ['Madrasah', 'Tamheedi', 'Wednesday', '20:30', '21:30', 'Tajweed'],
  ['Madrasah', 'Tamheedi', 'Thursday', '19:00', '20:00', 'Matn'],
  ['Madrasah', 'Tamheedi', 'Thursday', '20:30', '21:30', 'Hadeeth'],
  // Thāniyah Ibtidā’iyyah
  ['Madrasah', 'Thāniyah Ibtidā’iyyah', 'Monday', '20:30', '21:10', 'Tawheed'],
  ['Madrasah', 'Thāniyah Ibtidā’iyyah', 'Monday', '21:10', '21:50', 'Arabiyyah'],
  ['Madrasah', 'Thāniyah Ibtidā’iyyah', 'Tuesday', '20:30', '21:10', 'Fiqh'],
  ['Madrasah', 'Thāniyah Ibtidā’iyyah', 'Tuesday', '21:10', '21:50', 'Tajweed'],
  ['Madrasah', 'Thāniyah Ibtidā’iyyah', 'Wednesday', '20:30', '21:10', 'Nahw'],
  ['Madrasah', 'Thāniyah Ibtidā’iyyah', 'Wednesday', '21:10', '21:50', 'Seerah'],
  ['Madrasah', 'Thāniyah Ibtidā’iyyah', 'Thursday', '20:30', '21:10', 'Mahfudhah'],
  ['Madrasah', 'Thāniyah Ibtidā’iyyah', 'Thursday', '21:10', '21:50', 'Hadeeth'],
  ['Madrasah', 'Thāniyah Ibtidā’iyyah', 'Saturday', '20:30', '21:10', 'Sarf'],
  // Rābiʿah Ibtidā’iyyah
  ['Madrasah', 'Rābiʿah Ibtidā’iyyah', 'Monday', '19:00', '20:00', 'Seerah'],
  ['Madrasah', 'Rābiʿah Ibtidā’iyyah', 'Monday', '20:30', '21:30', 'Nahw'],
  ['Madrasah', 'Rābiʿah Ibtidā’iyyah', 'Tuesday', '19:00', '20:00', 'Fiqh'],
  ['Madrasah', 'Rābiʿah Ibtidā’iyyah', 'Tuesday', '20:30', '21:30', 'Sarf'],
  ['Madrasah', 'Rābiʿah Ibtidā’iyyah', 'Wednesday', '19:00', '20:00', 'Tawheed'],
  ['Madrasah', 'Rābiʿah Ibtidā’iyyah', 'Wednesday', '20:30', '21:30', 'Arabiyyah'],
  ['Madrasah', 'Rābiʿah Ibtidā’iyyah', 'Thursday', '19:00', '20:00', 'Hadeeth'],
  ['Madrasah', 'Rābiʿah Ibtidā’iyyah', 'Thursday', '20:30', '21:30', 'Mahfudhah'],
  ['Madrasah', 'Rābiʿah Ibtidā’iyyah', 'Saturday', '19:00', '20:00', 'Tajweed']
];

function timetableSetup() {
  const ss = ss_();
  let sh = ss.getSheetByName(TT_TAB), msg;
  if (!sh) { sh = ss.insertSheet(TT_TAB); sh.getRange(1, 1, 1, TT_HEAD.length).setValues([TT_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  /* Adds the starter timetable for every group that has no rows yet. Groups already in the tab are never touched or duplicated. */
  const have = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { have[tt_norm_(r[0])] = true; });
  const add = TT_SEED.filter(function (r) { return !have[tt_norm_(r[1])]; });
  if (add.length) {
    sh.getRange(sh.getLastRow() + 1, 1, add.length, TT_HEAD.length).setNumberFormat('@').setValues(add.map(function (r) { return r.concat(['', '', '', 'TRUE']); }));
    const names = {}; add.forEach(function (r) { names[r[1]] = true; });
    msg = 'Timetable updated. Added: ' + Object.keys(names).join(', ') + '. The Group must match the Level in the Students tab.';
  } else msg = 'The Timetable tab already has every starter group. Edit the rows directly to change a class.';
  try { sh.getRange(2, TT_HEAD.indexOf('Day') + 1, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(TT_DAYS, true).build()); } catch (e) {}
  CacheService.getScriptCache().remove('tt_list');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

/* "20:30", "8:30pm", "8.30 PM" or a time cell → "20:30" */
function tt_time_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'HH:mm');
  const m = String(v || '').trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) return '';
  let h = Number(m[1]); const min = m[2] || '00';
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return h > 23 ? '' : ('0' + h).slice(-2) + ':' + min;
}
function tt_day_(v) {
  const s = String(v || '').trim().toLowerCase();
  return TT_DAYS.filter(function (d) { return s && d.toLowerCase().indexOf(s.slice(0, 3)) === 0; })[0] || '';
}
/* "Thāniyah Ibtidā’iyyah" and "thaniyah ibtidaiyyah" match */
function tt_norm_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function tt_rows_() {
  let t;
  try { t = table_(TT_TAB); } catch (e) { return []; }
  return t.rows.filter(function (r) { return r.Group && key_(r.Active) !== 'FALSE'; }).map(function (r) {
    return { Programme: String(r.Programme || '').trim() || 'Madrasah', Group: String(r.Group).trim(), Day: tt_day_(r.Day), Start: tt_time_(r.Start), End: tt_time_(r.End),
             Subject: String(r.Subject || '').trim(), Teacher: String(r.Teacher || '').trim(), Link: String(r.Link || '').trim(), Notes: String(r.Notes || '').trim() };
  }).filter(function (r) { return r.Day && r.Start; }).sort(function (a, b) {
    return TT_DAYS.indexOf(a.Day) - TT_DAYS.indexOf(b.Day) || (a.Start < b.Start ? -1 : a.Start > b.Start ? 1 : 0);
  });
}

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function timetableFromRequest(p) {
  try {
    if (String(p.action) === 'tt_list') return tt_list_();
    return { ok: false, error: 'Unknown action.' };
  } catch (err) { console.error(err); return { ok: false, error: 'Something went wrong. Please try again.' }; }
}
function tt_list_() {   // public: every group, without links
  const cache = CacheService.getScriptCache(), hit = cache.get('tt_list');
  if (hit) return JSON.parse(hit);
  const out = { ok: true, timezone: 'Africa/Lagos', groups: [] }, seen = {};
  tt_rows_().forEach(function (r) {
    const k = r.Programme + '|' + r.Group;
    if (!seen[k]) { seen[k] = { Programme: r.Programme, Group: r.Group, Classes: [] }; out.groups.push(seen[k]); }
    seen[k].Classes.push({ Day: r.Day, Start: r.Start, End: r.End, Subject: r.Subject, Teacher: r.Teacher, Notes: r.Notes });
  });
  try { cache.put('tt_list', JSON.stringify(out), 600); } catch (e) {}
  return out;
}
/* For a signed-in student's dashboard (links included) */
function tt_forGroup_(group, programme) {
  const g = tt_norm_(group);
  if (!g) return [];
  return tt_rows_().filter(function (r) { return tt_norm_(r.Group) === g && (!programme || r.Programme === programme); })
    .map(function (r) { return { Day: r.Day, Start: r.Start, End: r.End, Subject: r.Subject, Teacher: r.Teacher, Link: r.Link, Notes: r.Notes, Group: r.Group }; });
}

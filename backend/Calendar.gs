/**
 * School calendar (Calendar.gs) for the public page /calendar.
 *
 * Add rows to the "Calendar" tab and they appear on the page within a few minutes. Nothing to deploy again.
 * Columns:
 *   Date       first day, like 2027-01-11 (a real date or text, either works)
 *   EndDate    last day, if it lasts more than a day (optional)
 *   Title      e.g. Second term begins
 *   Type       Term, Exam, Holiday, Event or Deadline
 *   Programme  All, Madrasah, Academy, Skills School or Circle (optional, blank means All)
 *   Note       one short line (optional)
 *   Show       leave blank to show; write FALSE to hide a row without deleting it
 *
 * SETUP: add this file, Deploy → Manage deployments → New version, then in Apps Script run calendarSetup once
 * (or add a row yourself). The page also shows public holidays and Islamic occasions, which are built into the page.
 */
const CAL_TAB = 'Calendar';
const CAL_HEAD = ['Date', 'EndDate', 'Title', 'Type', 'Programme', 'Note', 'Show'];
const CAL_TYPES = ['Term', 'Exam', 'Holiday', 'Event', 'Deadline'];

function calendarSetup() {
  const ss = ss_();
  if (ss.getSheetByName(CAL_TAB)) { Logger.log('The Calendar tab already exists.'); return; }
  const sh = ss.insertSheet(CAL_TAB);
  sh.getRange(1, 1, 1, CAL_HEAD.length).setValues([CAL_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1);
  sh.getRange(2, 1, 1, CAL_HEAD.length).setValues([['', '', 'Example: Second term begins (delete this row)', 'Term', 'All', 'Type a real date in the first column, then clear this note.', 'FALSE']]);
  Logger.log('Calendar tab created. Add your term dates, exams and events.');
}

function calendarFromRequest(p) {
  const cache = CacheService.getScriptCache(), hit = cache.get('cal_v1');
  if (hit) return JSON.parse(hit);
  let rows = [];
  try { rows = table_(CAL_TAB).rows; } catch (e) { rows = []; }
  const out = [];
  rows.forEach(function (r) {
    if (String(r.Show).toUpperCase() === 'FALSE') return;
    const d = iso_(r.Date), title = String(r.Title || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !title) return;
    let e = iso_(r.EndDate); if (!/^\d{4}-\d{2}-\d{2}$/.test(e) || e < d) e = '';
    let type = String(r.Type || '').trim(); type = CAL_TYPES.filter(function (t) { return t.toLowerCase() === type.toLowerCase(); })[0] || 'Event';
    out.push({ d: d, e: e, t: title.slice(0, 120), k: type, p: String(r.Programme || '').trim().slice(0, 40) || 'All', n: String(r.Note || '').trim().slice(0, 200) });
  });
  out.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  const res = { ok: true, events: out.slice(0, 400) };
  try { cache.put('cal_v1', JSON.stringify(res), 300); } catch (e) {}
  return res;
}

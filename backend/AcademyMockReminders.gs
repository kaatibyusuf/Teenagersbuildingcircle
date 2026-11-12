/**
 * AcademyMockReminders.gs - reminders for the Sunday UTME mock (Academy.gs and AcademyMocks.gs must already be in the project).
 *
 * WHAT IT DOES
 *  - Saturday evening: every active UTME student gets an email saying the mock opens tomorrow, with the times and what to do.
 *  - Sunday afternoon: every active UTME student who has NOT started the mock gets a "last chance" email. Starting counts, because
 *    starting a combination locks the others, so a student who is part-way through is not nagged.
 *  - Each reminder is also written to the Reminders tab with a ready-to-send WhatsApp link, so staff can message the students the
 *    emails could not reach (no email address, quota reached, or SEND_EMAILS off). Filter the tab by Type "Academy mock".
 *  - Nothing is sent twice: each reminder has a Key, and the same key is never used again.
 *
 * SETUP (once): run academyMockRemindersSetup. It adds two weekly triggers (Saturday and Sunday).
 * To see who WOULD be reminded without sending anything, run academyMockRemindersPreview and read View > Execution log.
 */
const ACM_REMIND_EVE_HOUR = 17;       // Saturday, school time
const ACM_REMIND_LATE_HOUR = 16;      // Sunday, school time (must be before ACM_CLOSE_HOUR)
const ACM_REMIND_TYPE = 'Academy mock reminder';

/* The mock that is coming up or open: { series, date, opens, closes, testIds } or null. */
function acm_remindSeries_() {
  const C = acd_ctx_(), all = acm_series_(C).filter(function (s) { return !s.closed; });
  if (!all.length) return null;
  const s = all[all.length - 1];   // the soonest one still to come (list is newest first)
  return { series: s.series, date: s.series.replace('MOCK-', ''), opens: s.opens, closes: s.closes, testIds: s.testIds, C: C };
}

/* kind: 'eve' (the day before) or 'late' (the day itself, only those who have not started).
   today / now are optional so this can be tested; normally they come from the clock.
   dry = true returns who would be reminded and sends and writes nothing. */
function acm_remind_(kind, today, now, dry) {
  today = today || today_(); now = now || acd_now_();
  const m = acm_remindSeries_();
  if (!m) return { sent: 0, rows: 0, names: [] };
  const d = dn_(m.date) - dn_(today);
  if (kind === 'eve' && d !== 1) return { sent: 0, rows: 0, names: [] };
  if (kind === 'late' && (d !== 0 || (m.closes && now >= m.closes))) return { sent: 0, rows: 0, names: [] };
  const started = {};
  m.C.get(ACD.Attempts).rows.forEach(function (a) { if (m.testIds.indexOf(String(a.TestID)) >= 0) started[key_(a.StudentID)] = true; });
  const R = dry ? null : table_('Reminders'), seen = {};
  if (R) R.rows.forEach(function (r) { if (r.Key) seen[String(r.Key)] = true; });
  const names = [], rows = [], times = ACM_OPEN_HOUR + ':00 to ' + ACM_CLOSE_HOUR + ':00';
  let sent = 0;
  m.C.get(ACD.Students).rows.forEach(function (s) {
    if (!s.StudentID || key_(s.Active) === 'FALSE' || key_(s.Track) !== key_(ACM_AUDIENCE)) return;
    if (kind === 'late' && started[key_(s.StudentID)]) return;
    const first = String(s.Name || '').split(' ')[0] || 'Student', link = (typeof ACD_DASHBOARD_URL === 'string' ? ACD_DASHBOARD_URL : '');
    const msg = kind === 'eve'
      ? 'Assalaamu alaykum ' + first + '. The UTME Sunday mock opens tomorrow (' + nice_(m.date) + '). You can start any time from ' + ACM_OPEN_HOUR + ':00 to ' + ACM_CLOSE_HOUR + ':00 and you will have ' + ACM_MINUTES + ' minutes once you begin. Pick your subject combination in the CBT tab before you start, because sitting one locks the others. ' + link + ' . Sleep early, charge your device and make sure your data is enough. Jazakumullahu khayran.'
      : 'Assalaamu alaykum ' + first + '. You have not started today\'s UTME mock yet. The last time to start is ' + ACM_CLOSE_HOUR + ':00 tonight, and you need ' + ACM_MINUTES + ' minutes once you begin. Open the CBT tab and pick your subject combination: ' + link + ' . Message us if you have a problem.';
    const key = m.series + '|' + key_(s.StudentID) + '|ACM ' + kind;
    if (seen[key]) return;
    names.push(s.Name);
    if (dry) return;
    seen[key] = true;
    const status = sendEmail_(s, SCHOOL_NAME + ': ' + (kind === 'eve' ? 'UTME mock tomorrow' : 'UTME mock today, not started'), msg);
    if (status === 'Sent') sent++;
    const cells = { Date: today, StudentID: s.StudentID, Name: s.Name, Type: ACM_REMIND_TYPE, Message: msg, WhatsAppLink: waLink_(s.WhatsApp, msg), EmailStatus: status, Done: '', Key: key };
    rows.push(R.head.map(function (h) { return cells[h] === undefined ? '' : cells[h]; }));
  });
  if (rows.length) R.sh.getRange(R.sh.getLastRow() + 1, 1, rows.length, R.head.length).setValues(rows);
  return { sent: sent, rows: rows.length, names: names };
}

function academyMockRemindersEveJob() { try { acm_remind_('eve'); } catch (e) { console.error(e); } }
function academyMockRemindersLateJob() { try { acm_remind_('late'); } catch (e) { console.error(e); } }

function academyMockRemindersSetup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { const f = t.getHandlerFunction(); if (f === 'academyMockRemindersEveJob' || f === 'academyMockRemindersLateJob') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('academyMockRemindersEveJob').timeBased().onWeekDay(ScriptApp.WeekDay.SATURDAY).atHour(ACM_REMIND_EVE_HOUR).create();
  ScriptApp.newTrigger('academyMockRemindersLateJob').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(ACM_REMIND_LATE_HOUR).create();
  acm_say_('Done. Mock reminders go out on Saturday at ' + ACM_REMIND_EVE_HOUR + ':00 and on Sunday at ' + ACM_REMIND_LATE_HOUR + ':00 (to students who have not started). The time zone must be Africa/Lagos.');
}

/* Shows who would be reminded for the next mock, assuming it were the right day. Sends nothing. */
function academyMockRemindersPreview() {
  const m = acm_remindSeries_();
  if (!m) { acm_say_('No upcoming mock found. Build it first (academyMockCreateNow).'); return; }
  const eve = acm_remind_('eve', Utilities.formatDate(new Date((dn_(m.date) - 1) * 86400000), 'UTC', 'yyyy-MM-dd'), '', true);
  const late = acm_remind_('late', m.date, m.date + 'T10:00', true);
  console.log('Mock ' + m.date + '. Saturday email would go to ' + eve.names.length + ': ' + eve.names.join(', '));
  console.log('Sunday "not started" email would go to ' + late.names.length + ' right now: ' + late.names.join(', '));
  acm_say_('Saturday: ' + eve.names.length + ' students. Sunday (not started): ' + late.names.length + '. See View > Execution log.');
}

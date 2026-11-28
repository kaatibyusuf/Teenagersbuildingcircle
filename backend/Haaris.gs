/**
 * Haaris.gs - lets the Haaris assistant see ONE signed-in student's own record, and links a student to the Telegram bot.
 *
 * WHAT IT DOES
 *  - ha_me: the student's Student ID and access code (the same ones the dashboard uses) return a short summary of their own
 *    record: fee status, next class, assignments, latest results, announcements. The website chat uses it after sign-in.
 *  - Telegram linking: the dashboard asks for a one-time link (ha_tgtoken, valid 15 minutes). The student taps it, Telegram opens the
 *    bot, and the bot sends the token back (ha_tgbind). From then on Haaris in Telegram knows who they are (ha_tgme), and reminders
 *    are also pushed to their Telegram (tg_push_, called from runReminders_ in Code.gs).
 *  - Nothing here ever returns an access code. Calls that come from the website server also need the shared secret.
 *
 * SETUP (once)
 *  1. Add this file as a new script file named Haaris. Code.gs already routes the ha_ actions to it.
 *  2. Script properties: TELEGRAM_BOT_TOKEN (from BotFather) and TELEGRAM_BOT_USERNAME (the bot's name without the @).
 *     CARD_SECRET is the same one already used for card payments and Haaris.
 *  3. Deploy, Manage deployments, New version.
 */
const HA_LINK_TAB = 'Telegram links', HA_LINK_HEAD = ['ChatID', 'StudentID', 'Name', 'Linked'];
const HA_TOKEN_SECONDS = 900;

function ha_secretOk_(p) {
  const secret = PropertiesService.getScriptProperties().getProperty('CARD_SECRET');
  return !!secret && same_(String(p.secret || ''), secret);
}
function ha_prop_(k) { return String(PropertiesService.getScriptProperties().getProperty(k) || '').trim(); }
function ha_links_() {
  if (!ss_().getSheetByName(HA_LINK_TAB)) { tchEnsure_(ss_(), HA_LINK_TAB, HA_LINK_HEAD); const sh = ss_().getSheetByName(HA_LINK_TAB); sh.getRange(1, 1, 1000, 2).setNumberFormat('@'); }
  return table_(HA_LINK_TAB);
}
function ha_student_(id) {
  id = key_(id);
  return table_('Students').rows.filter(function (r) { return key_(r.StudentID) === id && key_(r.Active) !== 'FALSE'; })[0] || null;
}

/* A short, safe summary of one student's own record. Never includes the access code. */
function ha_summary_(st) {
  const d = payloadBase_(st), s = d.student;
  const out = {
    name: s.Name, studentId: s.StudentID, level: s.Level, plan: s.Plan, teacher: s.Teacher,
    fee: { status: s.PaymentStatus, nextDue: s.NextDue, monthly: s.MonthlyFee, classesLocked: !!s.ClassLocked },
    attendance: s.AttendanceTotal ? s.AttendancePresent + ' of ' + s.AttendanceTotal + ' classes' : '',
    nextClass: s.NextClass, classLink: s.ClassLocked ? '' : (s.ClassLink || ''),
    progress: { juz: s.Juz, surah: s.CurrentSurah, ayah: s.CurrentAyah },
    assignments: (d.assignments || []).slice(0, 8).map(function (a) {
      return { title: a.Title, due: a.Due, status: a.Status, score: a.Submission && a.Submission.Score !== '' ? a.Submission.Score + '/' + (a.MaxScore || '') : '' };
    }),
    results: (d.results || []).slice(-5).map(function (r) { return { date: r.Date, subject: r.Subject, type: r.Type, score: r.Score + '/' + r.OutOf }; }),
    payments: (d.payments || []).slice(0, 3).map(function (p) { return { date: p.Date, amount: p.Amount, months: p.Months }; }),
    announcements: (d.announcements || []).slice(0, 3).map(function (a) { return { date: a.Date, title: a.Title }; }),
    timetable: d.timetable || []
  };
  return out;
}

function haarisFromRequest(p) {
  const act = String(p.action || '');
  if (act === 'ha_me' || act === 'ha_tgtoken') {                         // the student proves who they are with ID + code
    const a = auth_(p.id, p.code);
    if (a.error) return { ok: false, error: a.error };
    if (act === 'ha_me') return { ok: true, summary: ha_summary_(a.st) };
    const user = ha_prop_('TELEGRAM_BOT_USERNAME');
    if (!user) return { ok: false, error: 'Telegram is not switched on yet.' };
    const token = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
    CacheService.getScriptCache().put('hatg:' + token, key_(a.st.StudentID), HA_TOKEN_SECONDS);
    const linked = ha_links_().rows.some(function (r) { return key_(r.StudentID) === key_(a.st.StudentID); });
    return { ok: true, url: 'https://t.me/' + user + '?start=' + token, linked: linked };
  }
  if (!ha_secretOk_(p)) return { ok: false, error: 'Not allowed' };      // the rest come from the website server only
  const chat = String(p.chatId || '').replace(/\D/g, '');
  if (!chat) return { ok: false, error: 'No chat' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const T = ha_links_();
    const mine = T.rows.filter(function (r) { return String(r.ChatID) === chat; });
    if (act === 'ha_tgbind') {
      const token = String(p.token || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40), cache = CacheService.getScriptCache();
      const sid = token ? cache.get('hatg:' + token) : '';
      if (!sid) return { ok: false, error: 'This link has expired. Open your dashboard and tap Connect Telegram again.' };
      const st = ha_student_(sid);
      if (!st) return { ok: false, error: 'Account not found.' };
      cache.remove('hatg:' + token);
      mine.slice().reverse().forEach(function (r) { T.sh.deleteRow(r._row); });
      append_(T, { ChatID: chat, StudentID: String(st.StudentID).trim(), Name: st.Name, Linked: today_() }, ['ChatID', 'StudentID', 'Name']);
      return { ok: true, name: st.Name };
    }
    if (act === 'ha_tgme') {
      if (!mine.length) return { ok: true, linked: false };
      const st = ha_student_(mine[0].StudentID);
      return st ? { ok: true, linked: true, summary: ha_summary_(st) } : { ok: true, linked: false };
    }
    if (act === 'ha_tgunlink') {
      mine.slice().reverse().forEach(function (r) { T.sh.deleteRow(r._row); });
      return { ok: true, removed: mine.length };
    }
    return { ok: false, error: 'Unknown action' };
  } finally { lock.releaseLock(); }
}

/* Sends a Telegram message to every chat linked to this student. Quiet when Telegram is not set up. Returns how many were sent. */
function tg_push_(studentId, text) {
  const tok = ha_prop_('TELEGRAM_BOT_TOKEN');
  if (!tok || typeof UrlFetchApp === 'undefined') return 0;
  let n = 0;
  try {
    const id = key_(studentId);
    ha_links_().rows.filter(function (r) { return key_(r.StudentID) === id && r.ChatID; }).forEach(function (r) {
      try {
        const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + tok + '/sendMessage', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          payload: JSON.stringify({ chat_id: String(r.ChatID), text: String(text).slice(0, 3500), disable_web_page_preview: true }) });
        if (res.getResponseCode() === 200) n++;
      } catch (e) { console.error('tg_push_ failed: ' + e); }
    });
  } catch (e) { console.error(e); }
  return n;
}

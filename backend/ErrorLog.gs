/**
 * Error log. Add as a NEW file next to Code.gs. Every name starts with "err" or "ERR_".
 *
 * When something fails inside doPost, the problem is written to an "Errors" tab (time, where, what, which action and student),
 * so you can see it without opening the Apps Script editor. A failure in a card payment also emails you at once, because
 * money is involved. errorDigest() emails a short daily summary (menu: Himaayah > Errors: email me a daily summary).
 * Nothing secret is stored: only the action name and the student ID, never an access code or a payload.
 * Logging can never break a request: every step is wrapped.
 */
const ERR_TAB = 'Errors';
const ERR_HEAD = ['Time', 'Where', 'Error', 'Detail', 'Action', 'Who'];
const ERR_KEEP = 500;

function errWho_(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return { action: String(p.action || '').replace(/[^\w.-]/g, '').slice(0, 40), who: String(p.id || p.studentId || '').replace(/[^\w.-]/g, '').slice(0, 30) };
  } catch (x) { return { action: '', who: '' }; }
}
function errLog_(where, err, e) {
  try {
    const w = errWho_(e), msg = String(err && err.message ? err.message : err).slice(0, 300), detail = String(err && err.stack ? err.stack : '').split('\n').slice(0, 4).join(' | ').slice(0, 400);
    const ss = ss_();
    let sh = ss.getSheetByName(ERR_TAB);
    if (!sh) { sh = ss.insertSheet(ERR_TAB); sh.getRange(1, 1, 1, ERR_HEAD.length).setValues([ERR_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
    sh.getRange(sh.getLastRow() + 1, 1, 1, ERR_HEAD.length).setNumberFormat('@').setValues([[iso_(new Date(), true), String(where || ''), msg, detail, w.action, w.who]]);
    if (sh.getLastRow() > ERR_KEEP + 100) sh.deleteRows(2, sh.getLastRow() - ERR_KEEP - 1);
    if (w.action === 'cardPayment') errAlertPayment_(msg);
  } catch (x) { console.error(x); }
}
/* a failed card payment is the one error that cannot wait for the daily summary; at most one email an hour */
function errAlertPayment_(msg) {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('err_pay_alert')) return;
    cache.put('err_pay_alert', '1', 3600);
    const to = Session.getEffectiveUser().getEmail();
    if (to && MailApp.getRemainingDailyQuota() > 0) MailApp.sendEmail({ to: to, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': ATTENTION, a card payment failed to record',
      body: 'A card payment reached the school system, but recording it failed:\n\n' + msg + '\n\nBachs will try again automatically, so it may fix itself. If it does not, check the payment in the Bachs dashboard and look at the "' + ERR_TAB + '" tab.' });
  } catch (x) { console.error(x); }
}

/* daily summary of the last 24 hours; sends nothing on a quiet day */
function errorDigest() {
  const sh = ss_().getSheetByName(ERR_TAB);
  if (!sh || sh.getLastRow() < 2) return 0;
  const since = Date.now() - 86400000, rows = sh.getRange(2, 1, sh.getLastRow() - 1, ERR_HEAD.length).getValues()
    .filter(function (r) { const t = Date.parse(String(r[0]).replace(' ', 'T')); return !isNaN(t) ? t > since : true; });
  if (!rows.length) return 0;
  const count = {};
  rows.forEach(function (r) { const k = r[1] + ' / ' + (r[4] || 'unknown action') + ': ' + r[2]; count[k] = (count[k] || 0) + 1; });
  const lines = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).slice(0, 10).map(function (k) { return count[k] + ' x ' + k; });
  const to = Session.getEffectiveUser().getEmail();
  if (to && MailApp.getRemainingDailyQuota() > 0) MailApp.sendEmail({ to: to, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': ' + rows.length + ' error' + (rows.length === 1 ? '' : 's') + ' in the last 24 hours',
    body: 'Here is what failed in the school system in the last 24 hours:\n\n' + lines.join('\n') + '\n\nFull details are in the "' + ERR_TAB + '" tab.' });
  return rows.length;
}
function errorDigestInstall() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'errorDigest') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('errorDigest').timeBased().everyDays(1).atHour(7).create();
  try { ss_().toast('You will get a short email each morning if anything failed.', SCHOOL_NAME); } catch (x) {}
}

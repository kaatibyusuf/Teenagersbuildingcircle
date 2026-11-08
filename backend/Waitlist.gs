/**
 * Waitlist for closed plans
 *
 * The website page waitlist.html sends action "waitlist" here. Each family is saved once per plan
 * on a "Waitlist" tab (created automatically) and gets a short confirmation email.
 *
 * When a plan reopens:
 *   1. Remove it from EN_CLOSED_PLANS in Enrol.gs (and open it on the website).
 *   2. Sheet menu Himaayah → "Email the waitlist (reopened plans)".
 *      Everyone still "Waiting" for a plan that is no longer closed gets an email with an
 *      enrolment link for that plan, and their Status changes to "Notified".
 * You can also change Status by hand: Waiting, Notified, Enrolled, Removed.
 *
 * SETUP: add this file to the Apps Script project, then Deploy → Manage deployments → New version.
 */

const WL_TAB = 'Waitlist';
const WL_HEAD = ['Joined', 'Ref', 'Plan', 'StudentName', 'StudentAge', 'ParentName', 'Email', 'WhatsApp', 'PreferredTimes', 'Note', 'Status', 'Notified'];
const WL_JOINS_PER_HOUR = 60;   // simple protection against spam
const WL_NOTIFY_STAFF = true;   // email the school account about each new waitlist entry
const WL_PLAN_SLUGS = {         // plan → link slug for enroll.html (keep in step with enroll.html PLAN_SLUGS)
  'Madrasah — Hifdh Only (Group)': 'hifdh-group',
  'Madrasah — Full Madrasah (Group)': 'full-group',
  'Madrasah — Full Madrasah (Group, hifdh completed elsewhere)': 'full-group-completed',
  'Madrasah — One-Year Hifdh': 'one-year'
};

function wl_sheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(WL_TAB);
  if (!sh) {
    sh = ss.insertSheet(WL_TAB);
    sh.getRange(1, 1, 1, WL_HEAD.length).setValues([WL_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(['Waiting', 'Notified', 'Enrolled', 'Removed'], true).setAllowInvalid(false).build();
    sh.getRange(2, WL_HEAD.indexOf('Status') + 1, 1000, 1).setDataValidation(rule);
  }
  return sh;
}

function waitlistFromRequest(p) {
  try {
    if (String(p.website || '')) return { ok: true, ref: 'WL-OK' };   // honeypot field filled: a bot, pretend it worked
    const clean = function (v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); };
    const d = {
      plan: clean(p.plan, 120), student: clean(p.studentName, 100), age: clean(p.studentAge, 10), parent: clean(p.parentName, 100),
      email: clean(p.email, 200).toLowerCase(), phone: clean(p.whatsapp, 30), times: clean(p.preferredTimes, 200), note: clean(p.note, 500)
    };
    if (!WL_PLAN_SLUGS[d.plan]) return { ok: false, error: 'Choose a plan.' };
    if (EN_CLOSED_PLANS.indexOf(d.plan) < 0) return { ok: false, open: true, error: 'Good news: this plan is open now. You can enrol straight away.' };
    if (!d.student || !d.parent) return { ok: false, error: 'Enter the student’s and parent’s names.' };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return { ok: false, error: 'Enter a valid email address.' };
    if (d.phone.replace(/\D/g, '').length < 10) return { ok: false, error: 'Enter a WhatsApp number we can reach.' };

    const cache = CacheService.getScriptCache(), n = Number(cache.get('wljoins') || 0);
    if (n >= WL_JOINS_PER_HOUR) return { ok: false, error: 'Too many requests right now. Please try again later.' };
    cache.put('wljoins', String(n + 1), 3600);

    let ref = '', place = 0, isNew = true;
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const sh = wl_sheet_(), last = sh.getLastRow();
      const rows = last > 1 ? sh.getRange(2, 1, last - 1, WL_HEAD.length).getValues() : [];
      const col = function (h) { return WL_HEAD.indexOf(h); };
      let found = -1;
      rows.forEach(function (r, i) {
        if (String(r[col('Plan')]) !== d.plan || String(r[col('Status')]) !== 'Waiting') return;
        place++;
        if (found < 0 && String(r[col('Email')]).toLowerCase() === d.email && key_(r[col('StudentName')]) === key_(d.student)) found = i;
      });
      const values = function (refVal, joined) {
        return [joined, refVal, d.plan, d.student, d.age, d.parent, d.email, d.phone, d.times, d.note, 'Waiting', ''];
      };
      if (found >= 0) {   // already waiting: update their details, keep their place
        isNew = false; ref = String(rows[found][col('Ref')]);
        place = 0;
        for (let i = 0; i <= found; i++) if (String(rows[i][col('Plan')]) === d.plan && String(rows[i][col('Status')]) === 'Waiting') place++;
        sh.getRange(found + 2, 1, 1, WL_HEAD.length).setNumberFormat('@').setValues([values(ref, String(rows[found][col('Joined')]))]);
      } else {
        ref = 'WL-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
        place++;
        sh.getRange(last + 1, 1, 1, WL_HEAD.length).setNumberFormat('@').setValues([values(ref, iso_(new Date(), true))]);
      }
    } finally { lock.releaseLock(); }

    const short = d.plan.replace(/^Madrasah — /, '');
    if (isNew) {
      try {
        if (MailApp.getRemainingDailyQuota() > 1) {
          MailApp.sendEmail({ to: d.email, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': you are on the waitlist for ' + short,
            body: 'Assalaamu alaykum ' + d.parent.split(' ')[0] + ',\n\n' + d.student + ' is on the waitlist for Madrasah ' + short + ' (number ' + place + ' in line). ' +
                  'We will email you as soon as a place opens, with a link to enrol.\n\nYour reference: ' + ref + '\n\n' +
                  'While you wait, private (one-on-one) classes are open now: https://www.himaayahschools.com/madrasah.html#plans\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
          if (WL_NOTIFY_STAFF) {
            const to = Session.getEffectiveUser().getEmail();
            if (to) MailApp.sendEmail({ to: to, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': new waitlist entry (' + short + ')',
              body: d.student + ' joined the waitlist for ' + d.plan + ' (number ' + place + ').\nParent: ' + d.parent + '\nEmail: ' + d.email + '\nWhatsApp: ' + d.phone +
                    (d.times ? '\nPreferred times: ' + d.times : '') + (d.note ? '\nNote: ' + d.note : '') + '\nReference: ' + ref });
          }
        }
      } catch (err) { console.error(err); }
    }
    return { ok: true, ref: ref, place: place, updated: !isNew };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* Menu: email everyone waiting for a plan that is open again */
function emailWaitlist() {
  const sh = wl_sheet_(), last = sh.getLastRow();
  if (last < 2) { wl_say_('The waitlist is empty.'); return; }
  const rows = sh.getRange(2, 1, last - 1, WL_HEAD.length).getValues();
  const col = function (h) { return WL_HEAD.indexOf(h); };
  let sent = 0, skipped = 0;
  rows.forEach(function (r, i) {
    const plan = String(r[col('Plan')]);
    if (String(r[col('Status')]) !== 'Waiting' || EN_CLOSED_PLANS.indexOf(plan) >= 0) return;
    if (MailApp.getRemainingDailyQuota() < 1) { skipped++; return; }
    const short = plan.replace(/^Madrasah — /, ''), link = 'https://www.himaayahschools.com/enroll.html?programme=madrasah&plan=' + (WL_PLAN_SLUGS[plan] || '');
    try {
      MailApp.sendEmail({ to: String(r[col('Email')]), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': ' + short + ' is open, enrol now',
        body: 'Assalaamu alaykum ' + String(r[col('ParentName')]).split(' ')[0] + ',\n\nGood news: Madrasah ' + short + ' is taking new students again, and ' + r[col('StudentName')] +
              ' was on our waitlist. Places are limited and go in order of enrolment.\n\nEnrol here: ' + link + '\n\nYour waitlist reference: ' + r[col('Ref')] + '\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
      sh.getRange(i + 2, col('Status') + 1).setValue('Notified');
      sh.getRange(i + 2, col('Notified') + 1).setNumberFormat('@').setValue(iso_(new Date(), true));
      sent++;
    } catch (err) { console.error(err); skipped++; }
  });
  wl_say_(sent ? 'Emailed ' + sent + ' famil' + (sent === 1 ? 'y' : 'ies') + ' about reopened plans.' + (skipped ? ' ' + skipped + ' could not be sent (daily email limit); run it again tomorrow.' : '')
               : 'Nobody to email. Only people still "Waiting" for a plan that is no longer in EN_CLOSED_PLANS (Enrol.gs) are emailed.');
}
function wl_say_(msg) {
  console.log(msg);
  try { ss_().toast(msg, 'Waitlist', 10); } catch (e) {}
}


/* Automatic: emails the waitlist once a day for any plan that is no longer in EN_CLOSED_PLANS.
   Install it once from the sheet menu: Himaayah → "Email the waitlist automatically every day". */
function waitlistAuto() { try { emailWaitlist(); } catch (e) { console.error(e); } }
function setupWaitlistAuto() {
  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'waitlistAuto'; });
  if (!has) ScriptApp.newTrigger('waitlistAuto').timeBased().everyDays(1).atHour(9).create();
  wl_say_(has ? 'The daily waitlist email is already switched on.' : 'Done. Every morning, families waiting for a plan that has reopened are emailed automatically.');
}

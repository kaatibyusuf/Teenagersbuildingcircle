/**
 * Newsletter: "Get new articles by email"
 *
 * The signup box on the Articles pages sends action "subscribe" here; the unsubscribe link in
 * every email opens newsletter.html, which sends action "unsubscribe". Subscribers are kept on a
 * "Subscribers" tab (created automatically). Each new subscriber gets a short welcome email.
 *
 * SENDING A NEWSLETTER (from the sheet, no coding)
 *   1. Open the "Newsletter" tab (menu Himaayah → "Set up the newsletter tabs" creates it).
 *   2. Add a row: Subject, Body (plain text; blank lines become paragraphs), Audience
 *      ("All", or one interest: Madrasah, Academy, Skills School, Teenagers Building Circle),
 *      and set Status to "Ready".
 *   3. Optional: Himaayah → "Send me a test of the newsletter" sends it only to you.
 *   4. Himaayah → "Send ready newsletters". Gmail limits how many emails go out per day, so a
 *      big list may take more than one day: the daily job carries on automatically until every
 *      subscriber has it, then Status becomes "Sent".
 *
 * SETUP: add this file to the Apps Script project, run "Set up the newsletter tabs" once from the
 * Himaayah menu, then Deploy → Manage deployments → New version.
 */

const NL_SUBS_TAB = 'Subscribers';
const NL_SUBS_HEAD = ['Joined', 'Email', 'Name', 'Interests', 'Source', 'Status', 'Token', 'LastCampaign', 'Unsubscribed'];
const NL_TAB = 'Newsletter';
const NL_HEAD = ['CampaignID', 'Subject', 'Body', 'Audience', 'Status', 'Sent', 'Started', 'Finished'];
const NL_INTERESTS = ['Madrasah', 'Academy', 'Skills School', 'Teenagers Building Circle'];
const NL_PAGE = 'https://www.himaayahschools.com/newsletter.html';
const NL_SIGNUPS_PER_HOUR = 100;   // simple protection against spam
const NL_KEEP_QUOTA = 20;          // emails left in the daily quota for reminders and receipts

function nl_sheet_(name, head) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function newsletterSetup() {
  nl_sheet_(NL_SUBS_TAB, NL_SUBS_HEAD);
  const sh = nl_sheet_(NL_TAB, NL_HEAD);
  const rule = function (list) { return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build(); };
  sh.getRange(2, NL_HEAD.indexOf('Status') + 1, 500, 1).setDataValidation(rule(['Draft', 'Ready', 'Sending', 'Sent']));
  sh.getRange(2, NL_HEAD.indexOf('Audience') + 1, 500, 1).setDataValidation(rule(['All'].concat(NL_INTERESTS)));
  sh.setColumnWidth(NL_HEAD.indexOf('Body') + 1, 480);
  sh.getRange(2, NL_HEAD.indexOf('Body') + 1, 500, 1).setWrap(true);
  nl_say_('Newsletter tabs are ready. Write a newsletter on the "Newsletter" tab.');
}
function nl_say_(msg) { console.log(msg); try { ss_().toast(msg, 'Newsletter', 10); } catch (e) {} }
function nl_rows_(sh, head) {
  const last = sh.getLastRow();
  return last > 1 ? sh.getRange(2, 1, last - 1, head.length).getValues() : [];
}

/* ===== website requests ===== */
function newsletterFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (a === 'subscribe') return nl_subscribe_(p);
    if (a === 'unsubscribe') return nl_unsubscribe_(p);
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

function nl_subscribe_(p) {
  if (String(p.website || '')) return { ok: true };   // honeypot filled: a bot
  const email = String(p.email || '').trim().toLowerCase().slice(0, 200);
  const name = String(p.name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
  const source = String(p.source || '').replace(/[^\w\/.\-]/g, '').slice(0, 120);
  const interests = (Array.isArray(p.interests) ? p.interests : String(p.interests || '').split(','))
    .map(function (s) { return String(s).trim(); }).filter(function (s) { return NL_INTERESTS.indexOf(s) >= 0; });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };

  const cache = CacheService.getScriptCache(), n = Number(cache.get('nlsignups') || 0);
  if (n >= NL_SIGNUPS_PER_HOUR) return { ok: false, error: 'Too many requests right now. Please try again later.' };
  cache.put('nlsignups', String(n + 1), 3600);

  let token = '', status = 'new';
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = nl_sheet_(NL_SUBS_TAB, NL_SUBS_HEAD), rows = nl_rows_(sh, NL_SUBS_HEAD);
    const c = function (h) { return NL_SUBS_HEAD.indexOf(h); };
    const i = rows.findIndex(function (r) { return String(r[c('Email')]).toLowerCase() === email; });
    if (i >= 0) {
      const r = rows[i], row = i + 2;
      token = String(r[c('Token')]) || Utilities.getUuid().replace(/-/g, '');
      const merged = String(r[c('Interests')]).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      interests.forEach(function (s) { if (merged.indexOf(s) < 0) merged.push(s); });
      status = String(r[c('Status')]) === 'Subscribed' ? 'already' : 'back';
      sh.getRange(row, c('Interests') + 1).setValue(merged.join(', '));
      if (name && !r[c('Name')]) sh.getRange(row, c('Name') + 1).setNumberFormat('@').setValue(name);
      sh.getRange(row, c('Status') + 1).setValue('Subscribed');
      sh.getRange(row, c('Token') + 1).setValue(token);
      sh.getRange(row, c('Unsubscribed') + 1).setValue('');
    } else {
      token = Utilities.getUuid().replace(/-/g, '');
      sh.getRange(sh.getLastRow() + 1, 1, 1, NL_SUBS_HEAD.length).setNumberFormat('@')
        .setValues([[iso_(new Date(), true), email, name, interests.join(', '), source, 'Subscribed', token, '', '']]);
    }
  } finally { lock.releaseLock(); }

  if (status !== 'already') {
    try {
      if (MailApp.getRemainingDailyQuota() > NL_KEEP_QUOTA) MailApp.sendEmail({ to: email, name: SCHOOL_NAME, subject: 'Welcome to the ' + SCHOOL_NAME + ' newsletter',
        body: 'Assalaamu alaykum' + (name ? ' ' + name.split(' ')[0] : '') + ',\n\nThank you for subscribing. We will email you when we publish a new article, and when new terms and classes open. Not often, and never spam.\n\n' +
              'Read the latest articles: https://www.himaayahschools.com/articles.html\n\nJazakumullahu khayran,\n' + SCHOOL_NAME + '\n\n' + nl_footer_(token) });
    } catch (err) { console.error(err); }
  }
  return { ok: true, already: status === 'already', back: status === 'back' };
}

function nl_unsubscribe_(p) {
  const token = String(p.token || '').replace(/[^a-f0-9]/gi, '').slice(0, 40);
  if (token.length < 20) return { ok: false, error: 'This unsubscribe link is not valid.' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = nl_sheet_(NL_SUBS_TAB, NL_SUBS_HEAD), rows = nl_rows_(sh, NL_SUBS_HEAD);
    const c = function (h) { return NL_SUBS_HEAD.indexOf(h); };
    const i = rows.findIndex(function (r) { return String(r[c('Token')]) === token; });
    if (i < 0) return { ok: false, error: 'This unsubscribe link is not valid.' };
    sh.getRange(i + 2, c('Status') + 1).setValue('Unsubscribed');
    sh.getRange(i + 2, c('Unsubscribed') + 1).setNumberFormat('@').setValue(iso_(new Date(), true));
    return { ok: true, email: String(rows[i][c('Email')]).replace(/^(.).*?(@.*)$/, '$1***$2') };
  } finally { lock.releaseLock(); }
}

function nl_footer_(token) {
  return '—\nYou are receiving this because you subscribed on himaayahschools.com.\nUnsubscribe: ' + NL_PAGE + '?unsub=' + token;
}

/* ===== sending ===== */
function nl_campaign_(forTest) {
  const sh = nl_sheet_(NL_TAB, NL_HEAD), rows = nl_rows_(sh, NL_HEAD), c = function (h) { return NL_HEAD.indexOf(h); };
  const want = forTest ? ['Sending', 'Ready', 'Draft'] : ['Sending', 'Ready'];
  for (let w = 0; w < want.length; w++) {
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][c('Status')]) !== want[w] || !String(rows[i][c('Subject')]).trim()) continue;
      let id = String(rows[i][c('CampaignID')]).trim();
      if (!id && !forTest) { id = 'NL-' + Utilities.getUuid().slice(0, 6).toUpperCase(); sh.getRange(i + 2, c('CampaignID') + 1).setValue(id); }
      return { sh: sh, row: i + 2, id: id, subject: String(rows[i][c('Subject')]).trim(), body: String(rows[i][c('Body')]).trim(),
               audience: String(rows[i][c('Audience')] || 'All').trim() || 'All', sent: Number(rows[i][c('Sent')]) || 0, c: c };
    }
  }
  return null;
}
function nl_body_(cmp, name, token) {
  return 'Assalaamu alaykum' + (name ? ' ' + String(name).split(' ')[0] : '') + ',\n\n' + cmp.body + '\n\n' + SCHOOL_NAME + '\nhttps://www.himaayahschools.com\n\n' + nl_footer_(token);
}

function newsletterTest() {
  const cmp = nl_campaign_(true), to = Session.getEffectiveUser().getEmail();
  if (!cmp) { nl_say_('Write a newsletter on the "Newsletter" tab first (Subject and Body).'); return; }
  MailApp.sendEmail({ to: to, name: SCHOOL_NAME, subject: '[TEST] ' + cmp.subject, body: nl_body_(cmp, '', 'test-link-not-active') });
  nl_say_('Test sent to ' + to + '.');
}

/* Menu "Send ready newsletters", and the daily job, which carries on until everyone has it */
function newsletterSend() {
  const cmp = nl_campaign_(false);
  if (!cmp) { nl_say_('Nothing to send. Set a newsletter\'s Status to "Ready" on the "Newsletter" tab.'); return 0; }
  const subs = nl_sheet_(NL_SUBS_TAB, NL_SUBS_HEAD), rows = nl_rows_(subs, NL_SUBS_HEAD), s = function (h) { return NL_SUBS_HEAD.indexOf(h); };
  if (String(cmp.sh.getRange(cmp.row, cmp.c('Status') + 1).getValue()) !== 'Sending') {
    cmp.sh.getRange(cmp.row, cmp.c('Status') + 1).setValue('Sending');
    cmp.sh.getRange(cmp.row, cmp.c('Started') + 1).setNumberFormat('@').setValue(iso_(new Date(), true));
  }
  let sent = 0, left = 0;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[s('Status')]) !== 'Subscribed' || String(r[s('LastCampaign')]) === cmp.id) continue;
    if (cmp.audience !== 'All' && String(r[s('Interests')]).split(',').map(function (x) { return x.trim(); }).indexOf(cmp.audience) < 0) continue;
    if (MailApp.getRemainingDailyQuota() <= NL_KEEP_QUOTA || Date.now() - t0 > 240000) { left++; continue; }
    try {
      MailApp.sendEmail({ to: String(r[s('Email')]), name: SCHOOL_NAME, subject: cmp.subject, body: nl_body_(cmp, r[s('Name')], String(r[s('Token')])) });
      subs.getRange(i + 2, s('LastCampaign') + 1).setValue(cmp.id);
      sent++;
    } catch (err) { console.error(err); left++; }
  }
  cmp.sh.getRange(cmp.row, cmp.c('Sent') + 1).setValue(cmp.sent + sent);
  if (!left) {
    cmp.sh.getRange(cmp.row, cmp.c('Status') + 1).setValue('Sent');
    cmp.sh.getRange(cmp.row, cmp.c('Finished') + 1).setNumberFormat('@').setValue(iso_(new Date(), true));
  }
  nl_say_('Sent "' + cmp.subject + '" to ' + sent + ' subscriber' + (sent === 1 ? '' : 's') + '.' + (left ? ' ' + left + ' still to go: the daily job sends the rest tomorrow.' : ' Done.'));
  return sent;
}
function nl_dailyJob_() {   // called from dailyJob in Code.gs
  const cmp = nl_campaign_(false);
  if (cmp && String(cmp.sh.getRange(cmp.row, cmp.c('Status') + 1).getValue()) === 'Sending') newsletterSend();
}

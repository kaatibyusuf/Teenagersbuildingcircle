/**
 * Refer and earn
 *
 * Anyone can become a referrer on refer.html (they do not need to be a student). They get a code and a
 * link (himaayahschools.com/enroll.html?ref=CODE). When someone enrols with that code and their payment is
 * confirmed, the referrer earns REF_PERCENT of the fee paid at enrolment. The school pays it into the bank
 * account the referrer gave, then marks the earning as Paid.
 *
 * Tabs (created automatically):
 *   Referrers          one row per referrer: code, contact and bank details, access code for refer.html
 *   Referral earnings  one row per successful referral: amount, Status (Due / Paid / Cancelled), payout details
 *
 * Paying out: open "Referral earnings", transfer the amount to the referrer's account (the Referrers tab has the
 * bank details, and the school account gets an email for each new earning), then set Status to Paid and fill in
 * PaidDate and PaidReference. The referrer sees it on refer.html and gets an email when Status changes to Paid
 * (menu Himaayah → "Email referrers about payouts").
 *
 * SETUP: add this file to the Apps Script project, run setupEnrolments once (adds the Referral column),
 * then Deploy → Manage deployments → New version.
 */

const REF_PERCENT = 10;                  // % of the enrolment fee paid to the referrer
const REF_ON_RENEWALS = false;           // true = also pay REF_PERCENT on later monthly payments (not set up by default)
const REF_PAGE = 'https://www.himaayahschools.com/refer.html';
const REF_LINK = 'https://www.himaayahschools.com/enroll.html?ref=';
const REF_TAB = 'Referrers';
const REF_HEAD = ['Code', 'Name', 'Email', 'WhatsApp', 'BankName', 'AccountNumber', 'AccountName', 'AccessCode', 'Joined', 'Active'];
const REFE_TAB = 'Referral earnings';
const REFE_HEAD = ['EarningID', 'Code', 'Referrer', 'EnrolmentRef', 'Student', 'Programme', 'Plan', 'FeePaid', 'Percent', 'Amount', 'Status', 'Created', 'PaidDate', 'PaidReference', 'Notified'];
const REF_JOINS_PER_HOUR = 40;

function ref_t_(name, head) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (name === REFE_TAB) sh.getRange(2, head.indexOf('Status') + 1, 1000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Due', 'Paid', 'Cancelled'], true).setAllowInvalid(false).build());
    if (name === REF_TAB) sh.getRange(2, head.indexOf('Active') + 1, 1000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['TRUE', 'FALSE'], true).build());
  }
  return table_(name);
}
function ref_clean_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
function ref_digits_(v) { return String(v || '').replace(/\D/g, ''); }
function ref_phone_(v) { let n = ref_digits_(v); if (n.charAt(0) === '0' && n.length === 11) n = '234' + n.slice(1); return n; }
function ref_short_(name) { const p = String(name || '').trim().split(/\s+/).filter(Boolean); return p.length ? p[0] + (p.length > 1 ? ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.' : '') : ''; }
function ref_find_(code) {
  const c = key_(code).replace(/[^A-Z0-9]/g, '');
  if (!c) return null;
  const T = ref_t_(REF_TAB, REF_HEAD);
  const r = T.rows.filter(function (x) { return key_(x.Code) === c && key_(x.Active) !== 'FALSE'; })[0];
  return r ? { T: T, r: r } : null;
}

function referralFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (a === 'ref_join') return ref_join_(p);
    if (a === 'ref_check') return ref_check_(p);
    if (a === 'ref_resend') return ref_resend_(p);
    if (a === 'ref_login' || a === 'ref_update') {
      const au = ref_auth_(p);
      if (au.error) return { ok: false, error: au.error };
      if (a === 'ref_update') { const r = ref_update_(au, p); if (!r.ok) return r; }
      return ref_payload_(ref_find_(au.r.Code).r);
    }
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* sign-up */
function ref_join_(p) {
  if (String(p.website || '')) return { ok: true, code: 'OK' };   // honeypot
  const d = { name: ref_clean_(p.name, 80), email: ref_clean_(p.email, 200).toLowerCase(), wa: ref_clean_(p.whatsapp, 30), bank: ref_clean_(p.bankName, 60),
              acct: ref_digits_(p.accountNumber).slice(0, 10), acctName: ref_clean_(p.accountName, 100) };
  if (!d.name) return { ok: false, error: 'Enter your full name.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return { ok: false, error: 'Enter a valid email address.' };
  if (ref_digits_(d.wa).length < 10) return { ok: false, error: 'Enter a WhatsApp number we can reach.' };
  if (!d.bank) return { ok: false, error: 'Enter your bank.' };
  if (d.acct.length !== 10) return { ok: false, error: 'Enter your 10-digit account number.' };
  if (!d.acctName) return { ok: false, error: 'Enter the name on the account.' };
  const cache = CacheService.getScriptCache(), n = Number(cache.get('refjoins') || 0);
  if (n >= REF_JOINS_PER_HOUR) return { ok: false, error: 'Too many requests right now. Please try again later.' };
  cache.put('refjoins', String(n + 1), 3600);
  let code = '', access = '';
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const T = ref_t_(REF_TAB, REF_HEAD);
    if (T.rows.some(function (r) { return String(r.Email).toLowerCase() === d.email; })) return { ok: false, exists: true, error: 'This email is already registered. Use "Forgot your code?" to get your details by email.' };
    const base = (d.name.split(/\s+/)[0] || 'HM').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'HM';
    const taken = {}; T.rows.forEach(function (r) { taken[key_(r.Code)] = true; });
    for (let i = 0; i < 50 && (!code || taken[code]); i++) code = base + String(Math.floor(1000 + Math.random() * 9000));
    access = en_code();
    append_(T, { Code: code, Name: d.name, Email: d.email, WhatsApp: d.wa, BankName: d.bank, AccountNumber: d.acct, AccountName: d.acctName, AccessCode: access, Joined: today_(), Active: 'TRUE' },
            ['Code', 'Name', 'Email', 'WhatsApp', 'BankName', 'AccountNumber', 'AccountName', 'AccessCode', 'Joined']);
  } finally { lock.releaseLock(); }
  ref_mailDetails_(d.email, d.name, code, access, true);
  return { ok: true, code: code, access: access, link: REF_LINK + code };
}
function ref_mailDetails_(to, name, code, access, welcome) {
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    MailApp.sendEmail({ to: to, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': your referral link',
      body: 'Assalaamu alaykum ' + String(name).split(' ')[0] + ',\n\n' + (welcome ? 'Thank you for joining Refer and Earn. ' : '') +
            'Share your link with anyone who wants to learn with us. When someone enrols through it and their payment is confirmed, you earn ' + REF_PERCENT + '% of the fee they paid, sent to your bank account.\n\n' +
            'Your link: ' + REF_LINK + code + '\nYour referral code: ' + code + '\nAccess code (to see your referrals): ' + access + '\nYour referral page: ' + REF_PAGE + '\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
  } catch (e) { console.error(e); }
}
function ref_resend_(p) {
  const email = ref_clean_(p.email, 200).toLowerCase();
  const generic = { ok: true, message: 'If that email is registered, we have sent your referral details to it.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  const cache = CacheService.getScriptCache(), k = 'refresend:' + email;
  if (cache.get(k)) return generic;
  cache.put(k, '1', 600);
  const r = ref_t_(REF_TAB, REF_HEAD).rows.filter(function (x) { return String(x.Email).toLowerCase() === email && key_(x.Active) !== 'FALSE'; })[0];
  if (r) {
    let access = String(r.AccessCode).trim();
    if (code_isHashed_(access)) { access = en_code(); put_(ref_t_(REF_TAB, REF_HEAD), r._row, 'AccessCode', access, true); }   // protected codes cannot be read back: send a new one
    ref_mailDetails_(email, r.Name, String(r.Code), access, false);
  }
  return generic;
}
function ref_check_(p) {   // public: is this code valid? (used on the enrolment page)
  const cache = CacheService.getScriptCache(), n = Number(cache.get('refchecks') || 0);
  if (n >= 600) return { ok: false, error: 'Please try again later.' };
  cache.put('refchecks', String(n + 1), 3600);
  const f = ref_find_(p.code);
  return f ? { ok: true, code: String(f.r.Code), name: String(f.r.Name || '').split(' ')[0] } : { ok: false, error: 'We could not find that referral code.' };
}
function ref_auth_(p) {
  const code = key_(p.code).replace(/[^A-Z0-9]/g, ''), access = String(p.access || '').trim();
  if (!code || !access) return { error: 'Enter your referral code and access code.' };
  const cache = CacheService.getScriptCache(), lk = 'lock:ref:' + code, fk = 'fail:ref:' + code;
  if (cache.get(lk)) return { error: 'Too many attempts. Please try again in 15 minutes.' };
  const f = ref_find_(code);
  if (!f || !String(f.r.AccessCode).trim() || !code_ok_(f.r.AccessCode, access)) {
    const n = Number(cache.get(fk) || 0) + 1;
    if (n >= LOCKOUT_TRIES) { cache.put(lk, '1', LOCKOUT_SECONDS); cache.remove(fk); } else cache.put(fk, String(n), LOCKOUT_SECONDS);
    return { error: 'Wrong referral code or access code.' };
  }
  cache.remove(fk);
  return f;
}
function ref_update_(au, p) {
  const bank = ref_clean_(p.bankName, 60), acct = ref_digits_(p.accountNumber).slice(0, 10), acctName = ref_clean_(p.accountName, 100), wa = ref_clean_(p.whatsapp, 30);
  if (!bank || acct.length !== 10 || !acctName) return { ok: false, error: 'Enter the bank, the 10-digit account number and the account name.' };
  if (ref_digits_(wa).length < 10) return { ok: false, error: 'Enter a WhatsApp number we can reach.' };
  const T = au.T, r = au.r;
  put_(T, r._row, 'BankName', bank, true); put_(T, r._row, 'AccountNumber', acct, true); put_(T, r._row, 'AccountName', acctName, true); put_(T, r._row, 'WhatsApp', wa, true);
  return { ok: true };
}
function ref_payload_(r) {
  const code = key_(r.Code);
  const E = ref_t_(REFE_TAB, REFE_HEAD).rows.filter(function (e) { return key_(e.Code) === code; });
  const sum = function (st) { return E.filter(function (e) { return String(e.Status) === st; }).reduce(function (a, e) { return a + (Number(e.Amount) || 0); }, 0); };
  const earned = E.filter(function (e) { return String(e.Status) !== 'Cancelled'; }).map(function (e) {
    return { Date: iso_(e.Created), Student: ref_short_(e.Student), Plan: String(e.Plan || ''), Fee: Number(e.FeePaid) || 0, Amount: Number(e.Amount) || 0, Status: String(e.Status || 'Due'), PaidDate: iso_(e.PaidDate) };
  });
  const enrolledRefs = {}; E.forEach(function (e) { enrolledRefs[String(e.EnrolmentRef)] = true; });
  let pending = [];
  const sh = ss_().getSheetByName(EN_TAB);
  if (sh && sh.getLastRow() > 1) {
    const t = table_(EN_TAB);
    pending = t.rows.filter(function (x) { return key_(x.Referral) === code && !enrolledRefs[String(x.Ref)] && ['Rejected', 'Refunded', 'Account created'].indexOf(String(x.Status)) < 0; })
      .map(function (x) { return { Date: iso_(x.Submitted), Student: ref_short_(x.StudentName), Plan: String(x.Plan || ''), Status: 'Waiting for payment' }; });
  }
  const acct = String(r.AccountNumber || '');
  return { ok: true, today: today_(), percent: REF_PERCENT, ambassador: typeof amb_info_ === 'function' ? amb_info_(r, earned.length) : null,
    referrer: { Code: String(r.Code), Name: String(r.Name || ''), Link: REF_LINK + String(r.Code), BankName: String(r.BankName || ''), AccountNumber: acct ? '••••••' + acct.slice(-4) : '', AccountName: String(r.AccountName || ''), WhatsApp: String(r.WhatsApp || '') },
    totals: { earned: sum('Due') + sum('Paid'), due: sum('Due'), paid: sum('Paid'), count: earned.length },
    earnings: earned.sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }), pending: pending.sort(function (a, b) { return a.Date < b.Date ? 1 : -1; }).slice(0, 30) };
}

/* Called from enrolFromRequest (Enrol.gs): a code typed or carried in the link. Returns the code to store, or ''. */
function ref_forEnrolment_(code, d) {
  const f = ref_find_(code);
  if (!f) return '';
  const email = String(f.r.Email || '').toLowerCase(), phone = ref_phone_(f.r.WhatsApp);
  if (email && (email === d.kinEmail || email === d.studentEmail)) return '';   // no referring yourself
  if (phone && phone === ref_phone_(d.kinPhone)) return '';
  return String(f.r.Code);
}

/* Called from en_createAccount (Enrol.gs) once the account exists, inside its lock. */
function ref_award_(code, info, enrolRef, programme) {
  try {
    if (!code) return '';
    const f = ref_find_(code);
    if (!f) return 'Referral code not found';
    const E = ref_t_(REFE_TAB, REFE_HEAD);
    if (E.rows.some(function (e) { return String(e.EnrolmentRef) === String(enrolRef); })) return '';
    const fee = Number(info.amount) || 0, amount = Math.round(fee * REF_PERCENT / 100);
    if (!(amount > 0)) return '';
    append_(E, { EarningID: 'RE-' + Utilities.getUuid().slice(0, 6).toUpperCase(), Code: String(f.r.Code), Referrer: String(f.r.Name || ''), EnrolmentRef: String(enrolRef), Student: String(info.name || ''),
                 Programme: String(programme || ''), Plan: String(info.plan || ''), FeePaid: fee, Percent: REF_PERCENT, Amount: amount, Status: 'Due', Created: today_(), PaidDate: '', PaidReference: '', Notified: '' },
            ['EarningID', 'Code', 'Referrer', 'EnrolmentRef', 'Student', 'Programme', 'Plan', 'Created']);
    try {
      if (MailApp.getRemainingDailyQuota() > 1) {
        MailApp.sendEmail({ to: String(f.r.Email), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': you earned ' + naira_(amount),
          body: 'Assalaamu alaykum ' + String(f.r.Name).split(' ')[0] + ',\n\nGood news: ' + ref_short_(info.name) + ' has enrolled through your referral link and their payment is confirmed. You have earned ' +
                naira_(amount) + ' (' + REF_PERCENT + '% of ' + naira_(fee) + ').\n\nWe will send it to your account (' + f.r.BankName + ', ending ' + String(f.r.AccountNumber).slice(-4) + ') and let you know when it is paid.\n\nSee your referrals: ' + REF_PAGE + '\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
        const staff = Session.getEffectiveUser().getEmail();
        if (staff) MailApp.sendEmail({ to: staff, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': referral payout due ' + naira_(amount) + ' to ' + f.r.Name,
          body: 'A referred student has enrolled.\n\nStudent: ' + info.name + ' (' + info.plan + ')\nFee paid: ' + naira_(fee) + '\nReferrer: ' + f.r.Name + ' (' + f.r.Code + ')\nAmount due: ' + naira_(amount) +
                '\n\nPay to:\n' + f.r.AccountName + '\n' + f.r.BankName + '\n' + f.r.AccountNumber + '\n\nAfter paying, set the row to Paid in the "Referral earnings" tab and add the date and transfer reference.' });
      }
    } catch (e) { console.error(e); }
    return 'Referral: ' + naira_(amount) + ' due to ' + f.r.Code;
  } catch (err) { console.error(err); return 'Referral error: ' + err.message; }
}

/* Menu: tell referrers about payouts marked Paid */
function emailReferralPayouts() {
  const E = ref_t_(REFE_TAB, REFE_HEAD), R = ref_t_(REF_TAB, REF_HEAD);
  const by = {}; R.rows.forEach(function (r) { by[key_(r.Code)] = r; });
  let n = 0;
  E.rows.forEach(function (e) {
    if (String(e.Status) !== 'Paid' || e.Notified) return;
    const r = by[key_(e.Code)]; if (!r || MailApp.getRemainingDailyQuota() < 1) return;
    try {
      MailApp.sendEmail({ to: String(r.Email), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': referral payment sent ' + naira_(e.Amount),
        body: 'Assalaamu alaykum ' + String(r.Name).split(' ')[0] + ',\n\nWe have sent ' + naira_(e.Amount) + ' to your account (' + r.BankName + ', ending ' + String(r.AccountNumber).slice(-4) + ') for referring ' + ref_short_(e.Student) + '.' +
              (e.PaidReference ? '\nTransfer reference: ' + e.PaidReference : '') + '\n\nThank you for sharing Himaayah Schools.\n' + REF_PAGE + '\n\n' + SCHOOL_NAME });
      put_(E, e._row, 'Notified', iso_(new Date(), true), true); n++;
    } catch (err) { console.error(err); }
  });
  const msg = n ? 'Emailed ' + n + ' referrer' + (n === 1 ? '' : 's') + ' about payments.' : 'No new payouts to announce. Set Status to Paid in "Referral earnings" first.';
  console.log(msg); try { ss_().toast(msg, 'Referrals', 10); } catch (e) {}
}

/**
 * Himaayah Ambassadors
 *
 * People apply on ambassadors.html (16 and over; 16 and 17 year olds need a parent's consent). Applications
 * land in the "Ambassador applications" tab and every admin gets an email. An admin approves by setting
 * Status to Approved (or Declined) on the row. Approval makes the applicant a referrer with their own code,
 * link and access code (Referrals.gs) marked as an Ambassador, and emails them the details and the code of
 * conduct. Declined applicants get a polite email. Rewards are the normal referral reward (REF_PERCENT of
 * the first fee), paid to the bank account given in the application and tracked on refer.html.
 *
 * Levels are recognition only and follow confirmed enrolments: Ambassador, Senior Ambassador (5 enrolments
 * and 3 months in good standing), Lead Ambassador (15 enrolments). To set a level by hand, type it in the
 * Level column of the Referrers tab.
 *
 * Setup: paste this file, add the hook in Code.gs onSheetEdit (already included), redeploy, then run
 * ambSetup() once from the editor. To remove an ambassador, set Ambassador to No (or Active to FALSE) on their Referrers row.
 */
const AMB_TAB = 'Ambassador applications';
const AMB_HEAD = ['ID', 'Submitted', 'Name', 'Email', 'WhatsApp', 'AgeGroup', 'Role', 'Community', 'Why', 'RefereeName', 'RefereePhone', 'ParentName', 'ParentPhone', 'ParentConsent',
                  'BankName', 'AccountNumber', 'AccountName', 'Status', 'Note', 'Code', 'Decided'];
const AMB_PAGE = 'https://www.himaayahschools.com/ambassadors.html';
const AMB_ROLES = ['Parent', 'Student or former student', 'Teacher or imam', 'Community or campus leader', 'Other'];
const AMB_SENIOR = { enrolments: 5, months: 3 }, AMB_LEAD = { enrolments: 15 };
const AMB_PER_DAY = 60;

function amb_t_() {
  const ss = ss_();
  let sh = ss.getSheetByName(AMB_TAB);
  if (!sh) {
    sh = ss.insertSheet(AMB_TAB); sh.getRange(1, 1, 1, AMB_HEAD.length).setValues([AMB_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1);
    sh.getRange(2, AMB_HEAD.indexOf('Status') + 1, 1000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['New', 'Approved', 'Declined'], true).build());
  } else {
    const have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    AMB_HEAD.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h).setFontWeight('bold'); } });
  }
  return table_(AMB_TAB);
}
function amb_refCols_() {   // the Referrers tab gets three extra columns
  const sh = ss_().getSheetByName(REF_TAB) || (ref_t_(REF_TAB, REF_HEAD), ss_().getSheetByName(REF_TAB));
  const have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  ['Ambassador', 'AmbassadorSince', 'Level'].forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h).setFontWeight('bold'); } });
}
function amb_staff_() { return [Session.getEffectiveUser().getEmail()].concat(typeof EN_STAFF_EMAILS !== 'undefined' ? EN_STAFF_EMAILS : []).filter(String).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(','); }

function ambassadorsFromRequest(p) {
  try {
    if (String(p.action) === 'amb_apply') return amb_apply_(p);
    return { ok: false, error: 'Unknown action.' };
  } catch (err) { console.error(err); return { ok: false, error: 'Something went wrong. Please try again.' }; }
}

function amb_apply_(p) {
  if (String(p.website || '').trim()) return { ok: true };   // honeypot
  const d = { name: ref_clean_(p.name, 80), email: ref_clean_(p.email, 200).toLowerCase(), wa: ref_clean_(p.whatsapp, 30), age: String(p.ageGroup) === '16-17' ? '16-17' : String(p.ageGroup) === '18+' ? '18+' : '',
    role: AMB_ROLES.indexOf(String(p.role)) >= 0 ? String(p.role) : 'Other', community: ref_clean_(p.community, 120), why: ref_clean_(p.why, 800),
    refName: ref_clean_(p.refereeName, 80), refPhone: ref_clean_(p.refereePhone, 30), parentName: ref_clean_(p.parentName, 80), parentPhone: ref_clean_(p.parentPhone, 30),
    consent: p.parentConsent === true || p.parentConsent === 'true', bank: ref_clean_(p.bankName, 60), acct: ref_digits_(p.accountNumber).slice(0, 10), acctName: ref_clean_(p.accountName, 100), conduct: p.conduct === true || p.conduct === 'true' };
  if (!d.name) return { ok: false, error: 'Enter your full name.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return { ok: false, error: 'Enter a valid email address.' };
  if (ref_digits_(d.wa).length < 10) return { ok: false, error: 'Enter a WhatsApp number we can reach.' };
  if (!d.age) return { ok: false, error: 'Choose your age group. Ambassadors must be 16 or older.' };
  if (d.community.length < 3) return { ok: false, error: 'Tell us where you would represent Himaayah (your community, school, campus or city).' };
  if (d.why.length < 30) return { ok: false, error: 'Tell us in a few sentences why you want to be an ambassador.' };
  if (d.refName.length < 2 || ref_digits_(d.refPhone).length < 10) return { ok: false, error: 'Give the name and phone number of someone who can speak for your character.' };
  if (d.age === '16-17' && (d.parentName.length < 2 || ref_digits_(d.parentPhone).length < 10 || !d.consent)) return { ok: false, error: 'A parent or guardian’s name, phone number and consent are needed for applicants under 18.' };
  if (!d.bank || d.acct.length !== 10 || !d.acctName) return { ok: false, error: 'Enter the bank, the 10-digit account number and the account name where rewards should be paid.' };
  if (!d.conduct) return { ok: false, error: 'Please confirm that you agree to the Ambassador code of conduct.' };
  const cache = CacheService.getScriptCache(), n = Number(cache.get('ambday') || 0);
  if (n >= AMB_PER_DAY) return { ok: false, error: 'We have a lot of applications right now. Please try again tomorrow.' };
  cache.put('ambday', String(n + 1), 86400);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let id;
  try {
    const T = amb_t_();
    if (T.rows.some(function (r) { return String(r.Email).toLowerCase() === d.email && ['New', 'Approved', ''].indexOf(String(r.Status).trim()) >= 0; }))
      return { ok: false, error: 'We already have an application from this email. We will be in touch.' };
    id = 'AMB-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
    append_(T, { ID: id, Submitted: iso_(new Date(), true), Name: d.name, Email: d.email, WhatsApp: d.wa, AgeGroup: d.age === '16-17' ? '16 to 17' : '18 or older', Role: d.role, Community: d.community, Why: d.why,
      RefereeName: d.refName, RefereePhone: d.refPhone, ParentName: d.parentName, ParentPhone: d.parentPhone, ParentConsent: d.age === '16-17' ? (d.consent ? 'Yes' : 'No') : 'n/a',
      BankName: d.bank, AccountNumber: d.acct, AccountName: d.acctName, Status: 'New', Note: '', Code: '', Decided: '' },
      ['ID', 'Submitted', 'Name', 'Email', 'WhatsApp', 'Community', 'Why', 'RefereeName', 'RefereePhone', 'ParentName', 'ParentPhone', 'BankName', 'AccountNumber', 'AccountName']);
  } finally { lock.releaseLock(); }
  try {
    const to = amb_staff_();
    if (to && MailApp.getRemainingDailyQuota() > 3) MailApp.sendEmail({ to: to, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': new Ambassador application from ' + d.name,
      body: ['A new Ambassador application is waiting for approval.', '', 'Name: ' + d.name + ' (' + (d.age === '16-17' ? '16 to 17, parent consent given' : '18 or older') + ')', 'Role: ' + d.role, 'Where: ' + d.community,
        'Phone: ' + d.wa + '   Email: ' + d.email, 'Referee: ' + d.refName + ' ' + d.refPhone, d.age === '16-17' ? 'Parent: ' + d.parentName + ' ' + d.parentPhone : '', '', 'Why: ' + d.why, '',
        'To decide, open the "' + AMB_TAB + '" tab, find ' + id + ' and set Status to Approved or Declined. Approving sends the applicant their link and login automatically.'].join('\n') });
  } catch (e) { console.error(e); }
  try {
    if (MailApp.getRemainingDailyQuota() > 1) MailApp.sendEmail({ to: d.email, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': we received your Ambassador application',
      body: 'Assalaamu alaykum ' + d.name.split(' ')[0] + ',\n\nThank you for applying to become a Himaayah Ambassador. Our team will read your application and contact your referee. We will email you once a decision is made.\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
  } catch (e) { console.error(e); }
  return { ok: true, id: id };
}

/** Runs from onSheetEdit (Code.gs) when the applications tab is edited, and can be run by hand. */
function ambOnEdit_(sheetName) { if (sheetName === AMB_TAB) ambProcess(); }

function ambProcess() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    amb_refCols_();
    const T = amb_t_(); let a = 0, d = 0;
    T.rows.forEach(function (r) {
      const st = String(r.Status).trim();
      if (st === 'Approved' && !String(r.Code).trim()) { amb_approve_(T, r); a++; }
      else if (st === 'Declined' && !String(r.Decided).trim()) { amb_decline_(T, r); d++; }
    });
    return { approved: a, declined: d };
  } finally { lock.releaseLock(); }
}

function amb_approve_(T, r) {
  const email = String(r.Email).toLowerCase(), R = ref_t_(REF_TAB, REF_HEAD);
  let row = R.rows.filter(function (x) { return String(x.Email).toLowerCase() === email; })[0], code, access, isNew = false;
  if (row) {
    code = String(row.Code); access = String(row.AccessCode);
    if (code_isHashed_(access)) { access = en_code(); put_(R, row._row, 'AccessCode', access, true); }   // protected codes cannot be read back
    put_(R, row._row, 'Ambassador', 'Yes'); put_(R, row._row, 'AmbassadorSince', today_(), true); put_(R, row._row, 'Active', 'TRUE');
    put_(R, row._row, 'BankName', String(r.BankName), true); put_(R, row._row, 'AccountNumber', String(r.AccountNumber), true); put_(R, row._row, 'AccountName', String(r.AccountName), true);
  } else {
    isNew = true;
    const base = (String(r.Name).split(/\s+/)[0] || 'HM').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'HM', taken = {};
    R.rows.forEach(function (x) { taken[key_(x.Code)] = true; });
    code = ''; for (let i = 0; i < 50 && (!code || taken[code]); i++) code = base + String(Math.floor(1000 + Math.random() * 9000));
    access = en_code();
    append_(R, { Code: code, Name: String(r.Name), Email: email, WhatsApp: String(r.WhatsApp), BankName: String(r.BankName), AccountNumber: String(r.AccountNumber), AccountName: String(r.AccountName), AccessCode: access,
      Joined: today_(), Active: 'TRUE', Ambassador: 'Yes', AmbassadorSince: today_(), Level: '' }, ['Code', 'Name', 'Email', 'WhatsApp', 'BankName', 'AccountNumber', 'AccountName', 'AccessCode', 'Joined', 'AmbassadorSince']);
  }
  put_(T, r._row, 'Code', code, true); put_(T, r._row, 'Decided', iso_(new Date(), true), true);
  try {
    if (MailApp.getRemainingDailyQuota() < 1) { put_(T, r._row, 'Note', 'Approved but email not sent (daily limit). Send the login by hand.'); return; }
    MailApp.sendEmail({ to: email, name: SCHOOL_NAME, subject: 'Welcome, Himaayah Ambassador', body:
      'Assalaamu alaykum ' + String(r.Name).split(' ')[0] + ',\n\nCongratulations. You are now a Himaayah Ambassador, and we are glad to have you.\n\n' +
      'YOUR DETAILS\nYour link: ' + REF_LINK + code + '\nYour referral code: ' + code + '\nYour access code: ' + access + '\nYour dashboard: ' + REF_PAGE + '\n\n' +
      'HOW IT WORKS\nWhen someone enrols through your link or code and their payment is confirmed, you earn ' + REF_PERCENT + '% of the first fee, sent to the bank account you gave us. Your dashboard shows every referral and payment.\n\n' +
      'YOUR DUTIES\n- Speak about Himaayah honestly, using only what we publish on himaayahschools.com.\n- Introduce the programmes, the placement test and the free guides.\n- Send enquiries to the right WhatsApp line (Academy, Madrasah or General).\n- Share what families tell you so we can improve.\n\n' +
      'PLEASE NEVER\n- Promise results, discounts or admission, or quote fees that are not on the website.\n- Collect money for the school. Payments go only to the school account or the card checkout.\n- Pressure or spam people, or message anyone who has not agreed to hear from you.\n- Say you are staff, or use our name and crest in ways the brand rules do not allow.\n- Share any student’s private details, or refer yourself or your own household.\n\n' +
      'Breaking these rules can end your ambassadorship. Read the full details at ' + AMB_PAGE + '.\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
  } catch (e) { console.error(e); put_(T, r._row, 'Note', 'Approved but email failed: ' + String(e.message).slice(0, 80)); }
}
function amb_decline_(T, r) {
  put_(T, r._row, 'Decided', iso_(new Date(), true), true);
  try {
    if (MailApp.getRemainingDailyQuota() < 1 || !validEmail_(r.Email)) return;
    MailApp.sendEmail({ to: String(r.Email), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': your Ambassador application',
      body: 'Assalaamu alaykum ' + String(r.Name).split(' ')[0] + ',\n\nThank you for your interest in becoming a Himaayah Ambassador. We are not able to take your application forward at this time. You are still welcome to share Himaayah through Refer and Earn at ' + REF_PAGE.replace('ambassadors', 'refer') + ', and to apply again later.\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
  } catch (e) { console.error(e); }
}

/** Level, progress and badge for the refer.html dashboard. Returns null for anyone who is not an ambassador. */
function amb_info_(r, count) {
  if (key_(r.Ambassador) !== 'YES') return null;
  const since = iso_(r.AmbassadorSince) || today_(), t = new Date(), s = new Date(since + 'T00:00:00');
  const months = isNaN(s) ? 0 : (t.getFullYear() - s.getFullYear()) * 12 + (t.getMonth() - s.getMonth()) - (t.getDate() < s.getDate() ? 1 : 0);
  const manual = String(r.Level || '').trim();
  let level = count >= AMB_LEAD.enrolments ? 'Lead Ambassador' : (count >= AMB_SENIOR.enrolments && months >= AMB_SENIOR.months) ? 'Senior Ambassador' : 'Ambassador';
  if (['Ambassador', 'Senior Ambassador', 'Lead Ambassador'].indexOf(manual) >= 0) level = manual;
  let next = null;
  if (level === 'Ambassador') next = { level: 'Senior Ambassador', moreEnrolments: Math.max(0, AMB_SENIOR.enrolments - count), moreMonths: Math.max(0, AMB_SENIOR.months - months) };
  else if (level === 'Senior Ambassador') next = { level: 'Lead Ambassador', moreEnrolments: Math.max(0, AMB_LEAD.enrolments - count), moreMonths: 0 };
  return { level: level, since: since, months: months, count: count, next: next };
}

/** Run once from the editor. */
function ambSetup() { amb_t_(); amb_refCols_(); return 'Ambassador applications tab ready.'; }

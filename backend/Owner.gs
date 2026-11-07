/**
 * Owner dashboard (owner.html)
 *
 * One page for the school's numbers: enrolments this month, money collected, overdue fees,
 * referral payouts due, sponsorships, waitlist, newsletter and progress reports, plus the
 * things that need a decision. From it you can also:
 *   - mark a referral payout as Paid (the referrer is emailed),
 *   - review sponsorship requests and list them on sponsor.html,
 *   - pay a student's fees from the Sponsorship Fund,
 *   - see and record monthly staff pay (Salaries.gs: 5,000 per student, class lists and bank details).
 *
 * SETUP
 *   1. Add this file, then run Himaayah → Set up the owner dashboard. It creates an "Owners" tab with
 *      your login (OW-001) and shows the access code once. Add more rows for other owners if needed.
 *   2. Deploy → Manage deployments → New version.
 *   3. Open https://www.himaayahschools.com/owner.html and sign in. Change the code in Account.
 */

const OW_TAB = 'Owners';
const OW_HEAD = ['OwnerID', 'Name', 'AccessCode', 'Email', 'Active'];
const OW_MONTHS = 6;   // months shown in the money chart

function ownerSetup() {
  const ss = ss_();
  let sh = ss.getSheetByName(OW_TAB), msg;
  if (!sh) { sh = ss.insertSheet(OW_TAB); sh.getRange(1, 1, 1, OW_HEAD.length).setValues([OW_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  const t = table_(OW_TAB);
  if (!t.rows.some(function (r) { return r.OwnerID; })) {
    const code = Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
    append_(t, { OwnerID: 'OW-001', Name: 'Owner', AccessCode: code, Email: Session.getEffectiveUser().getEmail(), Active: 'TRUE' }, ['OwnerID', 'AccessCode']);
    msg = 'Owner dashboard ready.\n\nOpen https://www.himaayahschools.com/owner.html\nOwner ID: OW-001\nAccess code: ' + code + '\n\nChange the code after signing in (Account).';
  } else msg = 'The Owners tab already has a login. Add a row there for another owner.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function ownerFromRequest(p) {
  try {
    const au = acd_auth_(OW_TAB, 'OwnerID', p);
    if (au.error) return { ok: false, error: au.error };
    const a = String(p.action || ''), who = String(au.row.Name || au.row.OwnerID);
    let r = { ok: true };
    if (a === 'ow_payout') r = ow_payout_(p);
    else if (a === 'ow_salpay') r = sal_pay_(who, p);
    else if (a === 'ow_salundo') r = sal_undo_(p);
    else if (a === 'ow_salslip') r = sal_resend_(p);
    else if (a === 'ow_salbank') r = sal_bank_(p);
    else if (a === 'ow_allocate') r = typeof sp_allocate_ === 'function' ? sp_allocate_(who, p) : { ok: false, error: 'Sponsorships are not set up yet.' };
    else if (a === 'ow_request') r = typeof sp_saveRequest_ === 'function' ? sp_saveRequest_(p) : { ok: false, error: 'Sponsorships are not set up yet.' };
    else if (a === 'ow_testimonial') r = typeof tm_save_ === 'function' ? tm_save_(p) : { ok: false, error: 'Testimonials are not set up yet.' };
    else if (a === 'ow_trial') r = typeof tr_save_ === 'function' ? tr_save_(p) : { ok: false, error: 'Trial classes are not set up yet.' };
    else if (a === 'ow_password') r = acd_setCode_(au.t, au.row, p.newCode);
    else if (a !== 'ow_login') r = { ok: false, error: 'Unknown action.' };
    if (!r.ok) return r;
    const out = Object.assign(ow_payload_(au.row), { message: r.message || '' });
    try { out.salaries = sal_payload_(p); } catch (e) { console.error(e); out.salaries = null; }
    return out;
  } catch (err) {
    console.error(err);
    return { ok: false, error: /Missing tab "Owners"/.test(String(err.message)) ? 'The owner dashboard is not set up yet. Run Himaayah → Set up the owner dashboard.' : 'Something went wrong. Please try again.' };
  }
}
function ow_try_(name) { try { return table_(name); } catch (e) { return { rows: [], head: [] }; } }

/* ===== the numbers ===== */
function ow_payload_(me) {
  const today = today_(), month = today.slice(0, 7), last = addMonths_(month + '-01', -1).slice(0, 7);
  const months = []; for (let i = OW_MONTHS - 1; i >= 0; i--) months.push(addMonths_(month + '-01', -i).slice(0, 7));

  // students, by programme, and who is overdue
  const progOf = function (s) { return /tbc|teen/i.test(String(s.Plan) + ' ' + String(s.Level)) ? 'Teenagers Building Circle' : 'Madrasah'; };
  const tabs = [['Students', progOf], ['AcademyStudents', function () { return 'Academy'; }], ['SkillsStudents', function () { return 'Skills School'; }]];
  const byId = {}, active = {}, overdue = [];
  let dueSoon = 0, paidUp = 0;
  tabs.forEach(function (tb) {
    ow_try_(tb[0]).rows.forEach(function (s) {
      if (!s.StudentID) return;
      const prog = tb[1](s); byId[key_(s.StudentID)] = prog;
      if (key_(s.Active) === 'FALSE') return;
      active[prog] = (active[prog] || 0) + 1;
      const st = payStatus_(s), nd = iso_(s.NextDue);
      const fee = tb[0] === 'SkillsStudents' ? Number(s.Fee) || 0 : Number(s.MonthlyFee) || 0;
      if (st === 'Overdue') {
        const first = String(s.Name || '').split(' ')[0];
        overdue.push({ StudentID: String(s.StudentID), Name: String(s.Name || ''), Programme: prog, NextDue: nd, Days: nd ? dn_(today) - dn_(nd) : 0, Fee: fee,
          WhatsApp: waLink_(s.WhatsApp, 'Assalaamu alaykum. A gentle reminder that ' + first + "'s Himaayah Schools fees were due on " + (nd ? nice_(nd) : 'the due date') +
            '. You can pay online here: ' + payLink_(s.StudentID) + ' . Jazakumullahu khayran.') });
      } else if (st === 'Due') dueSoon++; else if (st === 'Paid') paidUp++;
    });
  });
  overdue.sort(function (a, b) { return b.Days - a.Days; });

  // money in, from the three payment tabs
  const money = {}; months.forEach(function (m) { money[m] = { total: 0, card: 0, byProg: {} }; });
  const addPay = function (date, amount, method, prog) {
    const m = iso_(date).slice(0, 7); if (!money[m] || !(amount > 0)) return;
    money[m].total += amount; if (/card|sponsor/i.test(String(method))) money[m].card += amount;
    money[m].byProg[prog] = (money[m].byProg[prog] || 0) + amount;
  };
  ow_try_('Payments').rows.forEach(function (p) { if (String(p.Status).trim().toLowerCase() === 'confirmed') addPay(p.Date, Number(p.Amount) || 0, p.Method, byId[key_(p.StudentID)] || 'Madrasah'); });
  ow_try_('AcademyPayments').rows.forEach(function (p) { addPay(p.Date, Number(p.Amount) || 0, p.Method, 'Academy'); });
  ow_try_('SkillsPayments').rows.forEach(function (p) { addPay(p.Date, Number(p.Amount) || 0, p.Method, 'Skills School'); });

  // enrolments
  const E = ow_try_(typeof EN_TAB === 'string' ? EN_TAB : 'Enrolments');
  const enr = { month: 0, last: 0, byProg: {}, pending: [] };
  E.rows.forEach(function (r) {
    if (!r.Ref) return;
    const m = iso_(r.Submitted).slice(0, 7), st = String(r.Status || '');
    if (m === month) { enr.month++; enr.byProg[r.Programme || 'Other'] = (enr.byProg[r.Programme || 'Other'] || 0) + 1; }
    if (m === last) enr.last++;
    if (['Receipt sent', 'Card paid'].indexOf(st) >= 0 || (st === 'Awaiting card payment' && dn_(today) - dn_(iso_(r.Submitted) || today) <= 7)) {
      enr.pending.push({ Ref: String(r.Ref), Submitted: iso_(r.Submitted, true), Name: String(r.StudentName || ''), Programme: String(r.Programme || ''), Plan: String(r.Plan || ''), Status: st,
        Amount: Number(r.Amount) || 0, Phone: String(r.KinPhone || ''), WhatsApp: waLink_(r.KinPhone, 'Assalaamu alaykum. This is Himaayah Schools about the enrolment for ' + String(r.StudentName || '').split(' ')[0] + ' (' + r.Ref + ').') });
    }
  });
  enr.pending.sort(function (a, b) { return a.Submitted < b.Submitted ? 1 : -1; });

  // referral payouts
  const ref = { due: [], dueTotal: 0, paidMonth: 0, referrers: 0 };
  const RR = ow_try_('Referrers'), RE = ow_try_('Referral earnings'), rby = {};
  RR.rows.forEach(function (r) { if (r.Code) { rby[key_(r.Code)] = r; ref.referrers++; } });
  RE.rows.forEach(function (e) {
    const st = String(e.Status || '');
    if (st === 'Paid' && iso_(e.PaidDate).slice(0, 7) === month) ref.paidMonth += Number(e.Amount) || 0;
    if (st !== 'Due') return;
    const r = rby[key_(e.Code)] || {};
    ref.dueTotal += Number(e.Amount) || 0;
    ref.due.push({ EarningID: String(e.EarningID), Created: iso_(e.Created), Referrer: String(e.Referrer || r.Name || ''), Code: String(e.Code), Student: String(e.Student || ''), Plan: String(e.Plan || ''),
      Amount: Number(e.Amount) || 0, Bank: String(r.BankName || ''), AccountNumber: String(r.AccountNumber || ''), AccountName: String(r.AccountName || ''), WhatsApp: String(r.WhatsApp || '') });
  });

  // waitlist
  const wl = { total: 0, byPlan: {} };
  ow_try_('Waitlist').rows.forEach(function (w) { if (String(w.Status || 'Waiting') === 'Waiting' && w.Plan) { wl.total++; wl.byPlan[w.Plan] = (wl.byPlan[w.Plan] || 0) + 1; } });

  // newsletter
  const nl = { active: 0, month: 0, last: 0, lastCampaign: null, byInterest: {}, bySource: {} };
  ow_try_('Subscribers').rows.forEach(function (s) {
    if (!s.Email) return; const m = iso_(s.Joined).slice(0, 7);
    if (String(s.Status || '') !== 'Unsubscribed') {
      nl.active++;
      String(s.Interests || '').split(',').forEach(function (x) { x = x.trim(); if (x) nl.byInterest[x] = (nl.byInterest[x] || 0) + 1; });
      const src = String(s.Source || '').trim() || 'Not recorded'; nl.bySource[src] = (nl.bySource[src] || 0) + 1;
    }
    if (m === month) nl.month++; if (m === last) nl.last++;
  });
  ow_try_('Newsletter').rows.forEach(function (c) {
    if (String(c.Status) === 'Sent' && (!nl.lastCampaign || iso_(c.Finished || c.Started) > nl.lastCampaign.Date)) nl.lastCampaign = { Subject: String(c.Subject || ''), Date: iso_(c.Finished || c.Started) };
  });

  // daily email allowance (Apps Script limit) and what is waiting for it
  let mail = null;
  try {
    const leftQ = MailApp.getRemainingDailyQuota(), limit = leftQ > 100 ? 1500 : 100;
    const tw = ow_try_('TBCReports').rows.filter(function (r) { return String(r.Status) === 'Waiting'; }).length;
    mail = { left: leftQ, limit: limit, used: Math.max(0, limit - leftQ), tbcWaiting: tw };
  } catch (e) { mail = null; }

  // card payments that need a person
  const attention = [];
  const since = addMonths_(today, -2);
  ow_try_('Card payments').rows.forEach(function (c) {
    const res = String(c.Result || '');
    if (iso_(c.Received) < since || !/No enrolment|did not match|Waiting for staff|not found|below the fee|could not be created|by hand/i.test(res) || /matched later/.test(res)) return;
    attention.push({ Received: iso_(c.Received, true), Reference: String(c.Reference || ''), Student: String(c.Student || ''), Amount: String(c.Amount || ''), Result: res });
  });

  const thisM = money[month];
  return {
    ok: true, today: today, term: schoolTerm_(), me: { OwnerID: String(me.OwnerID), Name: String(me.Name || '') },
    kpi: {
      enrolMonth: enr.month, enrolLast: enr.last, moneyMonth: thisM.total, moneyLast: (money[last] || { total: 0 }).total, cardShare: thisM.total ? Math.round(100 * thisM.card / thisM.total) : 0,
      active: Object.keys(active).reduce(function (t, k) { return t + active[k]; }, 0), overdue: overdue.length, overdueAmount: overdue.reduce(function (t, o) { return t + o.Fee; }, 0),
      dueSoon: dueSoon, paidUp: paidUp, referralDue: ref.dueTotal, waitlist: wl.total, subscribers: nl.active
    },
    months: months.map(function (m) { return { Month: m, Total: money[m].total, Card: money[m].card, ByProg: money[m].byProg }; }),
    active: active, enrol: enr, overdue: overdue, referrals: ref, waitlist: wl, newsletter: nl, mail: mail, attention: attention,
    reports: typeof rp_status_ === 'function' ? rp_status_() : null,
    sponsors: typeof sp_summary_ === 'function' ? sp_summary_() : null,
    testimonials: typeof tm_summary_ === 'function' ? tm_summary_() : null,
    trials: typeof tr_summary_ === 'function' ? tr_summary_() : null,
    placement: typeof pt_summary_ === 'function' ? pt_summary_() : null
  };
}

/* ===== mark a referral payout as paid ===== */
function ow_payout_(p) {
  const E = table_('Referral earnings'), e = E.rows.filter(function (r) { return String(r.EarningID) === String(p.earningId || ''); })[0];
  if (!e) return { ok: false, error: 'Payout not found.' };
  if (String(e.Status) === 'Paid') return { ok: true, message: 'Already marked as paid.' };
  const refText = String(p.reference || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
  put_(E, e._row, 'Status', 'Paid'); put_(E, e._row, 'PaidDate', today_(), true); put_(E, e._row, 'PaidReference', refText, true);
  let note = '';
  try { if (typeof emailReferralPayouts === 'function') { emailReferralPayouts(); note = ' The referrer has been emailed.'; } } catch (err) { console.error(err); }
  return { ok: true, message: naira_(e.Amount) + ' to ' + (e.Referrer || e.Code) + ' marked as paid.' + note };
}

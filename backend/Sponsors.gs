/**
 * Sponsor a student
 *
 * The page sponsor.html lets anyone:
 *   1. give to the general Sponsorship Fund (any amount), which staff use to pay fees for families who need help,
 *   2. sponsor a listed student for one or more months (families apply on the same page; staff approve and list them),
 * and lets families apply for support.
 *
 * Payments go through Bachs like the other card payments: api/sponsor-checkout starts the payment
 * (it asks this file for the trusted amount with action "sp_quote"), and api/bachs-webhook sends the
 * result here (CardPayments.gs passes kind "sponsor" to sponsorCardPayment_).
 *
 * Tabs (created automatically, or from Himaayah → Set up sponsorship tabs):
 *   Sponsor requests   families who asked for help. Staff review them on the owner dashboard (or here):
 *                      set Status to Listed and fill PublicName (e.g. "Aisha, 9"), Blurb, MonthlyFee and
 *                      MonthsNeeded to show them on the page. Add StudentID once they are enrolled.
 *   Sponsorships       every gift: Fund, Student, and Allocation rows (fund money used for a student).
 *
 * What donors hear:
 *   - a thank-you email straight away,
 *   - fund donors: an email when their gift is used to pay a student's fees,
 *   - sponsors of a listed student: a short monthly update with the student's progress (from the monthly
 *     progress reports, Reports.gs), including milestones such as finishing a Juz or a course.
 *     Only for families who agreed to this on the application form, and only the first name is shared.
 */

const SP_MIN = 2000;              // smallest gift to the fund, in naira
const SP_MAX = 5000000;           // largest single gift
const SP_MAX_MONTHS = 12;         // a sponsor can cover up to 12 months for a listed student
const SP_UPDATE_MONTHS = 12;      // sponsors of a listed student get monthly updates for this long
const SP_PAGE = 'https://www.himaayahschools.com/sponsor.html';
const SP_REQ_TAB = 'Sponsor requests';
const SP_REQ_HEAD = ['RequestID', 'Submitted', 'StudentName', 'StudentID', 'Programme', 'Plan', 'ParentName', 'Email', 'WhatsApp', 'Reason', 'Consent',
                     'Status', 'PublicName', 'Blurb', 'MonthlyFee', 'MonthsNeeded', 'MonthsFunded', 'Notes'];
const SP_TAB = 'Sponsorships';
const SP_HEAD = ['SponsorshipID', 'Date', 'Type', 'DonorName', 'DonorEmail', 'DonorPhone', 'ShowName', 'Message', 'RequestID', 'StudentID', 'Months',
                 'Amount', 'Remaining', 'Status', 'Reference', 'EventID', 'Applied', 'LastUpdate', 'Notes'];
const SP_PROGRAMMES = ['Madrasah', 'Academy', 'Skills School', 'Teenagers Building Circle'];

function sp_t_(name, head) {   // creates or upgrades the tab
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); }
  else {
    const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    head.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h).setFontWeight('bold'); } });
  }
  return table_(name);
}
function sp_try_(name) { try { return table_(name); } catch (e) { return { rows: [], head: [] }; } }
function sp_req_() { return sp_t_(SP_REQ_TAB, SP_REQ_HEAD); }
function sp_tab_() { return sp_t_(SP_TAB, SP_HEAD); }
function sp_txt_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n); }
function sp_id_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(); }
function sp_yes_(v) { return /^(yes|true|1)$/i.test(String(v || '').trim()); }
function sp_left_(q) { return Math.max(0, (Number(q.MonthsNeeded) || 0) - (Number(q.MonthsFunded) || 0)); }

function sponsorSetup() {
  sp_req_(); sp_tab_();
  const msg = 'Sponsorship tabs are ready: "' + SP_REQ_TAB + '" and "' + SP_TAB + '".';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function sponsorFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (a === 'sp_list') return sp_list_();
    if (a === 'sp_apply') return sp_apply_(p);
    if (a === 'sp_quote') {
      const secret = PropertiesService.getScriptProperties().getProperty('CARD_SECRET');
      if (!secret || !same_(String(p.secret || ''), secret)) return { ok: false, error: 'Not allowed' };
      return sp_quote_(p);
    }
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* ===== PUBLIC: what the page shows ===== */
function sp_list_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('sp_list');
  if (hit) return JSON.parse(hit);
  const Q = sp_req_(), T = sp_tab_();
  const students = Q.rows.filter(function (q) { return String(q.Status) === 'Listed' && q.PublicName && Number(q.MonthlyFee) > 0 && sp_left_(q) > 0; })
    .map(function (q) { return { RequestID: String(q.RequestID), Name: String(q.PublicName), Programme: String(q.Programme || ''), Blurb: String(q.Blurb || ''),
                                 MonthlyFee: Number(q.MonthlyFee) || 0, MonthsNeeded: Number(q.MonthsNeeded) || 0, MonthsFunded: Number(q.MonthsFunded) || 0 }; });
  let raised = 0; const helped = {}, donors = {};
  T.rows.forEach(function (s) {
    const type = String(s.Type);
    if (type === 'Fund' || type === 'Student') { raised += Number(s.Amount) || 0; if (s.DonorEmail) donors[String(s.DonorEmail).toLowerCase()] = 1; }
    if ((type === 'Student' || type === 'Allocation') && (s.StudentID || s.RequestID)) helped[key_(s.StudentID || s.RequestID)] = 1;
  });
  const wall = T.rows.filter(function (s) { return (String(s.Type) === 'Fund' || String(s.Type) === 'Student') && sp_yes_(s.ShowName) && s.DonorName; })
    .sort(function (a, b) { return iso_(a.Date, true) < iso_(b.Date, true) ? 1 : -1; }).slice(0, 8)
    .map(function (s) { return { Name: String(s.DonorName).split(' ').slice(0, 2).join(' '), Date: iso_(s.Date), Message: String(s.Message || '').slice(0, 140) }; });
  const out = { ok: true, students: students, stats: { raised: raised, students: Object.keys(helped).length, donors: Object.keys(donors).length }, wall: wall, min: SP_MIN, maxMonths: SP_MAX_MONTHS };
  try { cache.put('sp_list', JSON.stringify(out), 300); } catch (e) {}
  return out;
}

/* ===== PUBLIC: a family asks for help ===== */
function sp_apply_(p) {
  if (String(p.website || '').trim()) return { ok: true };   // honeypot
  const d = {
    studentName: sp_txt_(p.studentName, 100), studentId: key_(p.studentId).slice(0, 20), programme: sp_txt_(p.programme, 40), plan: sp_txt_(p.plan, 80),
    parentName: sp_txt_(p.parentName, 100), email: sp_txt_(p.email, 120).toLowerCase(), whatsapp: sp_txt_(p.whatsapp, 30), reason: sp_txt_(p.reason, 1500),
    consent: p.consent === true || sp_yes_(p.consent)
  };
  if (!d.studentName || !d.parentName) return { ok: false, error: "Enter the student's name and your name." };
  if (!validEmail_(d.email)) return { ok: false, error: 'Enter a valid email address.' };
  if (d.whatsapp.replace(/\D/g, '').length < 10) return { ok: false, error: 'Enter a WhatsApp number we can reach.' };
  if (SP_PROGRAMMES.indexOf(d.programme) < 0) return { ok: false, error: 'Choose a programme.' };
  if (d.reason.length < 20) return { ok: false, error: 'Tell us a little about your situation (a few sentences).' };
  const cache = CacheService.getScriptCache(), k = 'spapply_' + d.email, n = Number(cache.get(k) || 0);
  if (n >= 3) return { ok: false, error: 'We already have your request. We will be in touch.' };
  cache.put(k, String(n + 1), 86400);
  const id = sp_id_('SR-');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    append_(sp_req_(), { RequestID: id, Submitted: iso_(new Date(), true), StudentName: d.studentName, StudentID: d.studentId, Programme: d.programme, Plan: d.plan,
      ParentName: d.parentName, Email: d.email, WhatsApp: d.whatsapp, Reason: d.reason, Consent: d.consent ? 'Yes' : 'No', Status: 'New', MonthsFunded: 0 },
      ['RequestID', 'Submitted', 'StudentName', 'StudentID', 'Programme', 'Plan', 'ParentName', 'Email', 'WhatsApp', 'Reason']);
  } finally { lock.releaseLock(); }
  try {
    if (MailApp.getRemainingDailyQuota() > 1) {
      MailApp.sendEmail({ to: d.email, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': we received your request for support',
        body: 'Assalaamu alaykum ' + d.parentName.split(' ')[0] + ',\n\nThank you for reaching out. We have received your request for support for ' + d.studentName + ' (' + d.programme + ').\n' +
              'Your reference is ' + id + '. A member of staff will contact you on WhatsApp within a few days.\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
      MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': new sponsorship request ' + id,
        body: 'Student: ' + d.studentName + (d.studentId ? ' (' + d.studentId + ')' : '') + '\nProgramme: ' + d.programme + (d.plan ? ' — ' + d.plan : '') + '\nParent: ' + d.parentName +
              '\nEmail: ' + d.email + '\nWhatsApp: ' + d.whatsapp + '\nAgrees to share progress with a sponsor: ' + (d.consent ? 'Yes' : 'No') + '\n\n' + d.reason +
              '\n\nReview it on the owner dashboard (Sponsors) or in the "' + SP_REQ_TAB + '" tab.' });
    }
  } catch (e) { console.error(e); }
  return { ok: true, ref: id };
}

/* ===== SERVER: the trusted amount for api/sponsor-checkout ===== */
function sp_quote_(p) {
  const type = String(p.type || '');
  if (type === 'fund') {
    const amount = Math.round(Number(p.amount) || 0);
    if (amount < SP_MIN) return { ok: false, error: 'The smallest gift is ' + naira_(SP_MIN) + '.' };
    if (amount > SP_MAX) return { ok: false, error: 'For gifts above ' + naira_(SP_MAX) + ', please contact the school.' };
    return { ok: true, type: 'fund', amount: amount, label: 'Gift to the Himaayah Sponsorship Fund' };
  }
  if (type === 'student') {
    const q = sp_req_().rows.filter(function (r) { return key_(r.RequestID) === key_(p.requestId); })[0];
    if (!q || String(q.Status) !== 'Listed') return { ok: false, error: 'This student is no longer looking for a sponsor. Please choose another, or give to the fund.' };
    const left = sp_left_(q), fee = Number(q.MonthlyFee) || 0;
    if (!left || !fee) return { ok: false, error: 'This student is fully sponsored, alhamdulillah. Please choose another, or give to the fund.' };
    const months = Math.max(1, Math.min(left, SP_MAX_MONTHS, Math.round(Number(p.months) || 1)));
    return { ok: true, type: 'student', requestId: String(q.RequestID), months: months, amount: fee * months, name: String(q.PublicName), programme: String(q.Programme || ''),
             label: months + ' month' + (months === 1 ? '' : 's') + ' of ' + (q.Programme || 'school') + ' fees for ' + q.PublicName };
  }
  return { ok: false, error: 'Choose how you would like to give.' };
}

/* ===== PAYMENT ARRIVES (from cardPaymentFromRequest in CardPayments.gs, after the secret check) ===== */
function sponsorCardPayment_(p) {
  const rec = {
    type: String(p.type || '') === 'student' ? 'Student' : 'Fund', requestId: key_(p.requestId), months: Math.max(0, Math.round(Number(p.months) || 0)),
    amount: Number(p.amount) || 0, currency: String(p.currency || '').toUpperCase(), status: String(p.status || '').toUpperCase(),
    donorName: sp_txt_(p.donorName || '', 100), donorEmail: sp_txt_(p.donorEmail || p.email || '', 120).toLowerCase(), donorPhone: sp_txt_(p.donorPhone || '', 30),
    showName: sp_yes_(p.showName) ? 'Yes' : 'No', message: sp_txt_(p.message || '', 200), eventId: String(p.eventId || ''), checkoutId: String(p.checkoutId || ''),
    chargeId: String(p.chargeId || ''), ref: sp_txt_(p.ref || '', 40)
  };
  const paid = /^(SUCCEEDED|ACCEPTED|OVERPAID)$/.test(rec.status) && rec.currency === 'NGN' && rec.amount > 0;
  let result = '', apply = null, q = null, sid = '';
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = ss_();
    let log = ss.getSheetByName(CARD_LOG_TAB);
    if (!log) { log = ss.insertSheet(CARD_LOG_TAB); log.getRange(1, 1, 1, CARD_LOG_HEAD.length).setValues([CARD_LOG_HEAD]).setFontWeight('bold'); log.setFrozenRows(1); }
    if (rec.eventId && log.getLastRow() > 1) {
      const ids = log.getRange(2, CARD_LOG_HEAD.indexOf('EventID') + 1, log.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === rec.eventId) return { ok: true, duplicate: true };
    }
    if (!paid) result = 'Not a completed NGN payment';
    else {
      const T = sp_tab_(), Q = sp_req_();
      let status = 'Received', studentId = '';
      if (rec.type === 'Student') {
        q = Q.rows.filter(function (r) { return key_(r.RequestID) === rec.requestId; })[0];
        if (!q) { rec.type = 'Fund'; result = 'Request not found, added to the fund'; }
        else {
          const funded = (Number(q.MonthsFunded) || 0) + rec.months;
          put_(Q, q._row, 'MonthsFunded', funded);
          if (funded >= (Number(q.MonthsNeeded) || 0)) put_(Q, q._row, 'Status', 'Funded');
          studentId = key_(q.StudentID);
          status = studentId ? 'Applied' : 'Held';
          if (studentId) apply = { studentId: studentId, months: rec.months, amount: rec.amount };
          result = studentId ? 'Sponsorship for ' + q.PublicName + ' (' + studentId + ')' : 'Sponsorship for ' + q.PublicName + ', held until the student is enrolled';
        }
      }
      if (rec.type === 'Fund' && !result) result = 'Gift to the Sponsorship Fund';
      sid = sp_id_('SP-');
      append_(T, { SponsorshipID: sid, Date: iso_(new Date(), true), Type: rec.type, DonorName: rec.donorName, DonorEmail: rec.donorEmail, DonorPhone: rec.donorPhone,
        ShowName: rec.showName, Message: rec.message, RequestID: rec.type === 'Student' ? rec.requestId : '', StudentID: studentId, Months: rec.type === 'Student' ? rec.months : '',
        Amount: rec.amount, Remaining: rec.type === 'Fund' ? rec.amount : 0, Status: rec.type === 'Fund' ? 'Received' : status, Reference: rec.checkoutId || rec.ref, EventID: rec.eventId },
        ['SponsorshipID', 'Date', 'DonorName', 'DonorEmail', 'DonorPhone', 'Message', 'RequestID', 'StudentID', 'Reference', 'EventID']);
      apply && (apply.sid = sid);
    }
    const r = log.getLastRow() + 1;
    log.getRange(r, 1, 1, CARD_LOG_HEAD.length).setNumberFormat('@').setValues([[
      iso_(new Date(), true), rec.ref || 'SPONSOR', rec.donorName, 'Sponsorship: ' + rec.type, String(rec.amount), rec.currency, rec.status,
      rec.donorEmail, rec.checkoutId, rec.chargeId, rec.eventId, result
    ]]);
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('sp_list');

  if (apply) { const a = sp_applyFee_(apply.studentId, apply.months, apply.amount, 'Sponsor ' + apply.sid, 'Sponsor'); sp_mark_(apply.sid, a.result); }
  if (paid) {
    sp_thank_(rec, q);
    try {
      MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': new sponsorship ' + naira_(rec.amount),
        body: 'A sponsorship came in through the website.\n\nFrom: ' + (rec.donorName || '-') + ' (' + (rec.donorEmail || 'no email') + ')\nAmount: ' + naira_(rec.amount) +
              '\nFor: ' + result + (rec.message ? '\nMessage: ' + rec.message : '') + '\n\nSee it on the owner dashboard (Sponsors).' });
    } catch (e) { console.error(e); }
  }
  return { ok: true, result: result };
}
function sp_mark_(sid, note) {
  const T = sp_tab_(), s = T.rows.filter(function (r) { return String(r.SponsorshipID) === sid; })[0];
  if (s) { put_(T, s._row, 'Applied', iso_(new Date(), true), true); if (note) put_(T, s._row, 'Notes', String(note).slice(0, 200), true); }
}
function sp_thank_(rec, q) {
  if (!validEmail_(rec.donorEmail)) return;
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    const first = rec.donorName ? rec.donorName.split(' ')[0] : '';
    const what = rec.type === 'Student' && q ? 'Your gift covers ' + rec.months + ' month' + (rec.months === 1 ? '' : 's') + ' of ' + (q.Programme || 'school') + ' fees for ' + q.PublicName + '.' +
      (sp_yes_(q.Consent) ? ' We will send you a short update on ' + String(q.PublicName).split(/[ ,]/)[0] + "'s progress each month, in shā’ Allāh." : '')
      : 'Your gift goes into the Himaayah Sponsorship Fund, which pays fees for students whose families cannot afford them. We will email you when it is used.';
    MailApp.sendEmail({ to: rec.donorEmail, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': thank you for your gift of ' + naira_(rec.amount),
      body: 'Assalaamu alaykum' + (first ? ' ' + first : '') + ',\n\nJazakallahu khayran. We have received your gift of ' + naira_(rec.amount) + '.\n\n' + what +
            '\n\nThe Prophet ﷺ said: "When a person dies, his deeds end except for three: an ongoing charity, knowledge that is benefited from, or a righteous child who prays for him." (Sahih Muslim 1631)\n\n' +
            'May Allah accept it from you and make it heavy on your scales.\n\n' + SCHOOL_NAME + '\n' + SP_PAGE });
  } catch (e) { console.error(e); }
}

/* Pays N months of a student's fees from sponsorship money. Call outside the script lock. */
function sp_applyFee_(studentId, months, amount, reference, method) {
  const f = typeof fee_find_ === 'function' ? fee_find_(studentId) : null;
  if (!f) return { ok: false, result: 'Student ' + studentId + ' not found; apply it by hand' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let nd = '';
  try {
    const today = today_(), m = f.months ? f.months * Math.max(1, months || 1) : 0;
    if (f.tab === 'Students') {
      append_(table_('Payments'), { PaymentID: 'P-' + Utilities.getUuid().slice(0, 6).toUpperCase(), StudentID: f.id, Date: today, Amount: amount, Months: Math.max(1, m || months || 1),
                                    Reference: reference, Method: method, Status: 'Confirmed' }, ['StudentID', 'Reference', 'Method']);
    } else {
      const fresh = table_(f.tab), row = fresh.rows.filter(function (r) { return key_(r.StudentID) === key_(f.id); })[0];
      if (m > 0) { const cur = iso_(row.NextDue), base = (cur && cur >= today) ? cur : today; nd = addMonths_(base, m); put_(fresh, row._row, 'NextDue', nd, true); row.NextDue = nd; }
      row.PaymentStatus = 'Paid'; put_(fresh, row._row, 'PaymentStatus', payStatus_(row));
      append_(table_(f.tab === 'AcademyStudents' ? 'AcademyPayments' : 'SkillsPayments'), { PaymentID: 'P-' + Utilities.getUuid().slice(0, 6).toUpperCase(), StudentID: f.id, Date: today,
        Amount: amount, Months: m, Reference: reference, Method: method, ConfirmedBy: method + ' (automatic)', Recorded: new Date() }, ['StudentID', 'Date', 'Reference', 'Method', 'ConfirmedBy']);
    }
  } finally { lock.releaseLock(); }
  if (f.tab === 'Students') { try { applyPayments_(); } catch (e) { console.error(e); } }   // moves NextDue and emails the family
  else sendEmail_(f.row, SCHOOL_NAME + ': fees paid by a sponsor', 'Assalaamu alaykum. ' + naira_(amount) + ' of fees for ' + String(f.name).split(' ')[0] +
       ' has been paid by a sponsor, alhamdulillah.' + (nd ? ' The next payment is due on ' + nice_(nd) + '.' : '') + ' Please make du‘ā’ for them.');
  return { ok: true, result: 'Applied to ' + f.id + (nd ? ', next due ' + nd : ''), name: f.name, programme: f.programme, studentId: f.id };
}

/* ===== OWNER DASHBOARD ACTIONS (Owner.gs checks the login first) ===== */
function sp_fundBalance_(T) {
  return (T || sp_tab_()).rows.reduce(function (t, s) { return t + (String(s.Type) === 'Fund' ? Number(s.Remaining) || 0 : 0); }, 0);
}
/* Use fund money to pay a student's fees. months: how many periods. */
function sp_allocate_(by, p) {
  const f = typeof fee_find_ === 'function' ? fee_find_(p.studentId) : null;
  if (!f) return { ok: false, error: 'No student with that ID.' };
  if (!(f.amount > 0)) return { ok: false, error: 'This student has no fee set.' };
  const periods = f.months ? Math.max(1, Math.min(12, Math.round(Number(p.months) || 1))) : 1;
  const amount = f.amount * periods;
  const used = [];
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let sid;
  try {
    const T = sp_tab_(), bal = sp_fundBalance_(T);
    if (bal < amount) return { ok: false, error: 'The fund has ' + naira_(bal) + ', but ' + naira_(amount) + ' is needed.' };
    let need = amount;
    T.rows.filter(function (s) { return String(s.Type) === 'Fund' && Number(s.Remaining) > 0; })
      .sort(function (a, b) { return iso_(a.Date, true) < iso_(b.Date, true) ? -1 : 1; })
      .forEach(function (s) {
        if (need <= 0) return;
        const take = Math.min(need, Number(s.Remaining)); need -= take;
        put_(T, s._row, 'Remaining', Number(s.Remaining) - take);
        if (Number(s.Remaining) - take <= 0) put_(T, s._row, 'Status', 'Used');
        used.push({ s: s, take: take });
      });
    sid = sp_id_('SA-');
    append_(T, { SponsorshipID: sid, Date: iso_(new Date(), true), Type: 'Allocation', DonorName: 'Sponsorship Fund', StudentID: f.id, Months: f.months ? f.months * periods : '',
      Amount: amount, Remaining: 0, Status: 'Allocated', Reference: used.map(function (u) { return u.s.SponsorshipID; }).join(', ').slice(0, 300), Notes: 'By ' + (by || 'staff') + (p.note ? ': ' + sp_txt_(p.note, 150) : '') },
      ['SponsorshipID', 'Date', 'DonorName', 'StudentID', 'Reference', 'Notes']);
  } finally { lock.releaseLock(); }
  const a = sp_applyFee_(f.id, periods, amount, 'Sponsorship fund ' + sid, 'Sponsorship fund');
  sp_mark_(sid, a.result);
  // tell the fund donors whose money was used (no student name: these families did not agree to share it)
  used.forEach(function (u) {
    const e = String(u.s.DonorEmail || '');
    if (!validEmail_(e) || MailApp.getRemainingDailyQuota() < 1) return;
    try {
      MailApp.sendEmail({ to: e, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': your gift is at work',
        body: 'Assalaamu alaykum' + (u.s.DonorName ? ' ' + String(u.s.DonorName).split(' ')[0] : '') + ',\n\nAlhamdulillah, ' + naira_(u.take) + ' of your gift to the Sponsorship Fund has just paid ' +
              (f.months ? f.months * periods + ' month' + (f.months * periods === 1 ? '' : 's') + ' of ' : '') + f.programme + ' fees for a student whose family could not afford them.' +
              (Number(u.s.Remaining) - u.take > 0 ? '\n\n' + naira_(Number(u.s.Remaining) - u.take) + ' of your gift is still waiting to help the next student.' : '') +
              '\n\nJazakallahu khayran for making this possible.\n\n' + SCHOOL_NAME + '\n' + SP_PAGE });
    } catch (err) { console.error(err); }
  });
  CacheService.getScriptCache().remove('sp_list');
  return { ok: true, message: naira_(amount) + ' from the fund paid ' + (f.months ? f.months * periods + ' month(s)' : 'the course fee') + ' for ' + f.name + ' (' + f.id + ').' };
}
/* Staff review a family's request: list it on the page, link the Student ID, or close it. */
function sp_saveRequest_(p) {
  const Q = sp_req_(), q = Q.rows.filter(function (r) { return key_(r.RequestID) === key_(p.requestId); })[0];
  if (!q) return { ok: false, error: 'Request not found.' };
  const status = String(p.status || q.Status);
  if (['New', 'Listed', 'Funded', 'Closed', 'Declined'].indexOf(status) < 0) return { ok: false, error: 'Unknown status.' };
  const pub = sp_txt_(p.publicName != null ? p.publicName : q.PublicName, 40), fee = Math.round(Number(p.monthlyFee != null ? p.monthlyFee : q.MonthlyFee) || 0);
  const months = Math.round(Number(p.monthsNeeded != null ? p.monthsNeeded : q.MonthsNeeded) || 0), sid = key_(p.studentId != null ? p.studentId : q.StudentID);
  if (status === 'Listed') {
    if (!pub) return { ok: false, error: 'Add a public name, such as "Aisha, 9". Use the first name only.' };
    if (!(fee > 0) || !(months > 0)) return { ok: false, error: 'Add the monthly fee and how many months are needed.' };
  }
  if (sid && typeof fee_find_ === 'function' && !fee_find_(sid)) return { ok: false, error: 'No student with the ID ' + sid + '.' };
  const hadId = key_(q.StudentID);
  put_(Q, q._row, 'Status', status); put_(Q, q._row, 'PublicName', pub, true); put_(Q, q._row, 'Blurb', sp_txt_(p.blurb != null ? p.blurb : q.Blurb, 400), true);
  put_(Q, q._row, 'MonthlyFee', fee || ''); put_(Q, q._row, 'MonthsNeeded', months || ''); put_(Q, q._row, 'StudentID', sid, true);
  if (p.notes != null) put_(Q, q._row, 'Notes', sp_txt_(p.notes, 300), true);
  CacheService.getScriptCache().remove('sp_list');
  // Gifts that were waiting for this student to be enrolled are applied now
  let applied = 0;
  if (sid && sid !== hadId) {
    const T = sp_tab_();
    T.rows.filter(function (s) { return String(s.Type) === 'Student' && key_(s.RequestID) === key_(q.RequestID) && String(s.Status) === 'Held'; }).forEach(function (s) {
      put_(T, s._row, 'StudentID', sid, true); put_(T, s._row, 'Status', 'Applied');
      const a = sp_applyFee_(sid, Number(s.Months) || 1, Number(s.Amount) || 0, 'Sponsor ' + s.SponsorshipID, 'Sponsor');
      sp_mark_(String(s.SponsorshipID), a.result); applied++;
    });
  }
  return { ok: true, message: 'Saved.' + (applied ? ' ' + applied + ' waiting gift' + (applied === 1 ? ' was' : 's were') + ' applied to ' + sid + '.' : '') };
}

/* ===== MONTHLY UPDATE TO SPONSORS (called by Reports.gs after each student's report) ===== */
function sp_progressUpdate_(x, rep, key) {
  const id = key_(x.id);
  const Q = sp_try_(SP_REQ_TAB);
  const reqs = Q.rows.filter(function (q) { return key_(q.StudentID) === id && sp_yes_(q.Consent); });
  if (!reqs.length) return 0;
  const T = sp_tab_(), oldest = addMonths_(today_(), -SP_UPDATE_MONTHS), byEmail = {};
  T.rows.forEach(function (s) {
    if (String(s.Type) !== 'Student' || !reqs.some(function (q) { return key_(q.RequestID) === key_(s.RequestID); })) return;
    if (!validEmail_(s.DonorEmail) || String(s.LastUpdate) === key || iso_(s.Date) < oldest) return;
    const e = String(s.DonorEmail).toLowerCase();
    (byEmail[e] = byEmail[e] || []).push(s);
  });
  const q = reqs[0], name = String(q.PublicName || rep.first).split(/[ ,]/)[0];
  let n = 0;
  Object.keys(byEmail).forEach(function (e) {
    if (MailApp.getRemainingDailyQuota() < (typeof RP_RESERVE === 'number' ? RP_RESERVE : 10)) return;
    const rows = byEmail[e], donor = String(rows[0].DonorName || '').split(' ')[0];
    const lines = rep.highlights.length ? rep.highlights.map(function (h) { return '• ' + h; }).join('\n') : '• Classes continued as normal this month.';
    try {
      MailApp.sendEmail({ to: e, name: SCHOOL_NAME,
        subject: rep.milestone ? SCHOOL_NAME + ': alhamdulillah, ' + name + ' ' + rep.milestone : SCHOOL_NAME + ': ' + name + "'s month at Himaayah (" + rep.month + ')',
        body: 'Assalaamu alaykum' + (donor ? ' ' + donor : '') + ',\n\n' + (rep.milestone ? 'Good news: ' + name + ', the student you sponsor, has ' + rep.milestone + '. Alhamdulillah.\n\n' : '') +
              'Here is how ' + name + ' did in ' + rep.month + ' (' + rep.programme + '):\n' + lines + '\n\n' +
              'None of this would be possible without your support. Jazakallahu khayran, and please keep ' + name + ' in your du‘ā’.\n\n' + SCHOOL_NAME + '\n' + SP_PAGE });
      rows.forEach(function (s) { put_(T, s._row, 'LastUpdate', key, true); });
      n++;
    } catch (err) { console.error(err); }
  });
  return n;
}

/* ===== for the owner dashboard ===== */
function sp_summary_() {
  const T = sp_try_(SP_TAB), Q = sp_try_(SP_REQ_TAB), month = today_().slice(0, 7);
  let raised = 0, month$ = 0, held = 0, allocated = 0;
  T.rows.forEach(function (s) {
    const type = String(s.Type), amt = Number(s.Amount) || 0;
    if (type === 'Fund' || type === 'Student') { raised += amt; if (iso_(s.Date).slice(0, 7) === month) month$ += amt; }
    if (type === 'Student' && String(s.Status) === 'Held') held += amt;
    if (type === 'Allocation') allocated += amt;
  });
  return {
    balance: T.rows.length ? sp_fundBalance_(T) : 0, raised: raised, month: month$, held: held, allocated: allocated,
    requests: Q.rows.filter(function (q) { return q.RequestID && ['Closed', 'Declined'].indexOf(String(q.Status)) < 0; }).map(function (q) {
      return { RequestID: String(q.RequestID), Submitted: iso_(q.Submitted, true), StudentName: String(q.StudentName || ''), StudentID: String(q.StudentID || ''), Programme: String(q.Programme || ''),
               Plan: String(q.Plan || ''), ParentName: String(q.ParentName || ''), Email: String(q.Email || ''), WhatsApp: String(q.WhatsApp || ''), Reason: String(q.Reason || ''),
               Consent: String(q.Consent || ''), Status: String(q.Status || 'New'), PublicName: String(q.PublicName || ''), Blurb: String(q.Blurb || ''),
               MonthlyFee: Number(q.MonthlyFee) || 0, MonthsNeeded: Number(q.MonthsNeeded) || 0, MonthsFunded: Number(q.MonthsFunded) || 0, Notes: String(q.Notes || '') };
    }).sort(function (a, b) { return (a.Status === 'New' ? 0 : 1) - (b.Status === 'New' ? 0 : 1) || (a.Submitted < b.Submitted ? 1 : -1); }),
    recent: T.rows.filter(function (s) { return s.SponsorshipID; }).sort(function (a, b) { return iso_(a.Date, true) < iso_(b.Date, true) ? 1 : -1; }).slice(0, 15).map(function (s) {
      return { ID: String(s.SponsorshipID), Date: iso_(s.Date, true), Type: String(s.Type), Donor: String(s.DonorName || ''), Email: String(s.DonorEmail || ''), StudentID: String(s.StudentID || ''),
               RequestID: String(s.RequestID || ''), Amount: Number(s.Amount) || 0, Remaining: Number(s.Remaining) || 0, Status: String(s.Status || ''), Message: String(s.Message || '') };
    })
  };
}

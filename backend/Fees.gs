/**
 * Pay fees online (current students)
 *
 * The website page pay.html lets a parent enter a Student ID, see what is due and pay by card.
 *   action "feeLookup"  (public)   → masked name, plan, amount per payment, next due date
 *   action "feeQuote"   (secret)   → the same, used by api/fees-checkout on the server so the price can't be changed
 * When Bachs confirms the payment, api/bachs-webhook sends action "cardPayment" with kind "fee";
 * CardPayments.gs passes it to feeCardPayment_ below, which records the payment and moves the
 * next due date forward straight away. Nobody needs to check a receipt.
 *
 * Works for all three student tabs:
 *   Students (Madrasah and others, IDs HM-…)   → a Payments row with Status Confirmed, applied by applyPayments_ (Code.gs)
 *   AcademyStudents (AC-…)                      → AcademyPayments row + NextDue moved (Academy.gs tabs)
 *   SkillsStudents (SK-…)                       → SkillsPayments row + NextDue moved (Skills.gs tabs)
 *
 * SETUP: add this file to the Apps Script project, then Deploy → Manage deployments → New version.
 * It uses the CARD_SECRET script property you already set for card payments.
 */

const FEE_PAGE_URL = 'https://www.himaayahschools.com/pay.html';
const FEE_MAX_PERIODS = 12;         // a student can pay up to 12 periods ahead at once
const FEE_LOOKUPS_PER_HOUR = 300;   // simple protection against someone trying many IDs

function feesFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (a === 'feeLookup') {
      const cache = CacheService.getScriptCache(), k = 'feelookups', n = Number(cache.get(k) || 0);
      if (n >= FEE_LOOKUPS_PER_HOUR) return { ok: false, error: 'Too many lookups right now. Please try again later.' };
      cache.put(k, String(n + 1), 3600);
      const f = fee_find_(p.id);
      if (!f) return { ok: false, error: 'We could not find that Student ID. Check it on your login email, or message the school.' };
      return fee_public_(f);
    }
    if (a === 'feeQuote') {
      const secret = PropertiesService.getScriptProperties().getProperty('CARD_SECRET');
      if (!secret || !same_(String(p.secret || ''), secret)) return { ok: false, error: 'Not allowed' };
      const f = fee_find_(p.id);
      if (!f) return { ok: false, error: 'Student not found.' };
      if (!f.payable) return { ok: false, error: f.reason };
      const periods = Math.max(1, Math.min(FEE_MAX_PERIODS, Math.round(Number(p.periods) || 1)));
      return { ok: true, studentId: f.id, name: f.name, programme: f.programme, plan: f.plan, email: f.email,
               periods: periods, months: f.months * periods, amount: f.amount * periods, tab: f.tab };
    }
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* Find a student in any of the three tabs. Returns what is needed to show and charge the fee. */
function fee_find_(rawId) {
  const id = key_(rawId).slice(0, 20);
  if (!/^[A-Z]{1,4}-?\d{1,6}$/.test(id)) return null;
  const tabs = [
    { tab: 'Students', programme: function (s) { return /tbc|teen/i.test(String(s.Plan) + ' ' + String(s.Level)) ? 'Teenagers Building Circle' : 'Madrasah'; },
      fee: function (s) { return { amount: Number(s.MonthlyFee) || 0, months: 1 }; } },
    { tab: 'AcademyStudents', programme: function () { return 'Academy'; },
      fee: function (s) { return { amount: Number(s.MonthlyFee) || 0, months: 1 }; } },
    { tab: 'SkillsStudents', programme: function () { return 'Skills School'; },
      fee: function (s) { const m = /(\d+)/.exec(String(s.Period || '')); return { amount: Number(s.Fee) || 0, months: /one-time/i.test(String(s.Period || '')) ? 0 : (m ? Number(m[1]) : 1) }; } }
  ];
  for (let i = 0; i < tabs.length; i++) {
    let t; try { t = table_(tabs[i].tab); } catch (e) { continue; }
    const s = t.rows.filter(function (r) { return key_(r.StudentID) === id; })[0];
    if (!s) continue;
    const fee = tabs[i].fee(s), status = payStatus_(s), active = key_(s.Active) !== 'FALSE';
    let payable = active && fee.amount > 0, reason = '';
    if (!active) reason = 'This student account is not active. Please message the school.';
    else if (String(s.PaymentStatus || '').trim().toLowerCase() === 'exempt') { payable = false; reason = 'This student is exempt from fees.'; }
    else if (!fee.amount) reason = 'There is no fee set for this student yet. Please message the school.';
    else if (fee.months === 0 && status === 'Paid') { payable = false; reason = 'This course is paid in full. There is nothing to pay.'; }
    return { tab: tabs[i].tab, t: t, row: s, id: String(s.StudentID).trim(), name: String(s.Name || ''), programme: tabs[i].programme(s),
             plan: String(s.Plan || s.Track || s.Course || ''), email: String(s.Email || ''), amount: fee.amount, months: fee.months,
             nextDue: iso_(s.NextDue), status: status, payable: payable, reason: reason };
  }
  return null;
}
function fee_mask_(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts[0] + (parts.length > 1 ? ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.' : '');
}
function fee_public_(f) {
  return { ok: true, studentId: f.id, name: fee_mask_(f.name), programme: f.programme, plan: f.plan, amount: f.amount, months: f.months,
           nextDue: f.nextDue, status: f.status, payable: f.payable, reason: f.reason, maxPeriods: f.months ? FEE_MAX_PERIODS : 1, today: today_() };
}

/* Called by cardPaymentFromRequest (CardPayments.gs) for kind "fee", after the secret check. */
function feeCardPayment_(p) {
  const rec = {
    studentId: key_(p.studentId), periods: Math.max(1, Math.round(Number(p.periods) || 1)), amount: Number(p.amount) || 0, currency: String(p.currency || '').toUpperCase(),
    status: String(p.status || '').toUpperCase(), eventId: String(p.eventId || ''), checkoutId: String(p.checkoutId || ''), chargeId: String(p.chargeId || ''),
    email: String(p.email || ''), ref: String(p.ref || '')
  };
  let result = '', who = null, nd = '';
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = ss_();
    let log = ss.getSheetByName(CARD_LOG_TAB);
    if (!log) { log = ss.insertSheet(CARD_LOG_TAB); log.getRange(1, 1, 1, CARD_LOG_HEAD.length).setValues([CARD_LOG_HEAD]).setFontWeight('bold'); log.setFrozenRows(1); }
    if (rec.eventId && log.getLastRow() > 1) {
      const ids = log.getRange(2, CARD_LOG_HEAD.indexOf('EventID') + 1, log.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === rec.eventId) return { ok: true, duplicate: true };
    }
    const f = fee_find_(rec.studentId);
    const paid = /^(SUCCEEDED|ACCEPTED|OVERPAID)$/.test(rec.status);
    if (!f) result = 'Student not found';
    else if (!paid || rec.currency !== 'NGN') result = 'Not a completed NGN payment';
    else if (rec.amount + 0.001 < f.amount * rec.periods) result = 'Amount below the fee (expected ' + naira_(f.amount * rec.periods) + ')';
    else {
      who = f;
      const months = f.months * rec.periods, today = today_(), reference = rec.ref || rec.checkoutId || rec.eventId;
      if (f.tab === 'Students') {
        const pay = table_('Payments');
        append_(pay, { PaymentID: 'P-' + Utilities.getUuid().slice(0, 6).toUpperCase(), StudentID: f.id, Date: today, Amount: rec.amount, Months: Math.max(1, months),
                       Reference: reference, Method: 'Card', Status: 'Confirmed' }, ['StudentID', 'Reference']);
        result = 'Recorded; next due date updates now';
      } else {
        const payTab = f.tab === 'AcademyStudents' ? 'AcademyPayments' : 'SkillsPayments';
        if (months > 0) {
          const cur = iso_(f.row.NextDue), base = (cur && cur >= today) ? cur : today;
          nd = addMonths_(base, months);
          put_(f.t, f.row._row, 'NextDue', nd, true); f.row.NextDue = nd;
        }
        f.row.PaymentStatus = 'Paid'; put_(f.t, f.row._row, 'PaymentStatus', payStatus_(f.row));
        append_(table_(payTab), { PaymentID: 'P-' + Utilities.getUuid().slice(0, 6).toUpperCase(), StudentID: f.id, Date: today, Amount: rec.amount, Months: months,
                                  Reference: reference, Method: 'Card', ConfirmedBy: 'Card (automatic)', Recorded: new Date() }, ['StudentID', 'Date', 'Reference', 'ConfirmedBy']);
        result = 'Recorded; next due ' + (nd || 'unchanged');
      }
    }
    const r = log.getLastRow() + 1;
    log.getRange(r, 1, 1, CARD_LOG_HEAD.length).setNumberFormat('@').setValues([[
      iso_(new Date(), true), rec.ref || ('FEE ' + rec.studentId), who ? who.name : '', 'Fees' + (who ? ': ' + who.plan : ''), String(rec.amount), rec.currency, rec.status,
      rec.email, rec.checkoutId, rec.chargeId, rec.eventId, result
    ]]);
  } finally { lock.releaseLock(); }

  if (who && who.tab === 'Students') { try { applyPayments_(); } catch (e) { console.error(e); } }   // moves NextDue and sends the thank-you email
  else if (who) {
    sendEmail_(who.row, SCHOOL_NAME + ': payment received', 'Assalaamu alaykum ' + String(who.name).split(' ')[0] + '. We have received your card payment of ' + naira_(rec.amount) + '.' +
      (nd ? ' Your next payment is due on ' + nice_(nd) + '.' : '') + ' Jazakumullahu khayran.');
  }
  if (CARD_NOTIFY) {
    try {
      const to = Session.getEffectiveUser().getEmail();
      if (to && MailApp.getRemainingDailyQuota() > 0) MailApp.sendEmail({ to: to, name: SCHOOL_NAME,
        subject: SCHOOL_NAME + ': fee paid online ' + naira_(rec.amount) + ' (' + rec.studentId + ')',
        body: 'A fee payment came in through the Pay fees page.\n\nStudent: ' + (who ? who.name + ' (' + who.id + ')' : rec.studentId) + '\nAmount: ' + naira_(rec.amount) +
              '\nResult: ' + result + '\nBachs checkout: ' + (rec.checkoutId || '-') });
    } catch (err) { console.error(err); }
  }
  return { ok: true, result: result };
}

/* Link used in reminder emails and WhatsApp messages */
/* The link itself is payLink_ in Code.gs, so reminders work in every file. */

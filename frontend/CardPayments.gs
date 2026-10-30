/**
 * Card payments from the website (Bachs)
 *
 * When a parent pays by card, Bachs tells the website (api/bachs-webhook), and the
 * website sends the payment here with action "cardPayment". This file:
 *   1. checks the shared secret, so only the website can record payments,
 *   2. logs the payment once on a "Card payments" tab (created automatically),
 *   3. finds the Enrolments row with the same Ref, fills in CardPayment, and
 *      - if the amount and currency match the plan: sets Status to Confirmed and
 *        creates the student's account straight away (Enrol.gs en_createAccount:
 *        Students row, Payments row with Method "Card", login email), or
 *      - if anything doesn't match: sets Status to "Card paid" and leaves a note,
 *        so staff check it in Bachs and confirm by hand,
 *   4. emails the school account that runs this script.
 *
 * SETUP (once)
 *   1. Add this as a new script file named CardPayments (Code.gs already routes to it).
 *   2. Project Settings → Script properties → Add property:
 *        CARD_SECRET = the same long text you saved in Vercel as APPS_SCRIPT_SECRET
 *   3. Run setupEnrolments once from the editor, so the Enrolments tab gets the
 *      PayMethod and CardPayment columns and the new Status choices.
 *   4. Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy.
 *      The web app URL stays the same.
 */

const CARD_AUTO_CONFIRM = true;   // false = every card payment waits for staff to confirm
const CARD_NOTIFY = true;         // email the school account about each card payment
const CARD_LOG_TAB = 'Card payments';
const CARD_LOG_HEAD = ['Received', 'Reference', 'Student', 'Plan', 'Amount', 'Currency', 'Status', 'PayerEmail', 'CheckoutID', 'ChargeID', 'EventID', 'Result'];

function cardPaymentFromRequest(p) {
  const secret = PropertiesService.getScriptProperties().getProperty('CARD_SECRET');
  if (!secret || !same_(String(p.secret || ''), secret)) return { ok: false, error: 'Not allowed' };
  if (String(p.kind || '') === 'fee' || /^FEE-/i.test(String(p.ref || ''))) return feeCardPayment_(p);   // Pay fees page (Fees.gs)
  if (String(p.kind || '') === 'sponsor' || /^SPN-/i.test(String(p.ref || ''))) return sponsorCardPayment_(p);   // Sponsor a student (Sponsors.gs)
  if (String(p.kind || '') === 'guide' || /^GDE-/i.test(String(p.ref || ''))) return guideCardPayment_(p);   // paid children's books (Guides.gs)
  if (String(p.kind || '') === 'bootcamp' || /^HBP-/i.test(String(p.ref || ''))) return bootcampCardPayment_(p);   // Hadith Bootcamp (Bootcamp.gs)

  const rec = {
    ref: String(p.ref || '').trim().toUpperCase().slice(0, 40),
    student: String(p.student || '').slice(0, 120),
    plan: String(p.plan || '').slice(0, 120),
    amount: String(p.amount || ''),
    currency: String(p.currency || '').toUpperCase(),
    status: String(p.status || '').toUpperCase(),
    email: String(p.email || '').slice(0, 200),
    checkoutId: String(p.checkoutId || ''),
    chargeId: String(p.chargeId || ''),
    eventId: String(p.eventId || '')
  };
  const amt = rec.currency === 'NGN' ? naira_(rec.amount) : rec.currency + ' ' + rec.amount;

  let result = 'No enrolment with this reference', confirmRow = 0, sh = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ss_();

    // 1. log, once per Bachs event (Bachs may send the same event more than once)
    let log = ss.getSheetByName(CARD_LOG_TAB);
    if (!log) {
      log = ss.insertSheet(CARD_LOG_TAB);
      log.getRange(1, 1, 1, CARD_LOG_HEAD.length).setValues([CARD_LOG_HEAD]).setFontWeight('bold');
      log.setFrozenRows(1);
    }
    if (rec.eventId && log.getLastRow() > 1) {
      const ids = log.getRange(2, CARD_LOG_HEAD.indexOf('EventID') + 1, log.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === rec.eventId) return { ok: true, duplicate: true };
    }

    // 2. the enrolment row with the same Ref
    sh = ss.getSheetByName(EN_TAB);
    const row = sh && rec.ref ? en_findRow(sh, 'Ref', rec.ref) : 0;
    if (row) { result = card_apply_(sh, row, rec); if (result === 'Confirmed') confirmRow = row; }

    const r = log.getLastRow() + 1;
    log.getRange(r, 1, 1, CARD_LOG_HEAD.length).setNumberFormat('@').setValues([[
      iso_(new Date(), true), rec.ref, rec.student, rec.plan, rec.amount, rec.currency, rec.status, rec.email, rec.checkoutId, rec.chargeId, rec.eventId, result
    ]]);
  } finally { lock.releaseLock(); }

  // 3. create the account (outside the lock: en_createAccount takes the lock itself), 4. tell staff
  const account = card_finish_(sh, confirmRow, rec, result);
  return { ok: true, result: account ? 'Confirmed' : result, account: account };
}


/* Marks one Enrolments row as card-paid. Call inside the script lock. Returns the result text. */
function card_apply_(sh, row, rec) {
  const head = en_headers(sh);
  const amt = rec.currency === 'NGN' ? naira_(rec.amount) : rec.currency + ' ' + rec.amount;
  const get = function (h) { return head.indexOf(h) < 0 ? '' : String(sh.getRange(row, head.indexOf(h) + 1).getValue()).trim(); };
  const set = function (h, v) { if (head.indexOf(h) >= 0) sh.getRange(row, head.indexOf(h) + 1).setNumberFormat('@').setValue(v); };
  set('CardPayment', 'Paid ' + amt + ' on ' + nice_(today_()) + (rec.checkoutId ? ' (' + rec.checkoutId + ')' : ''));
  set('PayMethod', 'Card');
  const status = get('Status'), plan = EN_PLANS[get('Plan')];
  const paid = /^(SUCCEEDED|ACCEPTED|OVERPAID)$/.test(rec.status);
  const matches = paid && rec.currency === 'NGN' && plan && Number(rec.amount) >= Number(plan[0]);
  if (status === 'Account created' || get('StudentID')) return 'Already had an account';
  if (matches && CARD_AUTO_CONFIRM) { set('Status', 'Confirmed'); return 'Confirmed'; }
  set('Status', 'Card paid');
  if (!matches) set('Notes', 'Card payment of ' + amt + ' does not match the plan price (' + (plan ? naira_(plan[0]) : 'unknown plan') + '). Check it in Bachs, then confirm.');
  return matches ? 'Waiting for staff to confirm' : 'Amount did not match the plan';
}

/* Creates the account for a confirmed row (outside the lock) and emails staff. Returns the StudentID or ''. */
function card_finish_(sh, confirmRow, rec, result) {
  const amt = rec.currency === 'NGN' ? naira_(rec.amount) : rec.currency + ' ' + rec.amount;
  let account = '';
  if (confirmRow) {
    en_createAccount(sh, confirmRow);
    const head = en_headers(sh);
    account = String(sh.getRange(confirmRow, head.indexOf('StudentID') + 1).getValue()).trim();
    if (!account) result = 'Confirmed, but the account could not be created (see Notes)';
  }
  if (CARD_NOTIFY) {
    try {
      const to = Session.getEffectiveUser().getEmail();
      if (to && MailApp.getRemainingDailyQuota() > 0) {
        const what = account ? 'The account ' + account + ' was created and the login details were emailed.'
          : result === 'No enrolment with this reference' ? 'No Enrolments row has this reference yet. If the enrolment arrives later (or you add the row by hand), it is matched automatically, or run Himaayah → Match card payments to enrolments.'
          : result + '. Check it in the Bachs dashboard and confirm the enrolment.';
        MailApp.sendEmail({
          to: to, name: SCHOOL_NAME,
          subject: SCHOOL_NAME + ': card payment ' + amt + (rec.ref ? ' (' + rec.ref + ')' : ''),
          body: 'A card payment came in through the website.\n\n' +
            'Reference: ' + (rec.ref || '-') + '\nStudent: ' + (rec.student || '-') + '\nPlan: ' + (rec.plan || '-') +
            '\nAmount: ' + amt + '\nPayer email: ' + (rec.email || '-') + '\nBachs checkout: ' + (rec.checkoutId || '-') + '\n\n' + what
        });
      }
    } catch (err) { console.error(err); }
  }
  return account;
}

/* Card payments logged as "No enrolment with this reference" are matched once the
   Enrolments row exists: automatically when the website saves it late (Enrol.gs),
   or from the menu after staff add the row by hand. ref = one reference, or '' for all. */
function card_rematch_(ref) {
  const want = String(ref || '').trim().toUpperCase();
  const todo = [];
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let sh;
  try {
    const ss = ss_(), log = ss.getSheetByName(CARD_LOG_TAB);
    sh = ss.getSheetByName(EN_TAB);
    if (!log || !sh || log.getLastRow() < 2) return 0;
    const H = CARD_LOG_HEAD, vals = log.getRange(2, 1, log.getLastRow() - 1, H.length).getValues().map(function (r) { return r.map(String); });
    vals.forEach(function (v, i) {
      const r = String(v[H.indexOf('Reference')]).trim().toUpperCase();
      if (String(v[H.indexOf('Result')]) !== 'No enrolment with this reference' || !r || (want && r !== want)) return;
      const row = en_findRow(sh, 'Ref', r);
      if (!row) return;
      const rec = { ref: r, student: v[H.indexOf('Student')], plan: v[H.indexOf('Plan')], amount: String(v[H.indexOf('Amount')]), currency: String(v[H.indexOf('Currency')]).toUpperCase(),
                    status: String(v[H.indexOf('Status')]).toUpperCase(), email: v[H.indexOf('PayerEmail')], checkoutId: v[H.indexOf('CheckoutID')] };
      const result = card_apply_(sh, row, rec);
      log.getRange(i + 2, H.indexOf('Result') + 1).setValue(result + ' (matched later)');
      todo.push({ row: result === 'Confirmed' ? row : 0, rec: rec, result: result });
    });
  } finally { lock.releaseLock(); }
  todo.forEach(function (t) { card_finish_(sh, t.row, t.rec, t.result); });
  return todo.length;
}

/* Menu: Himaayah → Match card payments to enrolments */
function matchCardPayments() {
  const n = card_rematch_('');
  const msg = n ? 'Matched ' + n + ' card payment' + (n === 1 ? '' : 's') + ' to enrolments. See the Result column on the Card payments tab.'
    : 'Nothing to match. Every card payment marked "No enrolment with this reference" still has no Enrolments row with the same Ref.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

/**
 * Admissions tracker (Admissions.gs). A parent or student who has enrolled can see where their enrolment stands, without signing in.
 * Add this as a NEW file next to Code.gs, replace Code.gs with the updated copy, and add admission-status.html to the website.
 *
 * HOW IT WORKS
 *  - They type the enrolment reference (ENR-XXXXXX, shown after enrolling and in the receipt message) AND the email address or phone number
 *    they gave when enrolling. Both must match the Enrolments tab, so a stranger cannot look up someone else's enrolment by guessing.
 *  - Wrong tries are limited per reference and across the whole site (see ADM_MAX_FAILS, ADM_MAX_FAILS_ALL).
 *  - It reads the Enrolments tab (Enrol.gs) and never writes to it. It shows three stages:
 *      1. Received   the enrolment is on file (Status: Receipt sent, Awaiting card payment, Already paid (check))
 *      2. Assessed   staff have checked the payment and details (Status: Card paid, Confirmed)
 *      3. Confirmed  the place is confirmed and the login was sent (Status: Account created, or a StudentID is filled in)
 *    For Madrasah it also says whether the placement conversation is still to come ("Awaiting placement" level) or the starting level is set.
 *  - A Status that says rejected / declined / cancelled / refunded shows "please contact the school" instead of the stages.
 *  - It shows only the student's first name, the plan and the dates. Never the notes, contact details, amounts or login.
 */
const ADM_MAX_FAILS = 5;            // wrong tries for one reference before it is paused
const ADM_MAX_FAILS_ALL = 80;       // wrong tries across the whole site per window
const ADM_WINDOW_SECONDS = 900;     // 15 minutes
const ADM_STAGE2 = ['CARD PAID', 'CONFIRMED', 'ACCOUNT CREATED'];
const ADM_PROBLEM = /reject|declin|cancel|refund|fail|void/i;

function adm_digits_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function adm_contactOk_(row, typed) {
  typed = String(typed || '').trim();
  if (!typed) return false;
  if (typed.indexOf('@') >= 0) {
    const t = typed.toLowerCase();
    return ['KinEmail', 'StudentEmail', 'LoginEmail'].some(function (k) { return String(row[k] || '').trim().toLowerCase() === t; });
  }
  const d = adm_digits_(typed);
  if (d.length < 9) return false;
  const have = adm_digits_(row.KinPhone);
  return have.length >= 9 && d.slice(-9) === have.slice(-9);
}
function adm_status_(p) {
  const ref = String(p.ref || '').trim().toUpperCase().slice(0, 20), cache = CacheService.getScriptCache();
  const lk = 'adm:lock:' + ref, fk = 'adm:fail:' + ref, ak = 'adm:all';
  const bad = { ok: false, error: 'We could not match that reference and contact detail. Check both, or message the school on WhatsApp.' };
  if (!/^ENR-[A-Z0-9]{4,12}$/.test(ref) || !String(p.contact || '').trim()) return { ok: false, error: 'Enter your enrolment reference (it starts with ENR-) and the email address or phone number you enrolled with.' };
  if (cache.get(lk) || Number(cache.get(ak) || 0) >= ADM_MAX_FAILS_ALL) return { ok: false, error: 'Too many attempts. Please try again in 15 minutes, or message the school on WhatsApp.' };
  let t;
  try { t = table_(EN_TAB); } catch (e) { return bad; }
  const row = t.rows.filter(function (r) { return String(r.Ref || '').trim().toUpperCase() === ref; })[0];
  if (!row || !adm_contactOk_(row, p.contact)) {
    const n = Number(cache.get(fk) || 0) + 1;
    if (n >= ADM_MAX_FAILS) { cache.put(lk, '1', ADM_WINDOW_SECONDS); cache.remove(fk); } else cache.put(fk, String(n), ADM_WINDOW_SECONDS);
    cache.put(ak, String(Number(cache.get(ak) || 0) + 1), ADM_WINDOW_SECONDS);
    return bad;
  }
  cache.remove(fk);
  const status = String(row.Status || '').trim(), up = status.toUpperCase(), id = String(row.StudentID || '').trim();
  const confirmed = up === 'ACCOUNT CREATED' || !!id, assessed = confirmed || ADM_STAGE2.indexOf(up) >= 0;
  const programme = String(row.Programme || '').trim(), planShort = String(row.Plan || '').split('—').pop().trim();
  const attention = ADM_PROBLEM.test(status) && !confirmed;
  let placement = '';
  if (confirmed && key_(programme) === 'MADRASAH') {
    let lvl = '';
    try { const s = table_('Students').rows.filter(function (r) { return key_(r.StudentID) === key_(id); })[0]; lvl = s ? String(s.Level || '').trim() : ''; } catch (e) { lvl = ''; }
    placement = !lvl || /awaiting placement/i.test(lvl) ? 'A teacher will contact you for a short placement conversation to confirm the starting level, then share the class timetable.' : 'Starting level: ' + lvl + '. The class timetable will be shared with you.';
  }
  const m1 = up === 'AWAITING CARD PAYMENT' ? 'We have your enrolment and are waiting for your card payment to complete.' : up === 'ALREADY PAID (CHECK)' ? 'We have your details and will check the payment you made before the website.' : 'We have your enrolment. If you paid by bank transfer, send your receipt on WhatsApp so we can check it.';
  const steps = [
    { key: 'received', label: 'Received', done: true, note: m1 },
    { key: 'assessed', label: 'Assessed', done: assessed, note: assessed ? 'The payment and details have been checked.' : 'Staff are checking your payment and details. This usually happens within one working day.' },
    { key: 'confirmed', label: 'Confirmed', done: confirmed, note: confirmed ? 'Your place is confirmed. The login details were sent to the email address you gave.' + (placement ? ' ' + placement : '') : 'Your place is confirmed once the check is complete. The login details are then emailed to you.' }
  ];
  const stage = confirmed ? 3 : assessed ? 2 : 1;
  return { ok: true, ref: ref, name: String(row.StudentName || '').trim().split(' ')[0], programme: programme, plan: planShort, submitted: String(row.Submitted || '').slice(0, 10),
    stage: stage, state: attention ? 'attention' : confirmed ? 'done' : 'progress', steps: steps, schoolWa: typeof EN_SCHOOL_WA !== 'undefined' ? EN_SCHOOL_WA : '' };
}
function admissionsFromRequest(p) {
  try {
    if (String(p.action || '') === 'adm_status') return adm_status_(p);
    return { ok: false, error: 'Unknown action.' };
  } catch (err) { console.error(err); return { ok: false, error: 'Something went wrong. Please try again.' }; }
}

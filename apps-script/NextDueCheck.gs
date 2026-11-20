/**
 * Next-due check. Add as a NEW file next to Code.gs. Every name starts with "ndc".
 *
 * Run ndcRun once from the Apps Script editor (select ndcRun, press Run). It reads the Students, AcademyStudents and
 * SkillsStudents tabs and writes a new tab called "NextDueCheck" listing every active student whose NextDue is empty,
 * with the most likely reason, so you can see at a glance which blanks are normal and which need fixing.
 * It only READS the student tabs. It changes nothing except the NextDueCheck tab it makes.
 */
const NDC_TAB = 'NextDueCheck';

function ndcRun() {
  const out = [['Tab', 'StudentID', 'Name', 'Plan / course', 'Period', 'Payment status', 'Confirmed payments not yet applied', 'Likely reason', 'What to do']];
  let normal = 0, fix = 0;
  [
    { tab: 'Students', pay: 'Payments' },
    { tab: 'AcademyStudents', pay: 'AcademyPayments' },
    { tab: 'SkillsStudents', pay: 'SkillsPayments' }
  ].forEach(function (cfg) {
    let t, p = null;
    try { t = table_(cfg.tab); } catch (e) { return; }
    try { p = table_(cfg.pay); } catch (e) { p = null; }
    t.rows.forEach(function (s) {
      if (String(s.Active || '').trim().toUpperCase() === 'FALSE') return;
      if (iso_(s.NextDue)) return;
      const id = key_(s.StudentID); if (!id) return;
      const status = String(s.PaymentStatus || '').trim(), period = String(s.Period || '');
      let pending = 0, paidRows = 0;
      if (p) p.rows.forEach(function (r) {
        if (key_(r.StudentID) !== id) return;
        const confirmed = cfg.pay === 'Payments' ? String(r.Status || '').trim().toLowerCase() === 'confirmed' : true;
        if (!confirmed) return;
        paidRows++;
        if (cfg.pay === 'Payments' && !r.Applied) pending++;
      });
      let why, todo, isNormal = false;
      if (status.toLowerCase() === 'exempt') { why = 'Exempt from fees'; todo = 'Nothing. This is expected.'; isNormal = true; }
      else if (cfg.tab === 'SkillsStudents' && String(s.Currency || '').toUpperCase() === 'USD' && Number(s.InstPaid) > 0) {
        why = 'Dollar track with every instalment received, or paid in full'; todo = 'Nothing, if InstPaid equals the number of payments in Schedule.'; isNormal = true;
      }
      else if (/one-time|paid in full/i.test(period)) { why = 'One-time fee: there is no next due date'; todo = 'Nothing. This is expected.'; isNormal = true; }
      else if (pending > 0) { why = pending + ' confirmed payment(s) were never applied, so the date was never set'; todo = 'Run applyPayments_ (or wait for the daily job). Check the Errors tab for a failure.'; }
      else if (paidRows === 0) { why = 'No payment recorded yet for this student'; todo = 'Confirm the payment, or type the date into NextDue by hand if they paid before the website.'; }
      else { why = 'Payments exist but the date is empty'; todo = 'Type the correct NextDue by hand (yyyy-mm-dd), then check the Errors and CardLog tabs.'; }
      if (isNormal) normal++; else fix++;
      out.push([cfg.tab, id, String(s.Name || ''), String(s.Plan || s.Course || s.Track || ''), period, status, pending, why, todo]);
    });
  });
  const ss = ss_();
  let sh = ss.getSheetByName(NDC_TAB); if (sh) sh.clear(); else sh = ss.insertSheet(NDC_TAB);
  sh.getRange(1, 1, out.length, out[0].length).setNumberFormat('@').setValues(out);
  sh.getRange(1, 1, 1, out[0].length).setFontWeight('bold'); sh.setFrozenRows(1); sh.autoResizeColumns(1, out[0].length);
  const msg = (out.length - 1) + ' students with an empty NextDue: ' + normal + ' expected, ' + fix + ' need a look. See the "' + NDC_TAB + '" tab.';
  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* run from a trigger: no screen */ }
  return msg;
}

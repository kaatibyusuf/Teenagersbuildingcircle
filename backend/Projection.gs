/**
 * Projection (Projection.gs), shown in the owner portal under "Projection".
 *
 * One page that answers "are we in profit, how far from the target, and what should I work on next?". It is
 * worked out fresh every time the owner portal loads, from the same sheets the rest of the portal uses:
 *   Income      the monthly fee on record for every active, non-exempt student (Students, AcademyStudents, SkillsStudents)
 *   Staff pay   this month's amounts from Salaries.gs (per-student pay, the minimum, and fixed admin salaries)
 *   Charges     an estimate for payment charges, as a percentage of income
 *   Other       any other monthly cost you enter (for example Vercel Pro)
 * From those it shows the profit now, the profit target, the number of new students needed to reach it, a six month
 * forecast at your planned number of new students a month, "what if we add students", flat-salary comparisons, and a
 * ranked "What to work on" list built from the live numbers (overdue fees, enrolments waiting, waitlist, idle teachers...).
 *
 * The owner edits four targets and a plan note on the page. They are saved in a "Projection" tab (Key, Value, Updated,
 * UpdatedBy), created on first save. Nothing here changes any student's or teacher's record.
 *
 * SETUP: add this file, add the `ow_projsave` route and the `out.projection` line to Owner.gs (the supplied Owner.gs already has them),
 * then Deploy → Manage deployments → New version.
 */

const PJ_TAB = 'Projection';
const PJ_HEAD = ['Key', 'Value', 'Updated', 'UpdatedBy'];
const PJ_DEFAULTS = { ProfitTarget: 100000, OtherCosts: 0, ChargePct: 3, NewPerMonth: 5, Notes: '' };
const PJ_MONTHS = 6;                 // months in the forecast
const PJ_ADD = [5, 10, 20, 30];      // "if we add this many students"
const PJ_FLAT = [30000, 35000, 40000]; // flat monthly salaries to compare with per-student pay
const PJ_STAFF_SHARE = 0.6;          // staff pay above this share of income is flagged

function pj_settings_() {
  const o = {}; Object.keys(PJ_DEFAULTS).forEach(function (k) { o[k] = PJ_DEFAULTS[k]; });
  try {
    table_(PJ_TAB).rows.forEach(function (r) {
      const k = String(r.Key || '').trim();
      if (!Object.prototype.hasOwnProperty.call(PJ_DEFAULTS, k)) return;
      if (k === 'Notes') o[k] = String(r.Value == null ? '' : r.Value);
      else if (r.Value !== '' && r.Value != null && isFinite(Number(r.Value))) o[k] = Number(r.Value);
    });
  } catch (e) { /* no tab yet: defaults */ }
  return o;
}

function pj_tab_() {
  const ss = ss_();
  if (!ss.getSheetByName(PJ_TAB)) { const sh = ss.insertSheet(PJ_TAB); sh.getRange(1, 1, 1, PJ_HEAD.length).setValues([PJ_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return table_(PJ_TAB);
}

/* save the targets and the plan note */
function pj_save_(who, p) {
  const num = function (v, lo, hi, whole) { const n = Number(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) && String(v).trim() !== '' && n >= lo && n <= hi ? (whole ? Math.round(n) : n) : null; };
  const vals = {
    ProfitTarget: num(p.profitTarget, 0, 1e9, true), OtherCosts: num(p.otherCosts, 0, 1e9, true),
    ChargePct: num(p.chargePct, 0, 20, false), NewPerMonth: num(p.newPerMonth, 0, 500, true)
  };
  const bad = { ProfitTarget: 'the profit target', OtherCosts: 'other monthly costs', ChargePct: 'the payment charge percentage (0 to 20)', NewPerMonth: 'new students a month (0 to 500)' };
  for (const k in vals) if (vals[k] === null) return { ok: false, error: 'Check ' + bad[k] + '. Enter a number.' };
  vals.Notes = String(p.notes == null ? '' : p.notes).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').slice(0, 3000);
  const T = pj_tab_(), stamp = today_();
  Object.keys(vals).forEach(function (k) {
    const row = T.rows.filter(function (r) { return String(r.Key).trim() === k; })[0];
    if (row) { put_(T, row._row, 'Value', vals[k], k === 'Notes'); put_(T, row._row, 'Updated', stamp, true); put_(T, row._row, 'UpdatedBy', who, true); }
    else append_(T, { Key: k, Value: vals[k], Updated: stamp, UpdatedBy: who }, ['Key', 'Updated', 'UpdatedBy'].concat(k === 'Notes' ? ['Value'] : []));
  });
  return { ok: true, message: 'Targets and plan saved.' };
}

/* the monthly fee on record for every active student, by programme */
function pj_students_() {
  const tabs = [['Students', function (s) { return /tbc|teen/i.test(String(s.Plan || '') + ' ' + String(s.Level || '')) ? 'Teenagers Building Circle' : 'Madrasah'; }, 'MonthlyFee'],
    ['AcademyStudents', function () { return 'Academy'; }, 'MonthlyFee'], ['SkillsStudents', function () { return 'Skills School'; }, 'Fee']];
  const by = {}, tot = { students: 0, paying: 0, exempt: 0, noFee: 0, income: 0, dueSoonIncome: 0, dueSoon: 0 };
  tabs.forEach(function (tb) {
    let T; try { T = table_(tb[0]); } catch (e) { return; }
    T.rows.forEach(function (s) {
      if (!s.StudentID || key_(s.Active) === 'FALSE') return;
      const prog = tb[1](s), g = by[prog] = by[prog] || { Programme: prog, Students: 0, Paying: 0, Exempt: 0, NoFee: 0, Income: 0 };
      const st = payStatus_(s), fee = Number(s[tb[2]]) || 0;
      g.Students++; tot.students++;
      if (st === 'Exempt') { g.Exempt++; tot.exempt++; return; }
      if (!(fee > 0)) { g.NoFee++; tot.noFee++; return; }
      g.Paying++; tot.paying++; g.Income += fee; tot.income += fee;
      if (st === 'Due') { tot.dueSoon++; tot.dueSoonIncome += fee; }
    });
  });
  const list = Object.keys(by).map(function (k) { const g = by[k]; g.AvgFee = g.Paying ? Math.round(g.Income / g.Paying) : 0; return g; }).sort(function (a, b) { return b.Income - a.Income; });
  return { tot: tot, byProg: list };
}

function pj_payload_(base, sal) {
  const set = pj_settings_(), st = pj_students_(), pct = Math.min(0.5, Math.max(0, set.ChargePct / 100));
  const income = st.tot.income, paying = st.tot.paying;
  const staff = sal && sal.staff ? sal.staff : [];
  const staffPay = sal ? Number(sal.total) || 0 : 0;
  const fixedPay = staff.filter(function (o) { return o.Fixed; }).reduce(function (t, o) { return t + (Number(o.Amount) || 0); }, 0);
  const teachers = staff.filter(function (o) { return !o.Fixed && o.Count > 0; });
  const idle = sal && sal.idle ? sal.idle.length : 0;
  const links = teachers.reduce(function (t, o) { return t + o.Count; }, 0);
  const avgRate = links ? Math.round(teachers.reduce(function (t, o) { return t + o.Rate * o.Count; }, 0) / links) : (typeof SAL_RATE === 'number' ? SAL_RATE : 5000);
  const avgFee = paying ? income / paying : 0;
  const charges = Math.round(income * pct), costs = staffPay + set.OtherCosts + charges, profit = income - costs;
  const margin = Math.round(avgFee * (1 - pct) - avgRate);                 // what one more paying student adds each month
  const short = set.ProfitTarget - profit;
  const need = short > 0 ? (margin > 0 ? Math.ceil(short / margin) : null) : 0;
  const breakEvenIncome = Math.ceil((staffPay + set.OtherCosts) / (1 - pct));

  const month0 = today_().slice(0, 7) + '-01', forecast = [];
  for (let k = 0; k < PJ_MONTHS; k++) {
    const n = paying + set.NewPerMonth * k, inc = Math.round(n * avgFee), pay = staffPay + set.NewPerMonth * k * avgRate, ch = Math.round(inc * pct), pr = inc - pay - ch - set.OtherCosts;
    forecast.push({ Month: addMonths_(month0, k).slice(0, 7), Students: n, Income: inc, Costs: pay + ch + set.OtherCosts, Profit: pr, OnTarget: pr >= set.ProfitTarget });
  }
  const firstHit = forecast.filter(function (f) { return f.OnTarget; })[0];
  const scenarios = PJ_ADD.map(function (n) { return { Add: n, Students: paying + n, Income: Math.round(income + n * avgFee), Profit: Math.round(profit + n * margin) }; });

  const nTeach = teachers.length + idle;
  const models = [{ Label: 'Your pay now (per student, with minimum)', Pay: staffPay - fixedPay, Profit: profit }].concat(PJ_FLAT.map(function (f) {
    const pay = nTeach * f; return { Label: 'Flat ' + naira_(f) + ' for all ' + nTeach + ' teachers', Pay: pay, Profit: Math.round(income - pay - fixedPay - set.OtherCosts - charges) };
  }));

  const floorStaff = staff.filter(function (o) { return o.Floor; });
  const floorExtra = floorStaff.reduce(function (t, o) { return t + Math.max(0, o.Amount - o.Count * o.Rate); }, 0);
  const top = st.byProg[0], share = income && top ? top.Income / income : 0;
  const k = base && base.kpi ? base.kpi : {}, enr = base && base.enrol ? base.enrol.pending : [], wl = base && base.waitlist ? base.waitlist.total : 0, enq = base && base.enquiries ? base.enquiries.open : 0;
  const money = function (n) { return naira_(Math.round(n)); };
  const plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };

  const work = [];
  const add = function (level, title, detail, impact, tab) { work.push({ Level: level, Title: title, Detail: detail, Impact: Math.round(impact || 0), Tab: tab || '' }); };
  if (short > 0) add('high', 'Reach your profit target of ' + money(set.ProfitTarget), 'You are ' + money(short) + ' short each month. At about ' + money(Math.max(0, margin)) + ' profit per new paying student, that is ' + (need === null ? 'not reachable by adding students alone, because a student brings in less than their teacher costs' : plural(need, 'more paying student') + (set.NewPerMonth ? ', roughly ' + Math.ceil(need / set.NewPerMonth) + ' month' + (Math.ceil(need / set.NewPerMonth) === 1 ? '' : 's') + ' at your plan of ' + set.NewPerMonth + ' a month' : '')) + '.', short, '');
  else add('low', 'You are above your profit target', 'Profit is ' + money(profit) + ', which is ' + money(-short) + ' above the ' + money(set.ProfitTarget) + ' target. Raise the target, build a reserve, or pay for growth.', 0, '');
  if (income && staffPay / income > PJ_STAFF_SHARE) add('high', 'Staff pay takes ' + Math.round(100 * staffPay / income) + '% of income', 'Keep it under about ' + Math.round(100 * PJ_STAFF_SHARE) + '%. Fill existing teachers\' classes before adding teachers, and keep pay tied to students.', staffPay - PJ_STAFF_SHARE * income, 'pay');
  if (k.overdue) add(k.overdueAmount > income * 0.1 ? 'high' : 'med', 'Collect overdue fees', plural(k.overdue, 'student') + ' are overdue, worth ' + money(k.overdueAmount) + '. Send the WhatsApp reminders from the Fees tab.', k.overdueAmount, 'fees');
  if (enr.length) add('high', 'Confirm enrolments that are waiting', plural(enr.length, 'enrolment') + ' have paid or sent a receipt. Check the bank and confirm them so they can start.', enr.reduce(function (t, e) { return t + (Number(e.Amount) || 0); }, 0), 'overview');
  if (enq) add('med', 'Follow up new enquiries', plural(enq, 'new enquiry') + ' not yet contacted. Each one who enrols is worth about ' + money(avgFee) + ' a month.', enq * avgFee * 0.2, 'overview');
  if (wl) add('med', 'Turn the waitlist into students', plural(wl, 'person') + (wl === 1 ? ' is' : ' are') + ' waiting. Opening places for them is worth about ' + money(wl * avgFee) + ' a month.', wl * avgFee, 'overview');
  if (st.tot.noFee) add('med', 'Set the fee on every student', plural(st.tot.noFee, 'active student') + ' ha' + (st.tot.noFee === 1 ? 's' : 've') + ' no monthly fee on record, so income here is understated.', st.tot.noFee * avgFee, '');
  if (st.tot.dueSoon) add('low', 'Remind students who renew soon', plural(st.tot.dueSoon, 'student') + ' renew within ' + DUE_SOON_DAYS + ' days, worth ' + money(st.tot.dueSoonIncome) + '. Early reminders keep them from going overdue.', st.tot.dueSoonIncome, 'fees');
  if (floorStaff.length) add('med', plural(floorStaff.length, 'teacher') + (floorStaff.length === 1 ? ' is' : ' are') + ' on the minimum pay', 'The minimum costs ' + money(floorExtra) + ' more than students times rate. Give them more students, or merge small classes.', floorExtra, 'pay');
  if (idle) add('low', plural(idle, 'teacher') + ' on the list ' + (idle === 1 ? 'has' : 'have') + ' no students', 'They cost nothing now. Give new students to them before taking on more teachers.', 0, 'pay');
  if (st.byProg.length > 1 && share >= 0.75) add('low', top.Programme + ' brings ' + Math.round(100 * share) + '% of income', 'One programme carrying this much is a risk. Grow the others, such as the Academy and Skills School.', 0, '');

  const rank = { high: 0, med: 1, low: 2 };
  work.sort(function (a, b) { return rank[a.Level] - rank[b.Level] || b.Impact - a.Impact; });

  const paidHist = {}; ((sal && sal.history) || []).forEach(function (h) { paidHist[h.Month] = h.Paid; });
  const history = ((base && base.months) || []).map(function (m) { return { Month: m.Month, Collected: m.Total, StaffPaid: paidHist[m.Month] || 0 }; });

  return {
    settings: set, income: Math.round(income), staffPay: staffPay, teacherPay: staffPay - fixedPay, adminPay: fixedPay, charges: charges, otherCosts: set.OtherCosts, costs: costs, profit: Math.round(profit),
    target: set.ProfitTarget, short: Math.round(short), need: need, breakEvenIncome: breakEvenIncome, incomeNeeded: Math.ceil((staffPay + set.OtherCosts + set.ProfitTarget) / (1 - pct)),
    students: st.tot.students, paying: paying, exempt: st.tot.exempt, noFee: st.tot.noFee, avgFee: Math.round(avgFee), avgRate: avgRate, margin: margin,
    staffShare: income ? Math.round(100 * staffPay / income) : 0, profitMargin: income ? Math.round(100 * profit / income) : 0, perTeacher: teachers.length ? Math.round(links / teachers.length * 10) / 10 : 0, teachers: teachers.length, idleTeachers: idle,
    byProg: st.byProg, forecast: forecast, firstHit: firstHit ? firstHit.Month : '', scenarios: scenarios, models: models, work: work, history: history
  };
}

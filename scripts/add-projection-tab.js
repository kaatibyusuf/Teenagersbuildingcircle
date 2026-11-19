#!/usr/bin/env node
/* Adds the "Projection" tab to the owner portal (frontend/owner.html).
   Run from the project folder:  node scripts/add-projection-tab.js
   Safe to run twice. All or nothing: if a spot it needs is missing, the file is left untouched and the script names the spot.
   The side menu entry is added too when the portal layout (staff-portal-shell.js) is already applied. */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'frontend', 'owner.html');
let html = fs.readFileSync(file, 'utf8');
if (html.includes('function vProjection(')) { console.log('Already up to date.'); process.exit(0); }

const VIEW = String.raw`
/* ---------- Projection: profit now, the target, and what to work on ---------- */
function vProjection() {
  const P = D.projection, st = P && P.settings;
  if (!P) return '<article class="c w12">' + empty('Projection could not load. Add Projection.gs to Apps Script, then deploy a new version.') + '</article>';
  const ok = P.short <= 0, lv = { high: ['Do first', 'p-red'], med: ['Soon', 'p-sky'], low: ['Later', 'p-ink'] };
  const verdict = ok
    ? 'Profit is ' + naira(P.profit) + ' a month, ' + naira(-P.short) + ' above your ' + naira(P.target) + ' target.'
    : 'Profit is ' + naira(P.profit) + ' a month, ' + naira(P.short) + ' short of your ' + naira(P.target) + ' target. ' + (P.need === null ? 'A new student brings in less than their teacher costs, so adding students alone will not close it.' : 'That is about ' + plural(P.need, 'more paying student') + (P.firstHit ? ', reached by ' + mlabel(P.firstHit) + ' at your planned ' + st.NewPerMonth + ' a month.' : '.'));
  const row = (c) => '<tr>' + c.map((x, i) => '<td' + (i ? ' style="text-align:right"' : '') + '>' + x + '</td>').join('') + '</tr>';
  const head = (c) => '<thead><tr>' + c.map((x, i) => '<th' + (i ? ' style="text-align:right"' : '') + '>' + x + '</th>').join('') + '</tr></thead>';
  const prog = {}; P.byProg.forEach((g) => { prog[g.Programme] = g.Income; });
  const costs = { 'Teacher pay': P.teacherPay, 'Admin pay': P.adminPay, 'Payment charges (estimate)': P.charges, 'Other monthly costs': P.otherCosts };
  Object.keys(costs).forEach((k) => { if (!costs[k]) delete costs[k]; });
  const f = (n, l, v, min, max) => '<div><label class="fl">' + l + '</label><input class="in" name="' + n + '" type="number" inputmode="decimal" min="' + min + '" max="' + max + '" step="any" value="' + v + '" required></div>';
  return '<div class="grid">' +
    '<article class="c w12"><h2>Where you stand</h2><div class="tiles acx-tiles6">' +
      tile(naira(P.income), 'income each month', false, plural(P.paying, 'paying student') + ' · average ' + naira(P.avgFee)) +
      tile(naira(P.costs), 'costs each month', false, 'staff pay is ' + P.staffShare + '% of income') +
      tile(naira(P.profit), 'profit each month', P.profit < 0, P.profitMargin + '% of income') +
      tile(naira(P.target), 'profit target') +
      tile(ok ? naira(-P.short) : naira(P.short), ok ? 'above target' : 'short of target', !ok) +
      tile(naira(P.breakEvenIncome), 'income to break even', false, 'for ' + naira(P.incomeNeeded) + ' to hit target') +
    '</div><p class="sub" style="margin-top:12px"><b>' + verdict + '</b> Each new paying student adds about ' + naira(P.margin) + ' a month after teacher pay (' + naira(P.avgRate) + ') and charges.</p>' +
    '</article>' +
    '<article class="c w12"><h2>What to work on</h2><p class="sub">Ranked from the live numbers, biggest money first. It updates every time you open or refresh this page.</p>' +
      (P.work.length ? '<ul class="ow-list">' + P.work.map((w) => '<li><span><span class="pill ' + lv[w.Level][1] + '">' + lv[w.Level][0] + '</span> <b>' + esc(w.Title) + '</b>' + (w.Impact ? ' <span class="sub">· about ' + naira(w.Impact) + ' a month</span>' : '') + '<br><span class="sub">' + esc(w.Detail) + '</span></span>' +
        (w.Tab ? '<button class="btn btn-line btn-sm" type="button" data-act="tab" data-t="' + w.Tab + '">Open</button>' : '') + '</li>').join('') + '</ul>' : empty('Nothing to flag.')) + '</article>' +
    '<article class="c w6"><h2>Income by programme</h2><p class="sub">Monthly fees on record for active students.</p>' + hbars(prog, true) + '</article>' +
    '<article class="c w6"><h2>Costs each month</h2><p class="sub">Staff pay is this month’s figure from the Staff pay tab.</p>' + hbars(costs, true) + '</article>' +
    '<article class="c w12"><h2>Next ' + P.forecast.length + ' months</h2><p class="sub">If you add ' + st.NewPerMonth + ' paying students a month at the average fee, paying teachers ' + naira(P.avgRate) + ' each for them. Green means the target is met.</p>' +
      '<div class="acx-scroll"><table>' + head(['Month', 'Paying students', 'Income', 'Costs', 'Profit']) + '<tbody>' + P.forecast.map((m) => row([mlabel(m.Month), m.Students, naira(m.Income), naira(m.Costs), '<b style="color:' + (m.OnTarget ? '#1B7F4C' : m.Profit < 0 ? '#B3261E' : 'inherit') + '">' + naira(m.Profit) + '</b>'])).join('') + '</tbody></table></div></article>' +
    '<article class="c w12"><h2>If you add students</h2><div class="acx-scroll"><table>' + head(['Add', 'Students', 'Income', 'Profit']) + '<tbody>' + P.scenarios.map((s) => row(['+' + s.Add, s.Students, naira(s.Income), '<b>' + naira(s.Profit) + '</b>'])).join('') + '</tbody></table></div></article>' +
    '<article class="c w12"><h2>Pay model compared</h2><div class="acx-scroll"><table>' + head(['Model', 'Teacher pay', 'Profit']) + '<tbody>' + P.models.map((m) => row([esc(m.Label), naira(m.Pay), '<b style="color:' + (m.Profit < 0 ? '#B3261E' : 'inherit') + '">' + naira(m.Profit) + '</b>'])).join('') + '</tbody></table></div>' +
      '<p class="sub">' + plural(P.teachers, 'teacher') + ' have students (' + P.perTeacher + ' each on average)' + (P.idleTeachers ? ' and ' + P.idleTeachers + ' have none' : '') + '.</p></article>' +
    '<article class="c w12"><h2>Last months</h2><div class="acx-scroll"><table>' + head(['Month', 'Fees collected', 'Staff pay', 'Left']) + '<tbody>' + P.history.map((h) => row([mlabel(h.Month), naira(h.Collected), naira(h.StaffPaid), naira(h.Collected - h.StaffPaid)])).join('') + '</tbody></table></div><p class="sub">Staff pay here is what you marked as paid. Fees collected are confirmed payments.</p></article>' +
    '<article class="c w12"><h2>Your targets and plan</h2><form class="frm" data-form="projsave"><div class="row3">' +
      f('profitTarget', 'Profit you want each month (₦)', st.ProfitTarget, 0, 1000000000) + f('otherCosts', 'Other monthly costs (₦)', st.OtherCosts, 0, 1000000000) + f('newPerMonth', 'New paying students a month', st.NewPerMonth, 0, 500) + '</div>' +
      '<div class="row3">' + f('chargePct', 'Payment charges (% of income)', st.ChargePct, 0, 20) + '</div>' +
      '<div><label class="fl" for="pjn">Plan and notes</label><textarea class="in" id="pjn" name="notes" rows="6" maxlength="3000" placeholder="What you will do this month, who owns it, what you decided.">' + esc(st.Notes) + '</textarea></div>' +
      '<button class="btn btn-ink" type="submit">Save</button></form>' +
      '<p class="sub">Other monthly costs are anything besides staff pay and payment charges, such as Vercel Pro or tools. These settings are saved in the Projection tab of the sheet.</p></article>' +
  '</div>';
}
`;

const edits = [
  { name: 'tab list', from: "['pay', 'Staff pay'],", to: "['pay', 'Staff pay'], ['projection', 'Projection']," },
  { name: 'view list', from: ' pay: vPay,', to: ' pay: vPay, projection: vProjection,' },
  { name: 'view insert point', from: 'const VIEWS = {', to: VIEW.trimEnd() + '\nconst VIEWS = {' },
  { name: 'save handler', from: "  } else if (k === 'payout') {", to: "  } else if (k === 'projsave') {\n    act('ow_projsave', { profitTarget: v('profitTarget'), otherCosts: v('otherCosts'), newPerMonth: v('newPerMonth'), chargePct: v('chargePct'), notes: v('notes') }, btn);\n  } else if (k === 'payout') {" }
];
const missing = edits.filter((e) => html.split(e.from).length !== 2);
if (missing.length) { console.error('Nothing changed. Could not find exactly one ' + missing.map((e) => e.name).join(' and ') + ' in frontend/owner.html (the page may differ from the one this script expects).'); process.exit(1); }
edits.forEach((e) => { html = html.replace(e.from, () => e.to); });
const nav = "{ label: 'Staff pay', icon: 'pen', tab: 'pay' },";
let navNote = ' The side menu entry was not added because owner.html does not have the new portal layout yet. staff-portal-shell.js already includes it, so run that script and the menu will show Projection.';
if (html.includes(nav)) { html = html.replace(nav, () => nav + "\n    { label: 'Projection', icon: 'chart', tab: 'projection' },"); navNote = ' Added to the side menu too.'; }
fs.writeFileSync(file, html);
console.log('Added the Projection tab to frontend/owner.html.' + navNote);

/**
 * Staff pay (Salaries.gs), shown in the owner portal under "Pay".
 *
 * Every teacher, tutor and facilitator who has students is paid SAL_RATE (5,000) for each active student assigned
 * to them. Anyone whose Role is Admin is paid a fixed SAL_ADMIN (30,000) a month instead, whatever their number of
 * students (their students are still listed). It reads:
 *   Teachers + Students (Teacher column)   Madrasah and Teenagers Building Circle, including admins listed in Teachers
 *   AcademyTutors + AcademyStudents (TutorID)
 *   SkillsTutors + SkillsStudents (TutorID)
 *   AcademyAdmins and SkillsAdmins (fixed monthly salary, no students needed)
 * A student with two teachers counts for both. To pay one person a different rate (or an admin a different salary), put a number in their "Rate" column.
 * Bank details live in BankName / AccountNumber / AccountName columns on those staff tabs (the owner can edit them
 * in the portal). The portal only RECORDS payments: send the transfer from your bank app, then Mark paid. Each
 * payment is saved to the "Salaries" tab with the roster as it was that day.
 *
 * PAYSLIPS: when you Mark paid, the person is emailed a payslip (their students, the rate, the amount, your transfer
 * reference) if their Email column is filled in. The Staff pay tab also has a "Send payslip again" button.
 *
 * SETUP: add this file, then Deploy → Manage deployments → New version. The tab and columns are created on first use.
 */

const SAL_RATE = 5000;
const SAL_ADMIN = 30000; // monthly salary of an admin
const SAL_EMAIL = true;  // email a payslip to the staff member when a payment is marked paid
const SAL_TAB = 'Salaries';
const SAL_HEAD = ['Month', 'StaffKey', 'Name', 'Programme', 'Students', 'Rate', 'Amount', 'Status', 'PaidDate', 'Reference', 'PaidBy', 'Roster'];
const SAL_STAFF_COLS = ['BankName', 'AccountNumber', 'AccountName', 'Rate'];
const SAL_SOURCES = [
  { tab: 'Teachers', idf: 'TeacherID', code: 'M', students: 'Students', link: 'Teacher', multi: true },
  { tab: 'AcademyTutors', idf: 'TutorID', code: 'A', students: 'AcademyStudents', link: 'TutorID', multi: false },
  { tab: 'SkillsTutors', idf: 'TutorID', code: 'S', students: 'SkillsStudents', link: 'TutorID', multi: false },
  { tab: 'AcademyAdmins', idf: 'AdminID', code: 'AA', students: null, fixed: true },
  { tab: 'SkillsAdmins', idf: 'AdminID', code: 'SA', students: null, fixed: true }
];

function sal_ensure_(name, cols) {
  const ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) return false;
  const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  cols.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h).setFontWeight('bold'); } });
  return true;
}
function sal_tab_() {
  const ss = ss_();
  if (!ss.getSheetByName(SAL_TAB)) { const sh = ss.insertSheet(SAL_TAB); sh.getRange(1, 1, 1, SAL_HEAD.length).setValues([SAL_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return table_(SAL_TAB);
}
function sal_month_(m) { m = String(m || '').trim(); return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today_().slice(0, 7); }
function sal_progOf_(s) { return /tbc|teen/i.test(String(s.Plan || '') + ' ' + String(s.Level || '')) ? 'Teenagers Building Circle' : 'Madrasah'; }

/* everyone who can be paid, with the students assigned to them right now */
function sal_staff_() {
  const out = [];
  SAL_SOURCES.forEach(function (src) {
    let T; try { T = table_(src.tab); } catch (e) { return; }
    let S = { rows: [] }; try { if (src.students) S = table_(src.students); } catch (e) {}
    const active = S.rows.filter(function (s) { return s.StudentID && key_(s.Active) !== 'FALSE'; });
    T.rows.forEach(function (t) {
      const id = String(t[src.idf] || '').trim(); if (!id || key_(t.Active) === 'FALSE') return;
      const name = String(t.Name || ''), ids = [key_(id), key_(name)];
      const mine = active.filter(function (s) {
        const cell = String(s[src.link] == null ? '' : s[src.link]);
        return (src.multi ? cell.split(/[,;]+/) : [cell]).some(function (x) { return ids.indexOf(key_(x)) >= 0 && key_(x); });
      }).map(function (s) {
        let cls, prog;
        if (src.code === 'M') { prog = sal_progOf_(s); cls = String(s.Level || '') || String(s.Plan || ''); }
        else if (src.code === 'A') { prog = 'Academy'; cls = [s.Track, s.Group].filter(Boolean).join(' · '); }
        else { prog = 'Skills School'; cls = [s.Course, s.Cohort].filter(Boolean).join(' · '); }
        return { ID: String(s.StudentID).trim(), Name: String(s.Name || ''), Class: cls, Programme: prog };
      });
      const progs = {}; mine.forEach(function (s) { progs[s.Programme] = 1; });
      const prog = src.code === 'M' ? (Object.keys(progs).join(' + ') || 'Madrasah') : (/^S/.test(src.code) ? 'Skills School' : 'Academy');
      const admin = !!src.fixed || /admin/i.test(String(t.Role || '')), rate = Number(t.Rate) > 0 ? Number(t.Rate) : (admin ? SAL_ADMIN : SAL_RATE);
      out.push({ Key: src.code + ':' + id, ID: id, Name: name, Role: String(t.Role || (src.fixed ? 'Admin' : src.code === 'M' ? 'Teacher' : 'Tutor')), Programme: prog, Rate: rate, Fixed: admin, Students: mine,
        Email: String(t.Email || ''), WhatsApp: String(t.WhatsApp || ''), Bank: String(t.BankName || ''), AccountNumber: String(t.AccountNumber || ''), AccountName: String(t.AccountName || ''), _src: src });
    });
  });
  return out;
}

function sal_payload_(p) {
  const month = sal_month_(p && p.month), now = today_().slice(0, 7);
  const months = []; for (let i = 0; i < 6; i++) months.push(addMonths_(now + '-01', -i).slice(0, 7));
  if (months.indexOf(month) < 0) months.push(month);
  const paid = {}; let P = { rows: [] };
  try { P = sal_tab_(); } catch (e) {}
  P.rows.forEach(function (r) { if (String(r.Month) === month && String(r.Status) === 'Paid') paid[String(r.StaffKey)] = r; });
  let total = 0, paidTotal = 0, studentLinks = 0;
  const staff = sal_staff_().map(function (s) {
    const pr = paid[s.Key], live = s.Fixed ? s.Rate : s.Students.length * s.Rate;
    const o = { Key: s.Key, ID: s.ID, Name: s.Name, Role: s.Role, Programme: s.Programme, Email: s.Email, WhatsApp: s.WhatsApp, Bank: s.Bank, AccountNumber: s.AccountNumber, AccountName: s.AccountName,
      Fixed: s.Fixed, Rate: pr ? Number(pr.Rate) || s.Rate : s.Rate, Students: s.Students, Count: s.Students.length, Amount: live, Status: 'Due', PaidDate: '', Reference: '', RateSet: s.Rate };
    if (pr) {
      o.Status = 'Paid'; o.Amount = Number(pr.Amount) || 0; o.Count = Number(pr.Students) || 0; o.PaidDate = iso_(pr.PaidDate); o.Reference = String(pr.Reference || '');
      o.Students = String(pr.Roster || '').split('\n').filter(Boolean).map(function (line) { const q = line.split('|'); return { ID: q[0] || '', Name: q[1] || '', Class: q[2] || '' }; });
      o.Changed = live !== o.Amount;
    }
    total += o.Amount; if (pr) paidTotal += o.Amount; studentLinks += o.Count;
    return o;
  }).filter(function (o) { return o.Count > 0 || o.Fixed || o.Status === 'Paid'; });
  staff.sort(function (a, b) { return (a.Status === 'Paid') - (b.Status === 'Paid') || b.Amount - a.Amount || (a.Name < b.Name ? -1 : 1); });
  // everyone listed in the staff tabs without students, so the owner can still add bank details
  const idle = sal_staff_().filter(function (s) { return !s.Students.length && !s.Fixed && !paid[s.Key]; }).map(function (s) { return { Key: s.Key, Name: s.Name, Role: s.Role, Programme: s.Programme }; });
  const paidBy = {}; P.rows.forEach(function (r) { if (String(r.Status) === 'Paid') paidBy[String(r.Month)] = (paidBy[String(r.Month)] || 0) + (Number(r.Amount) || 0); });
  const history = []; for (let i = 5; i >= 0; i--) { const m = addMonths_(now + '-01', -i).slice(0, 7); history.push({ Month: m, Paid: paidBy[m] || 0 }); }
  return { month: month, months: months, history: history, rate: SAL_RATE, adminRate: SAL_ADMIN, total: total, paidTotal: paidTotal, dueTotal: total - paidTotal, staffCount: staff.length, studentLinks: studentLinks,
    paidCount: staff.filter(function (o) { return o.Status === 'Paid'; }).length, staff: staff, idle: idle, live: month === now };
}

function sal_pay_(who, p) {
  const month = sal_month_(p.month), key = String(p.key || '');
  const s = sal_staff_().filter(function (x) { return x.Key === key; })[0];
  if (!s) return { ok: false, error: 'Staff member not found.' };
  const T = sal_tab_();
  if (T.rows.some(function (r) { return String(r.Month) === month && String(r.StaffKey) === key && String(r.Status) === 'Paid'; })) return { ok: true, message: 'Already marked as paid.' };
  const amount = s.Fixed ? s.Rate : s.Students.length * s.Rate;
  if (!(amount > 0)) return { ok: false, error: 'No students assigned, so nothing to pay.' };
  const ref = String(p.reference || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
  const roster = s.Students.map(function (x) { return [x.ID, x.Name, x.Class].join('|').replace(/\n/g, ' '); }).join('\n');
  append_(T, { Month: month, StaffKey: key, Name: s.Name, Programme: s.Programme, Students: s.Students.length, Rate: s.Rate, Amount: amount, Status: 'Paid', PaidDate: today_(), Reference: ref, PaidBy: who, Roster: roster },
    ['Month', 'StaffKey', 'Reference', 'PaidDate', 'Roster']);
  const why = sal_slip_(s, month, amount, s.Students.length, s.Rate, !!s.Fixed, s.Students, ref, today_());
  return { ok: true, message: naira_(amount) + ' to ' + s.Name + ' for ' + month + ' marked as paid. ' + (why || 'Payslip emailed to ' + s.Email + '.') };
}
function sal_undo_(p) {
  const month = sal_month_(p.month), key = String(p.key || ''), T = sal_tab_();
  const r = T.rows.filter(function (x) { return String(x.Month) === month && String(x.StaffKey) === key && String(x.Status) === 'Paid'; })[0];
  if (!r) return { ok: false, error: 'No paid record found.' };
  put_(T, r._row, 'Status', 'Cancelled');
  return { ok: true, message: 'Payment record cancelled.' };
}
function sal_bank_(p) {
  const key = String(p.key || ''), s = sal_staff_().filter(function (x) { return x.Key === key; })[0];
  if (!s) return { ok: false, error: 'Staff member not found.' };
  const clean = function (v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); };
  const acct = clean(p.accountNumber, 20).replace(/\s+/g, ''), rate = p.rate === '' || p.rate == null ? '' : Number(p.rate);
  if (acct && !/^\d{10}$/.test(acct)) return { ok: false, error: 'An account number has 10 digits.' };
  if (rate !== '' && !(rate > 0 && rate < 1e7)) return { ok: false, error: 'Enter a rate in naira, or leave it empty for the standard rate.' };
  sal_ensure_(s._src.tab, SAL_STAFF_COLS);
  const T = table_(s._src.tab), row = T.rows.filter(function (r) { return String(r[s._src.idf]).trim() === s.ID; })[0];
  if (!row) return { ok: false, error: 'Staff member not found.' };
  put_(T, row._row, 'BankName', clean(p.bank, 60), true); put_(T, row._row, 'AccountNumber', acct, true); put_(T, row._row, 'AccountName', clean(p.accountName, 80), true);
  put_(T, row._row, 'Rate', rate === '' || rate === SAL_RATE ? '' : rate);
  return { ok: true, message: 'Details saved for ' + s.Name + '.' };
}

function sal_esc_(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function sal_monthName_(m) {
  const N = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], q = String(m).split('-');
  return (N[Number(q[1]) - 1] || m) + ' ' + q[0];
}
/* the payslip email; returns '' when sent, or the reason it was not */
function sal_slip_(s, month, amount, count, rate, fixed, roster, ref, paidDate) {
  if (!SAL_EMAIL) return 'Payslip emails are switched off.';
  if (!validEmail_(s.Email)) return 'No valid Email for ' + s.Name + ', so no payslip was sent.';
  if (MailApp.getRemainingDailyQuota() < 1) return 'Email limit reached, so no payslip was sent.';
  const first = String(s.Name || '').replace(/^(ustadh|ustadhah|ustaz|ustazah|mr|mrs|ms|malam|sheikh)\.?\s+/i, '').split(/\s+/)[0] || s.Name;
  const what = fixed ? 'Monthly salary' : count + ' student' + (count === 1 ? '' : 's') + ' × ' + naira_(rate);
  const acct = String(s.AccountNumber || ''), bank = acct ? (s.Bank ? s.Bank + ' ' : '') + '(account ending ' + acct.slice(-4) + ')' : '';
  const lines = roster.map(function (x) { return '  • ' + x.Name + (x.Class ? ' (' + x.Class + ')' : ''); }).join('\n');
  const text = 'Assalaamu alaykum ' + first + ',\n\nYour payment for ' + sal_monthName_(month) + ' has been sent.\n\n' +
    'Amount: ' + naira_(amount) + '\nBasis: ' + what + '\nPaid on: ' + paidDate + (ref ? '\nTransfer reference: ' + ref : '') + (bank ? '\nTo: ' + bank : '') +
    (roster.length ? '\n\nStudents this month:\n' + lines : '') + '\n\nJazakAllahu khayran for your work with our students.\n\n' + SCHOOL_NAME;
  const rowsHtml = roster.map(function (x) { return '<tr><td style="padding:6px 0;border-bottom:1px solid #E5EBF0">' + sal_esc_(x.Name) + '</td><td style="padding:6px 0;border-bottom:1px solid #E5EBF0;color:#4B6577;text-align:right">' + sal_esc_(x.Class || '') + '</td></tr>'; }).join('');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#062F4D">' +
    '<div style="background:#094570;color:#fff;padding:18px 22px;border-radius:14px 14px 0 0"><b style="font-size:17px">' + sal_esc_(SCHOOL_NAME) + '</b><div style="opacity:.8;font-size:13px">Payslip · ' + sal_esc_(sal_monthName_(month)) + '</div></div>' +
    '<div style="border:1px solid #D5E0E8;border-top:0;border-radius:0 0 14px 14px;padding:22px">' +
    '<p style="margin:0 0 14px">Assalaamu alaykum ' + sal_esc_(first) + ',<br>your payment for ' + sal_esc_(sal_monthName_(month)) + ' has been sent.</p>' +
    '<p style="font-size:30px;font-weight:700;margin:6px 0 2px">' + sal_esc_(naira_(amount)) + '</p>' +
    '<p style="margin:0 0 14px;color:#4B6577;font-size:14px">' + sal_esc_(what) + '</p>' +
    '<p style="margin:0 0 14px;font-size:14px">Paid on ' + sal_esc_(paidDate) + (ref ? '<br>Reference: <b>' + sal_esc_(ref) + '</b>' : '') + (bank ? '<br>To: ' + sal_esc_(bank) : '') + '</p>' +
    (roster.length ? '<p style="margin:16px 0 6px;font-weight:700">Students this month</p><table style="width:100%;border-collapse:collapse;font-size:14px">' + rowsHtml + '</table>' : '') +
    '<p style="margin:18px 0 0;font-size:13px;color:#4B6577">JazakAllahu khayran for your work with our students.</p></div></div>';
  try {
    MailApp.sendEmail({ to: String(s.Email).trim(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': payslip for ' + sal_monthName_(month) + ' (' + naira_(amount) + ')', body: text, htmlBody: html });
    return '';
  } catch (e) { return 'Payslip email failed: ' + e.message; }
}
function sal_resend_(p) {
  const month = sal_month_(p.month), key = String(p.key || ''), T = sal_tab_();
  const r = T.rows.filter(function (x) { return String(x.Month) === month && String(x.StaffKey) === key && String(x.Status) === 'Paid'; })[0];
  const s = sal_staff_().filter(function (x) { return x.Key === key; })[0];
  if (!r || !s) return { ok: false, error: 'No paid record found.' };
  const roster = String(r.Roster || '').split('\n').filter(Boolean).map(function (l) { const q = l.split('|'); return { ID: q[0], Name: q[1], Class: q[2] }; });
  const why = sal_slip_(s, month, Number(r.Amount) || 0, Number(r.Students) || 0, Number(r.Rate) || s.Rate, !!s.Fixed, roster, String(r.Reference || ''), iso_(r.PaidDate));
  return why ? { ok: false, error: why } : { ok: true, message: 'Payslip sent to ' + s.Email + '.' };
}

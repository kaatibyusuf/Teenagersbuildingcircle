/**
 * Placement tests (placement.html)
 *
 * Two kinds of test, marked automatically:
 *   - Madrasah: one test per level from Awwal Ibtidā’iyyah to Awwal Iʿdādiyyah, in Arabic, covering
 *     Arabic, naḥw, ṣarf, tawḥīd (al-Uṣūl ath-Thalāthah), fiqh and ḥadīth (al-Arbaʿūn an-Nawawiyyah).
 *     Himaayah standard: from Thālithah Ibtidā’iyyah up, the whole Forty Ḥadīth and the whole of
 *     al-Uṣūl ath-Thalāthah; from Rābiʿah Ibtidā’iyyah up, the Lāmiyyah and the Dīwān of ash-Shāfiʿī too.
 *     Rawdah and Tamheedi are open entry, so they have no test. Each level keeps its own admission
 *     score as the pass mark: 75%, 80%, 85%, 90% and 90% (the `pass` value in PT_MADRASAH).
 *   - UTME: Use of English plus three subjects from the candidate's department (Science or Arts),
 *     timed like the real CBT (about 40 seconds a question). Cut-off 70% (PT_PASS). A candidate below
 *     the cut-off can still enrol in the Academy; the score tells the mentor where to start.
 *
 * How it works
 *   1. pt_start: the candidate gives their name, email and WhatsApp number and chooses a test.
 *      The script draws a fresh random set of questions from PlacementBank.gs, shuffles the options,
 *      saves the answer key in the "Placement tests" tab and sends the questions WITHOUT answers.
 *   2. pt_submit: the page sends the chosen options. The script marks them against the saved key,
 *      saves the score and breakdown, and emails the result to the candidate (and you).
 *   The answers never reach the browser, so the key cannot be read from the page.
 *
 * Rules (change the constants below):
 *   - UTME cut-off PT_PASS (70%); Madrasah pass marks per level in PT_MADRASAH,
 *   - one finished attempt per test per email every PT_RETAKE_HOURS (24 hours),
 *   - at most PT_MAX_STARTS starts per email per day (so nobody can farm questions),
 *   - a late submission (after the time limit plus PT_GRACE_SEC) is still marked but flagged "Late".
 *
 * SETUP: add this file and PlacementBank.gs, run Himaayah → Set up placement tests once,
 * then Deploy → Manage deployments → Edit → New version.
 */

const PT_TAB = 'Placement tests';
const PT_HEAD = ['Ref', 'Started', 'Finished', 'Programme', 'Test', 'Subjects', 'Name', 'Email', 'WhatsApp', 'Age', 'Score', 'Total', 'Percent', 'Result',
                 'Breakdown', 'TimeTaken', 'Flags', 'Token', 'Questions', 'Key', 'Answers', 'Notes', 'Code'];
const PT_PASS = 70;              // UTME cut-off, in percent (Madrasah levels use their own `pass` below)
const PT_RETAKE_HOURS = 24;      // wait this long after finishing before taking the same test again
const PT_MAX_STARTS = 3;         // starts per email per 24 hours, across all tests
const PT_GRACE_SEC = 90;
/* Paid access: nobody can start a test without a test code. The code is emailed when the registration fee is paid by card
   (api/placement-checkout → CardPayments.gs → placementCardPayment_ below), or added by staff in the "Test passes" tab. */
const PT_FEE = 3000;             // registration fee in naira; keep in step with EN_REG_FEE (Enrol.gs), api/checkout.mjs, api/placement-checkout.mjs and enroll.html
const PT_CODE_TAB = 'Test passes';
const PT_CODE_HEAD = ['Code', 'Name', 'Email', 'WhatsApp', 'Issued', 'Source', 'Amount', 'Reference', 'EventID', 'Active', 'EnrolRef'];
const PT_CODE_MAX_STARTS = 6;    // tests one code can start in total (it is tied to one email address, so it cannot be shared)         // allowance for slow connections when the time runs out

/* Madrasah levels. `draw` is how many questions each subject contributes to one attempt. */
const PT_MADRASAH = {
  m1: { title: 'Awwal Ibtidā’iyyah', ar: 'الأوّل الابتدائي', pass: 75, minutes: 40, draw: { lugha: 8, nahw: 9, sarf: 8, fiqh: 7, hadith: 8 } },
  m2: { title: 'Thāniyah Ibtidā’iyyah', ar: 'الثاني الابتدائي', pass: 80, minutes: 40, draw: { lugha: 7, nahw: 10, sarf: 9, fiqh: 6, hadith: 8 } },
  m3: { title: 'Thālithah Ibtidā’iyyah', ar: 'الثالث الابتدائي', pass: 85, minutes: 40, draw: { lugha: 4, nahw: 8, sarf: 7, tawheed: 7, fiqh: 6, hadith: 8 } },
  m4: { title: 'Rābiʿah Ibtidā’iyyah', ar: 'الرابع الابتدائي', pass: 90, minutes: 40, draw: { lugha: 3, nahw: 8, sarf: 7, tawheed: 6, fiqh: 5, hadith: 6, mutun: 5 } },
  m5: { title: 'Awwal Iʿdādiyyah', ar: 'الأوّل الإعدادي', pass: 90, minutes: 40, draw: { lugha: 3, nahw: 8, sarf: 7, tawheed: 6, fiqh: 5, hadith: 6, mutun: 5 } },
};
const PT_AR_SUBJECTS = { lugha: 'اللغة العربية', nahw: 'النحو', sarf: 'الصرف', tawheed: 'التوحيد', fiqh: 'الفقه', hadith: 'الحديث', mutun: 'المتون' };

/* UTME: English is compulsory; the candidate picks three subjects from their department. */
const PT_UTME = { minutes: 60, english: 25, perSubject: 20 };
const PT_DEPTS = { science: ['mth', 'phy', 'chm', 'bio'], arts: ['lit', 'gov', 'irs', 'yor'] };
const PT_UTME_SUBJECTS = { eng: 'Use of English', mth: 'Mathematics', phy: 'Physics', chm: 'Chemistry', bio: 'Biology',
                           lit: 'Literature in English', gov: 'Government', irs: 'Islamic Studies', yor: 'Yoruba' };
/* The pass mark for a test: each Madrasah level has its own; UTME uses PT_PASS */
function pt_passFor_(test) { const lv = PT_MADRASAH[String(test)]; return lv ? lv.pass : PT_PASS; }
const PT_PAGE = 'https://www.himaayahschools.com/placement.html';

function placementSetup() {
  pt_t_();
  pt_ct_();
  const msg = 'The "' + PT_TAB + '" and "' + PT_CODE_TAB + '" tabs are ready. Results appear there as candidates finish. Questions live in PlacementBank.gs (the first option of each question is the correct one).';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
function pt_t_() {
  const ss = ss_();
  let sh = ss.getSheetByName(PT_TAB);
  if (!sh) { sh = ss.insertSheet(PT_TAB); sh.getRange(1, 1, 1, PT_HEAD.length).setValues([PT_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  else {
    const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    PT_HEAD.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h).setFontWeight('bold'); } });
  }
  return table_(PT_TAB);
}
function pt_ct_() {
  const ss = ss_();
  let sh = ss.getSheetByName(PT_CODE_TAB);
  if (!sh) { sh = ss.insertSheet(PT_CODE_TAB); sh.getRange(1, 1, 1, PT_CODE_HEAD.length).setValues([PT_CODE_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return table_(PT_CODE_TAB);
}
function pt_rand_(n, chars) { let s = ''; for (let i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * chars.length)); return s; }
function pt_newCode_(T) {
  const have = {}; T.rows.forEach(function (r) { have[key_(r.Code)] = 1; });
  let c; do { c = 'HPT-' + pt_rand_(4, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') + '-' + pt_rand_(4, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); } while (have[c]);
  return c;
}
function pt_codeNorm_(v) { return String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20); }
function pt_findPass_(code) {
  if (!code) return null;
  const T = pt_ct_();
  const row = T.rows.filter(function (r) { return key_(r.Code) === code; })[0];
  if (!row || key_(row.Active) === 'FALSE' || key_(row.Active) === 'NO') return null;
  return row;
}
/* Called by Enrol.gs: true when the code is a real paid code that has not been used for another enrolment (the registration fee is then waived) */
function pt_passRedeem_(code, enrolRef, alreadyLocked) {
  code = pt_codeNorm_(code);
  const lock = alreadyLocked ? null : LockService.getScriptLock(); if (lock) lock.waitLock(20000);   // Enrol.gs already holds the script lock
  try {
    const T = pt_ct_(), row = pt_findPass_(code);
    if (!row) return false;
    const used = String(row.EnrolRef || '').trim();
    if (used && used !== enrolRef) return false;
    if (!used) put_(T, row._row, 'EnrolRef', enrolRef, true);
    return true;
  } finally { if (lock) lock.releaseLock(); }
}
/* Read-only check used by the enroll page and api/checkout: is this code real and still unused for an enrolment? (reveals nothing else) */
function pt_passCheck_(p) {
  const row = pt_findPass_(pt_codeNorm_(p.code));
  const used = row ? String(row.EnrolRef || '').trim() : '';
  const ref = pt_txt_(p.ref, 20).toUpperCase();                    // the enrolment itself may already hold the code (checkout runs after the form is saved)
  return { ok: true, valid: !!row && (!used || (!!ref && used === ref)) };
}
function pt_txt_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n); }
function pt_shuffle_(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pt_ms_(v) { const d = v instanceof Date ? v : new Date(String(v)); return isNaN(d) ? 0 : d.getTime(); }

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function placementFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (a === 'pt_start') return pt_start_(p);
    if (a === 'pt_submit') return pt_submit_(p);
    if (a === 'pt_pass_check') return pt_passCheck_(p);
    return { ok: false, error: 'Unknown action.' };
  } catch (err) { console.error(err); return { ok: false, error: 'Something went wrong. Please try again.' }; }
}

/* Draw `n` random questions for one subject from a bank */
function pt_pick_(bankKey, subject, n) {
  const bank = (PT_BANK[bankKey] || []).map(function (q, i) { return { id: bankKey + '.' + i, s: q[0], q: q[1], o: q[2] }; })
    .filter(function (q) { return q.s === subject; });
  return pt_shuffle_(bank).slice(0, n);
}

function pt_start_(p) {
  if (String(p.website || '').trim()) return { ok: false, error: 'Please try again.' };   // honeypot
  const d = { programme: pt_txt_(p.programme, 20).toLowerCase(), level: pt_txt_(p.level, 4), dept: pt_txt_(p.dept, 10).toLowerCase(),
    subjects: (Array.isArray(p.subjects) ? p.subjects : []).map(function (s) { return pt_txt_(s, 4); }),
    name: pt_txt_(p.name, 100), email: pt_txt_(p.email, 120).toLowerCase(), whatsapp: pt_txt_(p.whatsapp, 30), age: pt_txt_(p.age, 3).replace(/\D/g, '') };
  if (d.name.length < 3) return { ok: false, error: 'Enter the candidate’s full name.' };
  if (!validEmail_(d.email)) return { ok: false, error: 'Enter a valid email address. We send the result there.' };
  if (d.whatsapp.replace(/\D/g, '').length < 10) return { ok: false, error: 'Enter a WhatsApp number we can reach.' };

  // Paid access: a test code that belongs to this email address
  const code = pt_codeNorm_(p.code);
  if (!code) return { ok: false, error: 'Enter your test code. You get it by email after paying the registration fee.' };
  const pass = pt_findPass_(code);
  if (!pass) return { ok: false, error: 'That test code is not valid. Check it in your email, or message us on WhatsApp.' };
  if (String(pass.Email || '').trim().toLowerCase() !== d.email) return { ok: false, error: 'Use the same email address you paid with. Your code works only with that email.' };

  // Build the question list, grouped by subject
  let testKey, testTitle, minutes, programme, sections = [], qs = [], dir = 'ltr';
  if (d.programme === 'madrasah') {
    const lv = PT_MADRASAH[d.level];
    if (!lv) return { ok: false, error: 'Choose the level you are applying for.' };
    testKey = d.level; testTitle = 'Madrasah: ' + lv.title; minutes = lv.minutes; programme = 'Madrasah'; dir = 'rtl';
    Object.keys(lv.draw).forEach(function (s) {
      const got = pt_pick_(d.level, s, lv.draw[s]);
      if (got.length) { sections.push({ key: s, label: PT_AR_SUBJECTS[s] || s, n: got.length }); qs = qs.concat(got); }
    });
  } else if (d.programme === 'utme') {
    const allowed = PT_DEPTS[d.dept];
    if (!allowed) return { ok: false, error: 'Choose your department: Science or Arts.' };
    const subs = d.subjects.filter(function (s, i, a) { return allowed.indexOf(s) >= 0 && a.indexOf(s) === i; });
    if (subs.length !== 3) return { ok: false, error: 'Choose exactly three subjects from your department.' };
    testKey = 'utme-' + d.dept; testTitle = 'UTME (' + (d.dept === 'science' ? 'Science' : 'Arts') + ')'; minutes = PT_UTME.minutes; programme = 'Academy';
    [['eng', PT_UTME.english]].concat(subs.map(function (s) { return [s, PT_UTME.perSubject]; })).forEach(function (x) {
      const got = pt_pick_(x[0], x[0], x[1]);
      sections.push({ key: x[0], label: PT_UTME_SUBJECTS[x[0]], n: got.length }); qs = qs.concat(got);
    });
  } else return { ok: false, error: 'Choose a test.' };
  if (!qs.length) return { ok: false, error: 'This test is not available yet. Please message us on WhatsApp.' };

  // Limits: one finished attempt per test per day, and a few starts per day
  const t = pt_t_(), now = Date.now(), dayAgo = now - 86400000;
  let starts = 0, lastDone = 0;
  t.rows.forEach(function (r) {
    if (String(r.Email).toLowerCase() !== d.email) return;
    if (pt_ms_(r.Started) > dayAgo) starts++;
    if (String(r.Test) === testKey && r.Finished) lastDone = Math.max(lastDone, pt_ms_(r.Finished));
  });
  if (lastDone && now - lastDone < PT_RETAKE_HOURS * 3600000) {
    const hrs = Math.ceil((PT_RETAKE_HOURS * 3600000 - (now - lastDone)) / 3600000);
    return { ok: false, error: 'You took this test recently. You can take it again in about ' + hrs + ' hour' + (hrs === 1 ? '' : 's') + '. Check your email for your last result.' };
  }
  const usedByCode = t.rows.filter(function (r) { return key_(r.Code) === code; }).length;
  if (usedByCode >= PT_CODE_MAX_STARTS) return { ok: false, error: 'This code has started its ' + PT_CODE_MAX_STARTS + ' tests. Message us on WhatsApp if you need more.' };
  if (starts >= PT_MAX_STARTS) return { ok: false, error: 'You have started ' + PT_MAX_STARTS + ' tests today. Please try again tomorrow.' };

  // Shuffle each question's options and keep the key on the server
  const key = [], out = qs.map(function (q) {
    const order = pt_shuffle_(q.o.map(function (_, i) { return i; }));
    key.push(order.indexOf(0));                       // the first option in the bank is the correct one
    return { q: q.q, o: order.map(function (i) { return q.o[i]; }) };
  });
  const ref = 'PT-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  const token = Utilities.getUuid().replace(/-/g, '');
  const started = new Date();
  const subjLabel = sections.map(function (s) { return s.label + ' (' + s.n + ')'; }).join(', ');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    append_(t, { Ref: ref, Started: iso_(started, true), Programme: programme, Test: testKey, Subjects: subjLabel, Name: d.name, Email: d.email, WhatsApp: d.whatsapp, Age: d.age,
      Code: code, Token: token, Questions: JSON.stringify({ ids: qs.map(function (q) { return q.id; }), sec: sections.map(function (s) { return [s.label, s.n]; }), title: testTitle, ms: started.getTime(), min: minutes }),
      Key: key.join('') }, ['Ref', 'Started', 'Test', 'Subjects', 'Name', 'Email', 'WhatsApp', 'Age', 'Code', 'Token', 'Questions', 'Key']);
  } finally { lock.releaseLock(); }
  return { ok: true, ref: ref, token: token, title: testTitle, minutes: minutes, seconds: minutes * 60, dir: dir, pass: pt_passFor_(testKey),
           sections: sections.map(function (s) { return { label: s.label, n: s.n }; }), questions: out };
}

function pt_submit_(p) {
  const ref = pt_txt_(p.ref, 12).toUpperCase(), token = pt_txt_(p.token, 40);
  const answers = Array.isArray(p.answers) ? p.answers : [];
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let row, t, res;
  try {
    t = pt_t_();
    row = t.rows.filter(function (r) { return String(r.Ref) === ref; })[0];
    if (!row || String(row.Token) !== token) return { ok: false, error: 'We could not find this test. Please start again.' };
    let meta = {}; try { meta = JSON.parse(String(row.Questions)); } catch (e) {}
    const key = String(row.Key).split('').map(Number);
    if (row.Finished) return pt_result_(row, meta);      // already marked: just show the result again
    const given = key.map(function (_, i) { const v = Number(answers[i]); return (v >= 0 && v <= 3 && answers[i] !== null && answers[i] !== '') ? v : -1; });
    // Mark, section by section
    let i = 0, score = 0;
    const breakdown = (meta.sec || [['All', key.length]]).map(function (s) {
      let c = 0;
      for (let k = 0; k < s[1]; k++, i++) if (given[i] === key[i]) c++;
      score += c; return { label: s[0], score: c, total: s[1] };
    });
    const total = key.length, pct = total ? Math.round(score / total * 1000) / 10 : 0;
    const startedMs = meta.ms || pt_ms_(row.Started), took = Math.max(0, Math.round((Date.now() - startedMs) / 1000));
    const late = took > (meta.min || 30) * 60 + PT_GRACE_SEC;
    const result = pct >= pt_passFor_(row.Test) ? 'Passed' : 'Not yet';
    const vals = { Finished: iso_(new Date(), true), Score: score, Total: total, Percent: pct, Result: result,
      Breakdown: breakdown.map(function (b) { return b.label + ' ' + b.score + '/' + b.total; }).join(' · '),
      TimeTaken: Math.floor(took / 60) + 'm ' + (took % 60) + 's', Flags: late ? 'Late' : '', Answers: given.map(function (g) { return g < 0 ? '-' : g; }).join('') };
    Object.keys(vals).forEach(function (k) { put_(t, row._row, k, vals[k], k === 'Answers' || k === 'Breakdown' || k === 'TimeTaken'); row[k] = vals[k]; });
    res = pt_result_(row, meta, breakdown);
  } finally { lock.releaseLock(); }
  pt_email_(row, res);
  return res;
}

function pt_result_(row, meta, breakdown) {
  if (!breakdown) breakdown = String(row.Breakdown || '').split(' · ').filter(String).map(function (x) {
    const m = x.match(/^(.*) (\d+)\/(\d+)$/); return m ? { label: m[1], score: Number(m[2]), total: Number(m[3]) } : { label: x, score: 0, total: 0 };
  });
  const test = String(row.Test), pass = pt_passFor_(test), pct = Number(row.Percent) || 0, passed = pct >= pass;
  return { ok: true, ref: String(row.Ref), title: meta.title || test, programme: String(row.Programme), test: test, score: Number(row.Score) || 0, total: Number(row.Total) || 0,
           percent: pct, pass: pass, passed: passed, breakdown: breakdown, late: String(row.Flags) === 'Late', timeTaken: String(row.TimeTaken || '') };
}

function pt_email_(row, r) {
  try {
    if (MailApp.getRemainingDailyQuota() < 2) return;
    const first = String(row.Name).split(' ')[0];
    const lines = r.breakdown.map(function (b) { return '  ' + b.label + ': ' + b.score + ' / ' + b.total; }).join('\n');
    const mad = r.programme === 'Madrasah';
    const next = r.passed
      ? (mad ? 'Alhamdulillah, you have met the pass mark for this level. Private (one-on-one) Madrasah classes are open now: enrol at https://www.himaayahschools.com/enroll.html?programme=madrasah and mention your reference (' + r.ref + '), or message the Madrasah line on WhatsApp: +234 702 584 2849.'
             : 'Well done: that is a strong score. The Academy will help you turn it into a top UTME result. Enrol at https://www.himaayahschools.com/enroll.html?plan=utme or message the Academy line on WhatsApp: +234 806 604 3320.')
      : (mad ? 'You have not reached the ' + r.pass + '% pass mark for this level yet. That is useful to know: a lower level will give you a firm foundation. Message the Madrasah line on WhatsApp (+234 702 584 2849) and we will help you choose, or try the test for the level below.'
             : 'You have not reached the ' + r.pass + '% cut-off yet, but you can still join the Academy. That is exactly what it is for: live classes six days a week, daily and weekly timed mocks and mentorship from previous top scorers. Your mentor will use this result to plan where you start. Enrol at https://www.himaayahschools.com/enroll.html?plan=utme or message the Academy line on WhatsApp: +234 806 604 3320.');
    const body = 'Assalaamu alaykum ' + first + ',\n\nHere is your result for the ' + r.title + ' placement test.\n\nScore: ' + r.score + ' / ' + r.total + ' (' + r.percent + '%)\nPass mark: ' + r.pass + '%\nResult: ' + (r.passed ? 'Passed' : 'Not yet') +
      '\n\nBy subject:\n' + lines + '\n\n' + next + '\n\nYou can take the same test again after ' + PT_RETAKE_HOURS + ' hours: ' + PT_PAGE + '\n\nYour reference is ' + r.ref + '.\n\nJazakumullahu khayran,\n' + SCHOOL_NAME;
    if (validEmail_(row.Email)) MailApp.sendEmail({ to: String(row.Email), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': your placement test result (' + r.percent + '%)', body: body });
    MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': placement test ' + (r.passed ? 'passed' : 'taken') + ': ' + row.Name + ' (' + r.title + ', ' + r.percent + '%)',
      body: 'Name: ' + row.Name + (row.Age ? ', ' + row.Age : '') + '\nEmail: ' + row.Email + '\nWhatsApp: ' + row.WhatsApp + '\nTest: ' + r.title + '\nScore: ' + r.score + '/' + r.total + ' (' + r.percent + '%) ' + (r.passed ? 'PASSED' : 'not yet') +
            (r.late ? '\nFlag: submitted after the time limit' : '') + '\nTime taken: ' + r.timeTaken + '\n\n' + lines + '\n\nReference: ' + r.ref + '\nWhatsApp them: ' + waLink_(row.WhatsApp, 'Assalaamu alaykum ' + first + ', this is Himaayah Schools about your placement test.') });
  } catch (e) { console.error(e); }
}

/* Summary for the owner dashboard (last 30 days) */
function pt_summary_() {
  let rows; try { rows = table_(PT_TAB).rows; } catch (e) { return { taken: 0, passed: 0, recent: [] }; }
  const since = Date.now() - 30 * 86400000;
  const done = rows.filter(function (r) { return r.Finished && pt_ms_(r.Finished) > since; });
  return { taken: done.length, passed: done.filter(function (r) { return String(r.Result) === 'Passed'; }).length,
           recent: done.slice(-15).reverse().map(function (r) { return { ref: String(r.Ref), name: String(r.Name), test: String(r.Subjects).slice(0, 80), title: String(r.Test), percent: Number(r.Percent) || 0, result: String(r.Result), whatsapp: String(r.WhatsApp), when: iso_(r.Finished, true) }; }) };
}


/* ===== PAYMENT ARRIVES (from cardPaymentFromRequest in CardPayments.gs, after the secret check) =====
   A successful card payment of at least PT_FEE creates a test code and emails it with the registration form link. */
function placementCardPayment_(p) {
  const rec = {
    name: pt_txt_(p.donorName || p.student || '', 100), email: pt_txt_(p.donorEmail || p.email || '', 120).toLowerCase(), phone: pt_txt_(p.donorPhone || '', 30),
    amount: Number(p.amount) || 0, currency: String(p.currency || '').toUpperCase(), status: String(p.status || '').toUpperCase(),
    eventId: String(p.eventId || ''), checkoutId: String(p.checkoutId || ''), chargeId: String(p.chargeId || ''), ref: pt_txt_(p.ref || '', 40)
  };
  const paid = /^(SUCCEEDED|ACCEPTED|OVERPAID)$/.test(rec.status) && rec.currency === 'NGN' && rec.amount >= PT_FEE;
  let result = '', created = null;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = ss_();
    let log = ss.getSheetByName(CARD_LOG_TAB);
    if (!log) { log = ss.insertSheet(CARD_LOG_TAB); log.getRange(1, 1, 1, CARD_LOG_HEAD.length).setValues([CARD_LOG_HEAD]).setFontWeight('bold'); log.setFrozenRows(1); }
    if (rec.eventId && log.getLastRow() > 1) {
      const ids = log.getRange(2, CARD_LOG_HEAD.indexOf('EventID') + 1, log.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === rec.eventId) return { ok: true, duplicate: true };
    }
    if (!paid) result = rec.currency === 'NGN' && rec.amount > 0 && rec.amount < PT_FEE ? 'Paid less than the registration fee: check in Bachs' : 'Not a completed NGN payment';
    else {
      const T = pt_ct_(), code = pt_newCode_(T);
      append_(T, { Code: code, Name: rec.name, Email: rec.email, WhatsApp: rec.phone, Issued: iso_(new Date(), true), Source: 'Card', Amount: rec.amount,
        Reference: rec.checkoutId || rec.ref, EventID: rec.eventId, Active: true }, ['Code', 'Name', 'Email', 'WhatsApp', 'Issued', 'Reference', 'EventID']);
      created = { code: code, name: rec.name, email: rec.email };
      result = 'Test code ' + code + ' issued';
    }
    const r = log.getLastRow() + 1;
    log.getRange(r, 1, 1, CARD_LOG_HEAD.length).setNumberFormat('@').setValues([[
      iso_(new Date(), true), rec.ref || 'PLACEMENT', rec.name, 'Registration form (placement tests)', String(rec.amount), rec.currency, rec.status,
      rec.email, rec.checkoutId, rec.chargeId, rec.eventId, result
    ]]);
  } finally { lock.releaseLock(); }
  if (created) pt_sendCode_(created);
  try {
    MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': registration fee ' + naira_(rec.amount),
      body: 'A registration fee for the placement tests came in through the website.\n\nFrom: ' + (rec.name || '-') + ' (' + (rec.email || 'no email') + ', ' + (rec.phone || 'no phone') + ')\nAmount: ' +
            naira_(rec.amount) + ' ' + rec.status + '\nResult: ' + result + '\n\nSee the "' + PT_CODE_TAB + '" tab.' });
  } catch (e) { console.error(e); }
  return { ok: true, result: result };
}
function pt_sendCode_(a) {
  if (!validEmail_(a.email)) return false;
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return false;
    MailApp.sendEmail({ to: a.email, name: SCHOOL_NAME, subject: 'Your Himaayah registration form and test code',
      body: 'Assalaamu alaykum' + (a.name ? ' ' + String(a.name).split(' ')[0] : '') + ',\n\nJazakallahu khayran. Your registration fee of ' + naira_(PT_FEE) + ' is received.\n\n' +
            'Registration form number and test code: ' + a.code + '\n\n' +
            '1. Take your placement test: ' + PT_PAGE + '\n   Enter this code with the same email address you paid with (' + a.email + ').\n' +
            '2. Enrol when you are ready: https://www.himaayahschools.com/enroll?pass=' + encodeURIComponent(a.code) + '\n   The code is already filled in, and your ' + naira_(PT_FEE) + ' registration fee will not be charged again.\n\n' +
            'Keep your code private: it works only with your email address.\n\n' +
            'Any problem? Reply to this email or message the school on WhatsApp: +234 704 722 6487.\n\n' + SCHOOL_NAME });
    return true;
  } catch (e) { console.error(e); return false; }
}
/* Staff added people by hand (bank transfer): fill Name and Email in the "Test passes" tab, then run this to create and email their codes. */
function placementSendCodes() {
  const T = pt_ct_(); let n = 0; const todo = [];
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    T.rows.forEach(function (r) {
      if (!String(r.Name || '').trim() || String(r.Code || '').trim()) return;
      const code = pt_newCode_(pt_ct_());
      put_(T, r._row, 'Code', code, true);
      if (!r.Issued) put_(T, r._row, 'Issued', iso_(new Date(), true), true);
      if (!r.Source) put_(T, r._row, 'Source', 'Manual', true);
      if (r.Active === '') put_(T, r._row, 'Active', true);
      todo.push({ code: code, name: String(r.Name), email: String(r.Email || '').trim().toLowerCase() }); n++;
    });
  } finally { lock.releaseLock(); }
  let sent = 0; todo.forEach(function (a) { if (pt_sendCode_(a)) sent++; });
  const msg = n + ' code' + (n === 1 ? '' : 's') + ' created, ' + sent + ' emailed.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

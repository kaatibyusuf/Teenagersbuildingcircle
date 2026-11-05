/**
 * Himaayah Admin portal API (Admin.gs)
 * Add this file to the SAME Apps Script project as Code.gs, then follow SETUP-ADMIN.md.
 *
 * Actions (called by admin.html):
 *   admin_login      sign in, returns the full admin state
 *   admin_payment    confirm a payment (writes a Confirmed row in Payments, then Code.gs moves NextDue forward)
 *   admin_assign     set up to 3 teachers, level, next class and class link on one or many students
 *   admin_password   change the admin's own access code
 *
 * Teachers and students are matched the same way Teacher.gs does it (name or ID in the Students > Teacher cell).
 * Every action checks the Admin ID and access code against the Admins tab, so a teacher or student cannot call these.
 */

/* ===== SETTINGS ===== */
const ADMIN_LEVELS = ['Rawdah', 'Tamheedi', 'Awwal Ibtidā’iyyah', 'Thāniyah Ibtidā’iyyah', 'Thālithah Ibtidā’iyyah', 'Rābiʿah Ibtidā’iyyah', 'Awwal Iʿdādiyyah', 'Hifdh', 'Muraajah'];  // Hifdh covers Hifdh Only and One-Year Hifdh; Muraajah is revision after completing the Qur'an.  // Edit to match your level names. Levels already used in the Students tab are added automatically.
const ADMIN_MAX_ASSIGN = 500;       // students per assign request
const ADMIN_MAX_TEACHERS = 3;       // teachers per student
const ADMIN_RECENT_PAYMENTS = 8;    // rows shown under "Recently confirmed"

/* ===== AUTH ===== */
function adm_auth_(id, code) {
  id = key_(id).slice(0, 40); code = String(code || '').trim();
  if (!id || !code) return { error: 'Enter your Admin ID and access code.' };
  const cache = CacheService.getScriptCache(), lk = 'alock:' + id, fk = 'afail:' + id;
  if (cache.get(lk)) return { error: 'Too many attempts. Please try again in 15 minutes.' };
  const t = table_('Admins');
  const a = t.rows.filter(function (r) { return key_(r.AdminID) === id; })[0];
  const ok = a && key_(a.Active) !== 'FALSE' && String(a.AccessCode).trim() !== '' && code_ok_(a.AccessCode, code);
  if (!ok) {
    const n = Number(cache.get(fk) || 0) + 1;
    if (n >= LOCKOUT_TRIES) { cache.put(lk, '1', LOCKOUT_SECONDS); cache.remove(fk); } else cache.put(fk, String(n), LOCKOUT_SECONDS);
    return { error: 'Wrong ID or access code.' };
  }
  cache.remove(fk);
  return { admin: a, table: t };
}

/* The Teacher cell holds up to 3 names or IDs, separated by commas (semicolons, "/", "&" and "and" are read too). */
function adm_split_(cell) {
  return typeof tchSplit_ === 'function' ? tchSplit_(cell)
    : String(cell || '').split(/\s*(?:[,;\/&\n]|\band\b)\s*/i).map(function (x) { return String(x).trim(); }).filter(Boolean);
}

/* ===== STATE (everything the page needs, sent after every action) ===== */
function adm_teachers_() {
  try {
    return table_('Teachers').rows.filter(function (t) { return t.Name && key_(t.Active) !== 'FALSE' && key_(t.Role) !== 'ADMIN'; }).map(function (t) {   // Role "Admin" rows do not teach
      return { TeacherID: String(t.TeacherID || '').trim(), Name: String(t.Name).trim() };
    });
  } catch (e) { return []; }
}
function adm_isTbc_(s) { return typeof tbcIs_ === 'function' && tbcIs_(s); }   // TBC.gs, when added
function adm_state_(admin, tbc) {
  const teachers = adm_teachers_();
  const find = function (v) {
    const k = key_(v); if (!k) return null;
    return teachers.filter(function (t) { return key_(t.Name) === k || (t.TeacherID && key_(t.TeacherID) === k); })[0] || null;
  };
  const rows = table_('Students').rows.filter(function (s) { return s.StudentID && key_(s.Active) !== 'FALSE' && adm_isTbc_(s) === !!tbc; });   // each portal shows its own programme
  const levels = (tbc ? TBC_COHORTS : ADMIN_LEVELS).slice();
  const students = rows.map(function (s) {
    // The Teacher cell may hold one name or ID, or several separated by commas (Teacher.gs allows that).
    const found = adm_split_(s.Teacher).map(find).filter(Boolean), t = found[0], lv = tbc && /teenager/i.test(String(s.Level)) ? '' : String(s.Level || '').trim();   // a TBC student's Level is a cohort name; the enrolment text is not one
    if (lv && levels.indexOf(lv) < 0) levels.push(lv);
    return {
      StudentID: String(s.StudentID).trim(), Name: s.Name, Level: lv, Plan: s.Plan,
      Teacher: found.length ? found.map(function (x) { return x.Name; }).join(', ') : String(s.Teacher || '').trim(), TeacherID: t ? t.TeacherID || t.Name : '',
      TeacherIDs: found.map(function (x) { return x.TeacherID || x.Name; }),
      PaymentStatus: payStatus_(s), NextDue: iso_(s.NextDue), MonthlyFee: Number(s.MonthlyFee) || 0,
      NextClass: iso_(s.NextClass, true), ClassLink: s.ClassLink
    };
  });
  const names = {};
  rows.forEach(function (s) { names[key_(s.StudentID)] = s.Name; });
  const payments = table_('Payments').rows.filter(function (p) { return String(p.Status).trim().toLowerCase() === 'confirmed'; })
    .sort(function (a, b) { return iso_(a.Date) < iso_(b.Date) ? 1 : iso_(a.Date) > iso_(b.Date) ? -1 : b._row - a._row; })
    .slice(0, ADMIN_RECENT_PAYMENTS).map(function (p) {
      return { Date: iso_(p.Date), StudentID: p.StudentID, Name: names[key_(p.StudentID)] || '', Amount: Number(p.Amount) || 0, Months: Number(p.Months) || 1, Reference: p.Reference };
    });
  return {
    ok: true, today: today_(), admin: { AdminID: String(admin.AdminID).trim(), Name: admin.Name || admin.AdminID },
    students: students, teachers: teachers.map(function (t) { return { TeacherID: t.TeacherID || t.Name, Name: t.Name }; }), levels: levels, payments: payments
  };
}

/* ===== ACTIONS ===== */
function adm_payment_(p, tbc) {
  const sid = key_(p.studentId), amount = Number(p.amount), months = Number(p.months), date = String(p.date || '').trim();
  const ref = String(p.reference || '').trim().slice(0, 60);
  if (!sid) return { ok: false, error: 'Choose a student.' };
  if (!(amount > 0) || amount > 100000000) return { ok: false, error: 'Enter the amount received.' };
  if (!(months >= 1 && months <= 24) || Math.round(months) !== months) return { ok: false, error: 'Months must be a whole number from 1 to 24.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Enter the date the money was received.' };
  if (date > today_()) return { ok: false, error: 'The date cannot be in the future.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let prow;
  try {
    const stt = table_('Students');
    const s = stt.rows.filter(function (r) { return key_(r.StudentID) === sid; })[0];
    if (!s) return { ok: false, error: 'Student not found.' };
    if (adm_isTbc_(s) !== !!tbc) return { ok: false, error: 'That student belongs to the ' + (tbc ? 'Madrasah' : 'Teenagers Building Circle') + ' admin portal.' };
    if (String(s.PaymentStatus).trim().toLowerCase() === 'exempt') return { ok: false, error: 'This student is exempt from payment.' };
    const pt = table_('Payments');
    prow = append_(pt, { PaymentID: 'P-' + Utilities.getUuid().slice(0, 6).toUpperCase(), StudentID: String(s.StudentID).trim(), Date: date, Amount: amount, Months: months, Reference: ref, Method: 'Admin portal', Status: 'Confirmed' }, ['Date', 'Reference']);
  } finally { lock.releaseLock(); }
  applyPayments_();   // moves NextDue forward, updates the status, sends the thank-you email
  const after = table_('Payments').rows.filter(function (r) { return r._row === prow; })[0];
  if (!after || !after.Applied) return { ok: false, error: 'The payment was recorded but could not be applied. Check the Payments tab.' };
  if (/^no such student/i.test(String(after.Applied))) return { ok: false, error: 'Student not found.' };
  return { ok: true };
}

function adm_assign_(p, tbc) {
  const ids = (Array.isArray(p.studentIds) ? p.studentIds : []).map(key_).filter(Boolean);
  if (!ids.length) return { ok: false, error: 'Tick at least one student.' };
  if (ids.length > ADMIN_MAX_ASSIGN) return { ok: false, error: 'Please assign at most ' + ADMIN_MAX_ASSIGN + ' students at a time.' };
  // Teachers: up to 3. mode "set" replaces the student's teachers, "add" keeps the existing ones, "remove" takes these off.
  const tids = (Array.isArray(p.teacherIds) ? p.teacherIds : p.teacherId ? [p.teacherId] : []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
  const mode = ['set', 'add', 'remove'].indexOf(String(p.mode || 'set')) >= 0 ? String(p.mode || 'set') : 'set';
  const level = String(p.level || '').trim();
  const nextClass = String(p.nextClass || '').trim(), link = String(p.link || '').trim();
  if (!tids.length && !level && !nextClass && !link) return { ok: false, error: 'Choose a teacher, level or class to apply.' };
  if (tids.length > ADMIN_MAX_TEACHERS) return { ok: false, error: 'Choose at most ' + ADMIN_MAX_TEACHERS + ' teachers.' };
  const all = adm_teachers_(), chosen = [];
  for (let i = 0; i < tids.length; i++) {
    const t = all.filter(function (x) { return key_(x.TeacherID) === key_(tids[i]) || key_(x.Name) === key_(tids[i]); })[0];
    if (!t) return { ok: false, error: 'Teacher not found.' };
    if (chosen.indexOf(t) < 0) chosen.push(t);
  }
  const same = function (a, b) { return key_(a.Name) === key_(b.Name) || (a.TeacherID && key_(a.TeacherID) === key_(b.TeacherID)); };
  const teachersFor = function (s) {   // the student's teachers after this change, or null when teachers are not being changed
    if (!chosen.length) return null;
    const current = adm_split_(s.Teacher).map(function (v) {
      return all.filter(function (x) { return key_(x.Name) === key_(v) || (x.TeacherID && key_(x.TeacherID) === key_(v)); })[0] || { Name: v, TeacherID: '' };
    });
    let next = mode === 'set' ? chosen.slice() : current.slice();
    if (mode === 'add') chosen.forEach(function (t) { if (!next.some(function (x) { return same(x, t); })) next.push(t); });
    if (mode === 'remove') next = next.filter(function (x) { return !chosen.some(function (t) { return same(x, t); }); });
    return next;
  };
  if (level) {
    const known = (tbc ? TBC_COHORTS : ADMIN_LEVELS).concat(table_('Students').rows.filter(function (r) { return adm_isTbc_(r) === !!tbc; }).map(function (r) { return String(r.Level || '').trim(); }));
    if (known.indexOf(level) < 0) return { ok: false, error: 'Unknown level.' };
  }
  if (nextClass && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(nextClass)) return { ok: false, error: 'Enter the class date and time.' };
  if (link && (!/^https?:\/\//i.test(link) || link.length > 500)) return { ok: false, error: 'The class link must start with http:// or https://' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const t = table_('Students');
    const want = {}; ids.forEach(function (i) { want[i] = true; });
    const mine = t.rows.filter(function (s) { return want[key_(s.StudentID)]; });
    if (mine.some(function (s) { return adm_isTbc_(s) !== !!tbc; })) return { ok: false, error: 'Some of those students belong to the ' + (tbc ? 'Madrasah' : 'Teenagers Building Circle') + ' admin portal.' };
    const over = mine.filter(function (s) { const n = teachersFor(s); return n && n.length > ADMIN_MAX_TEACHERS; });
    if (over.length) return { ok: false, error: over[0].Name + (over.length > 1 ? ' and ' + (over.length - 1) + ' other' + (over.length > 2 ? 's' : '') : '') + ' would have more than ' + ADMIN_MAX_TEACHERS + ' teachers. Remove one first, or use "Replace".' };
    mine.forEach(function (s) {
      if (tbc && t.head.indexOf('Programme') >= 0) put_(t, s._row, 'Programme', 'TBC', true);   // remember the programme once a cohort replaces the enrolment text in Level
      const nt = teachersFor(s);
      if (nt) put_(t, s._row, 'Teacher', nt.map(function (x) { return x.Name; }).join(', '), true);
      if (level) put_(t, s._row, 'Level', level, true);
      if (nextClass) put_(t, s._row, 'NextClass', nextClass, true);
      if (link) put_(t, s._row, 'ClassLink', link, true);
    });
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function adm_password_(a, p) {
  const code = String(p.newCode || '').trim();
  if (code.length < 8 || code.length > 40) return { ok: false, error: 'Your new code must be 8 to 40 characters.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { put_(a.table, a.admin._row, 'AccessCode', code, true); } finally { lock.releaseLock(); }
  a.admin.AccessCode = code;
  return { ok: true };
}

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function adminFromRequest(p, tbc) {
  try {
    const a = adm_auth_(p.id, p.code);
    if (a.error) return { ok: false, error: a.error };
    let r = { ok: true };
    if (p.action === 'admin_payment') r = adm_payment_(p, tbc);
    else if (p.action === 'admin_assign') r = adm_assign_(p, tbc);
    else if (p.action === 'admin_password') r = adm_password_(a, p);
    else if (p.action !== 'admin_login') return { ok: false, error: 'Unknown action.' };
    return r.ok ? adm_state_(a.admin, tbc) : r;
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* ===== ONE-TIME SETUP (run from the Himaayah menu or the editor) ===== */
function adminSetup() {
  const ss = ss_(), want = ['AdminID', 'Name', 'AccessCode', 'Active'];
  const sh = ss.getSheetByName('Admins') || ss.insertSheet('Admins');
  if (!sh.getLastColumn() || !sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].some(Boolean)) sh.getRange(1, 1, 1, want.length).setValues([want]);
  sh.setFrozenRows(1); sh.getRange(1, 1, 1, want.length).setFontWeight('bold');
  try { ss.toast('Admins tab is ready. Add the admin in row 2: ID, name, a strong access code, and TRUE.', SCHOOL_NAME); } catch (e) {}
}
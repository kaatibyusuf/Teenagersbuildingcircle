/**
 * Reset access codes (Resets.gs)
 *
 * Lets an admin give someone who has forgotten their access code a new one, from the admin portals. Add this as a NEW file next
 * to Code.gs. There is nothing to set up: the first reset creates a "CodeResets" tab, which is the log of every reset.
 *
 * Who can reset what
 *   Owner (owner.html)                 everyone, including every kind of admin
 *   Madrasah / TBC admin (admin.html,  Madrasah and Teenagers Circle students, teachers and facilitators, librarians,
 *     tbc-admin.html)                    Hadith Bootcamp students and referral partners
 *   Academy admin (academy-admin.html) Academy students and tutors
 *   Skills admin (skills-admin.html)   Skills School students and tutors
 *   Only the owner can reset an admin or another owner. Nobody can reset their own code here (use Account instead).
 *
 * What a reset does
 *   - makes a random code like "k7m2q-xw9pd" (lowercase letters and digits, no look-alike characters),
 *   - stores it protected (the sheet never holds the plain code) and shows it to the admin once,
 *   - clears any "too many attempts" lockout, so the person can sign in at once,
 *   - writes a line in the CodeResets tab (who reset whom, and when; never the code),
 *   - optionally emails the new code to the person, and offers a WhatsApp link when a number is on file.
 * The person can then change the code themselves under Account.
 *
 * Choose-your-own-code on first sign-in
 *   Unless the admin unticks "Ask them to choose their own code", the person is listed in the CodeMustChange tab (Kind, ID, Since). When they next
 *   sign in to their portal, a window asks them to choose their own code before they carry on (js/force-change.js asks the script through
 *   rs_mc_check and rs_mc_set, using the same sign-in checks and lockouts as the portal). Choosing a code removes them from the tab.
 *   This is a prompt in the page, not a lock inside every portal: the new code you hand out still works if someone closes the window.
 */

const RS_LOG = 'CodeResets';
const RS_LOG_HEAD = ['When', 'ByRole', 'ById', 'ByName', 'Kind', 'TargetID', 'TargetName', 'Emailed'];
const RS_MC = 'CodeMustChange';
const RS_MC_HEAD = ['Kind', 'ID', 'Since'];
const RS_MAX_PER_HOUR = 30;          // resets one admin can make per hour (limits harm if an admin login is ever stolen)
const RS_MAX_RESULTS = 25;
const RS_SITE = 'https://www.himaayahschools.com/';

/* Every account type: where it lives, which column holds the ID, and which sign-in lockout keys to clear. */
const RS_KINDS = {
  student:        { label: 'Madrasah / TBC student', tab: 'Students', id: 'StudentID', name: 'Name', email: 'Email', phone: 'WhatsApp', lock: function (i) { return ['lock:' + i, 'fail:' + i]; } },
  teacher:        { label: 'Teacher / facilitator', tab: 'Teachers', id: 'TeacherID', name: 'Name', email: 'Email', phone: '', lock: function (i) { return ['tlock:' + i, 'tfail:' + i]; } },
  librarian:      { label: 'Librarian', tab: 'Librarians', id: 'LibrarianID', name: 'Name', email: '', phone: '', lock: function (i) { return ['llock:' + i, 'lfail:' + i]; } },
  admin:          { label: 'Admin (Madrasah / TBC)', tab: 'Admins', id: 'AdminID', name: 'Name', email: '', phone: '', lock: function (i) { return ['alock:' + i, 'afail:' + i]; } },
  academyStudent: { label: 'Academy student', tab: 'AcademyStudents', id: 'StudentID', alt: 'Matric', name: 'Name', email: 'Email', phone: 'WhatsApp', lock: function (i) { return ['lock:AcademyStudents:' + i, 'fail:AcademyStudents:' + i]; } },
  academyTutor:   { label: 'Academy tutor', tab: 'AcademyTutors', id: 'TutorID', name: 'Name', email: 'Email', phone: 'WhatsApp', lock: function (i) { return ['lock:AcademyTutors:' + i, 'fail:AcademyTutors:' + i]; } },
  academyAdmin:   { label: 'Academy admin', tab: 'AcademyAdmins', id: 'AdminID', name: 'Name', email: 'Email', phone: '', lock: function (i) { return ['lock:AcademyAdmins:' + i, 'fail:AcademyAdmins:' + i]; } },
  skillsStudent:  { label: 'Skills School student', tab: 'SkillsStudents', id: 'StudentID', name: 'Name', email: 'Email', phone: 'WhatsApp', lock: function (i) { return ['lock:SkillsStudents:' + i, 'fail:SkillsStudents:' + i]; } },
  skillsTutor:    { label: 'Skills School tutor', tab: 'SkillsTutors', id: 'TutorID', name: 'Name', email: 'Email', phone: 'WhatsApp', lock: function (i) { return ['lock:SkillsTutors:' + i, 'fail:SkillsTutors:' + i]; } },
  skillsAdmin:    { label: 'Skills School admin', tab: 'SkillsAdmins', id: 'AdminID', name: 'Name', email: 'Email', phone: '', lock: function (i) { return ['lock:SkillsAdmins:' + i, 'fail:SkillsAdmins:' + i]; } },
  owner:          { label: 'Owner', tab: 'Owners', id: 'OwnerID', name: 'Name', email: 'Email', phone: '', lock: function (i) { return ['lock:Owners:' + i, 'fail:Owners:' + i]; } },
  bootcamp:       { label: 'Hadith Bootcamp student', tab: 'Bootcamp students', id: 'BootcampID', name: 'Name', email: 'Email', phone: 'WhatsApp', lock: function (i) { return ['bclock:' + i, 'bcfail:' + i]; } },
  parent:         { label: 'Parent / guardian', tab: 'Parents', id: 'ParentID', name: 'Name', email: 'Email', phone: 'WhatsApp', lock: function (i) { return ['lock:Parents:' + i, 'fail:Parents:' + i]; } },
  referrer:       { label: 'Referral partner', tab: 'Referrers', id: 'Code', name: 'Name', email: 'Email', phone: 'WhatsApp', lock: function (i) { return ['lock:ref:' + i, 'fail:ref:' + i]; } }
};
const RS_SCOPE = {
  owner:   Object.keys(RS_KINDS),
  admin:   ['student', 'teacher', 'librarian', 'bootcamp', 'referrer', 'parent'],
  academy: ['academyStudent', 'academyTutor', 'parent'],
  skills:  ['skillsStudent', 'skillsTutor', 'parent']
};

const RS_SELF = { owner: 'owner', admin: 'admin', academy: 'academyAdmin', skills: 'skillsAdmin' };   // the kind an admin of each role is
function rs_fail_(m) { throw new Error('USER:' + m); }

/* ===== ENTRY POINT (called from doPost in Code.gs) ===== */
function resetsFromRequest(p) {
  try {
    const op = String(p.action || '');
    if (op === 'rs_mc_check' || op === 'rs_mc_set') {                          // the person themselves, not an admin
      const lock = LockService.getScriptLock(); lock.waitLock(20000);
      try { return op === 'rs_mc_check' ? rs_mcCheck_(p) : rs_mcSet_(p); } finally { lock.releaseLock(); }
    }
    const who = rs_auth_(p);
    if (op === 'rs_find') return rs_find_(who, p);
    if (op === 'rs_recent') return rs_recent_(who);
    if (op === 'rs_reset') {
      const lock = LockService.getScriptLock(); lock.waitLock(20000);
      try { return rs_reset_(who, p); } finally { lock.releaseLock(); }
    }
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    if (/^USER:/.test(String(err && err.message))) return { ok: false, error: String(err.message).slice(5) };
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* The person asking must be a signed-in admin of the right kind. */
function rs_auth_(p) {
  const role = String(p.as || '');
  if (!RS_SCOPE[role]) rs_fail_('Not allowed.');
  let au, id, name;
  if (role === 'owner') { au = acd_auth_(OW_TAB, 'OwnerID', p); if (!au.error) { id = au.row.OwnerID; name = au.row.Name; } }
  else if (role === 'admin') { au = adm_auth_(p.id, p.code); if (!au.error) { id = au.admin.AdminID; name = au.admin.Name; } }
  else if (role === 'academy') { au = acd_auth_(ACD.Admins, 'AdminID', p); if (!au.error) { id = au.row.AdminID; name = au.row.Name; } }
  else { au = acd_auth_(SK.Admins, 'AdminID', p); if (!au.error) { id = au.row.AdminID; name = au.row.Name; } }
  if (au.error) rs_fail_(au.error);
  return { role: role, id: String(id).trim(), name: String(name || id).trim(), kinds: RS_SCOPE[role] };
}

/* ===== SMALL HELPERS ===== */
function rs_rows_(kind) {
  try { const sh = ss_().getSheetByName(kind.tab); if (!sh) return null; return table_(kind.tab); } catch (e) { return null; }
}
function rs_cell_(row, col) { return col ? String(row[col] == null ? '' : row[col]).trim() : ''; }
function rs_mask_(email) {
  const m = /^([^@])[^@]*@([^.]*)(.*)$/.exec(String(email || '').trim());
  return m ? m[1] + '***@' + m[2].slice(0, 1) + '***' + m[3] : '';
}
function rs_digits_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function rs_valid_(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').trim()); }
function rs_find_row_(kind, rows, id) {
  const k = key_(id);
  return rows.rows.filter(function (r) { return key_(r[kind.id]) === k || (kind.alt && r[kind.alt] && key_(r[kind.alt]) === k); })[0] || null;
}

/* ===== SEARCH ===== */
function rs_find_(who, p) {
  const q = String(p.q || '').trim().toLowerCase().slice(0, 60);
  if (q.length < 2) return { ok: true, results: [], tooShort: true };
  const qd = rs_digits_(q), out = [];
  who.kinds.forEach(function (name) {
    if (out.length >= RS_MAX_RESULTS || name === 'parent') return;   // parents are listed below, from the children (Parents.gs)
    const kind = RS_KINDS[name], t = rs_rows_(kind);
    if (!t) return;
    t.rows.forEach(function (r) {
      if (out.length >= RS_MAX_RESULTS) return;
      const id = rs_cell_(r, kind.id); if (!id) return;
      const nm = rs_cell_(r, kind.name), em = rs_cell_(r, kind.email), ph = rs_cell_(r, kind.phone), alt = kind.alt ? rs_cell_(r, kind.alt) : '';
      const hit = id.toLowerCase().indexOf(q) >= 0 || nm.toLowerCase().indexOf(q) >= 0 || (alt && alt.toLowerCase().indexOf(q) >= 0) ||
        (em && em.toLowerCase().indexOf(q) >= 0) || (qd.length >= 4 && ph && rs_digits_(ph).indexOf(qd) >= 0);
      if (!hit) return;
      out.push({ kind: name, kindLabel: kind.label, id: id, name: nm, active: key_(r.Active) !== 'FALSE', emailMasked: rs_valid_(em) ? rs_mask_(em) : '', hasPhone: !!rs_digits_(ph),
        self: who.id === id && RS_SELF[who.role] === name });
    });
  });
  if (who.kinds.indexOf('parent') >= 0 && out.length < RS_MAX_RESULTS) par_hits_(who, q, qd, out);
  return { ok: true, results: out, more: out.length >= RS_MAX_RESULTS };
}

/* ===== RESET ===== */
function rs_newCode_() {
  const alpha = 'abcdefghjkmnpqrstuvwxyz23456789';     // no i, l, o, 0 or 1
  const h = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  let s = '';
  for (let i = 0; i < 10; i++) s += alpha.charAt(parseInt(h.substr(i * 3, 3), 16) % alpha.length);
  return s.slice(0, 5) + '-' + s.slice(5);
}
function rs_signin_(name, row) {
  const u = function (x, fb) { try { return typeof x !== 'undefined' ? x : fb; } catch (e) { return fb; } };
  switch (name) {
    case 'student': return (typeof tbcIs_ === 'function' && tbcIs_(row)) ? RS_SITE + 'tbc-dashboard' : DASHBOARD_URL;
    case 'teacher': return RS_SITE + 'teacher';
    case 'librarian': return RS_SITE + 'librarian';
    case 'admin': return RS_SITE + 'admin';
    case 'academyStudent': return u(typeof ACD_DASHBOARD_URL !== 'undefined' ? ACD_DASHBOARD_URL : undefined, RS_SITE + 'academy-dashboard');
    case 'academyTutor': return RS_SITE + 'academy-tutor';
    case 'academyAdmin': return RS_SITE + 'academy-admin';
    case 'skillsStudent': return u(typeof SK_DASHBOARD_URL !== 'undefined' ? SK_DASHBOARD_URL : undefined, RS_SITE + 'skills-dashboard');
    case 'skillsTutor': return RS_SITE + 'skills-tutor';
    case 'skillsAdmin': return RS_SITE + 'skills-admin';
    case 'owner': return RS_SITE + 'owner';
    case 'parent': return RS_SITE + 'parent';
    case 'bootcamp': return typeof BC_PORTAL !== 'undefined' ? BC_PORTAL : RS_SITE + 'bootcamp';
    default: return typeof REF_PAGE !== 'undefined' ? REF_PAGE : RS_SITE + 'refer';
  }
}
function rs_message_(name, row, kind, id, code, forced) {
  const first = (rs_cell_(row, kind.name).split(' ')[0]) || 'there', url = rs_signin_(name, row);
  if (name === 'parent') return ['Assalaamu alaykum,', '', 'Here is your parent code for ' + SCHOOL_NAME + '. It lets you see your child\'s fees, attendance, progress and teacher feedback.', '',
    'Your child\'s Student ID: ' + id, 'Parent code: ' + code, 'Sign in at: ' + url, '', 'Type the code exactly as shown (small letters). It is different from your child\'s own access code. Please keep it private.', '',
    'Jazakumullahu khayran,', SCHOOL_NAME].join('\n');
  return ['Assalaamu alaykum ' + first + ',', '', 'Here is your new access code for ' + SCHOOL_NAME + '.', '',
    'ID: ' + id, 'New access code: ' + code, 'Sign in at: ' + url, '',
    'Type the code exactly as shown (small letters). ' + (forced ? 'After you sign in you will be asked to choose your own code. ' : 'Please change it under Account after you sign in. ') + 'Keep it private.', '',
    'Jazakumullahu khayran,', SCHOOL_NAME].join('\n');
}
function rs_log_(who, name, id, targetName, emailed) {
  let sh = ss_().getSheetByName(RS_LOG);
  if (!sh) { sh = ss_().insertSheet(RS_LOG); sh.getRange(1, 1, 1, RS_LOG_HEAD.length).setValues([RS_LOG_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  const t = table_(RS_LOG);
  append_(t, { When: iso_(new Date(), true), ByRole: who.role, ById: who.id, ByName: who.name, Kind: name, TargetID: id, TargetName: targetName, Emailed: emailed },
    ['When', 'ById', 'ByName', 'TargetID', 'TargetName']);
}

function rs_reset_(who, p) {
  const name = String(p.kind || '');
  if (who.kinds.indexOf(name) < 0) rs_fail_('You are not allowed to reset that kind of account.');
  if (name === 'parent') par_ensure_(who, p.targetId);              // creates the Parents row the first time (Parents.gs)
  const kind = RS_KINDS[name], t = rs_rows_(kind);
  if (!t) rs_fail_('That list does not exist in the sheet yet.');
  const row = rs_find_row_(kind, t, p.targetId);
  if (!row) rs_fail_('That account was not found.');
  const id = rs_cell_(row, kind.id);
  if (who.id === id && RS_SELF[who.role] === name) rs_fail_('Use Account to change your own code.');

  const cache = CacheService.getScriptCache(), ck = 'rsn:' + who.role + ':' + who.id, n = Number(cache.get(ck) || 0);
  if (n >= RS_MAX_PER_HOUR) rs_fail_('Too many resets this hour. Please try again later.');
  cache.put(ck, String(n + 1), 3600);

  const code = rs_newCode_();
  put_(t, row._row, 'AccessCode', code, true);                       // stored protected by put_ (Codes.gs)
  const keys = [id];
  if (kind.alt && rs_cell_(row, kind.alt)) keys.push(rs_cell_(row, kind.alt));
  keys.forEach(function (k) { kind.lock(key_(k)).forEach(function (ck2) { cache.remove(ck2); }); });   // clear any lockout

  const forced = name !== 'parent' && String(p.force) !== '0' && String(p.force) !== 'false';
  const message = rs_message_(name, row, kind, id, code, forced), email = rs_cell_(row, kind.email), phone = rs_cell_(row, kind.phone);
  let emailed = 'No';
  if (p.email) {
    if (!SEND_EMAILS) emailed = 'Off';
    else if (!rs_valid_(email)) emailed = 'No email';
    else {
      try {
        if (MailApp.getRemainingDailyQuota() < 1) emailed = 'Quota reached';
        else { MailApp.sendEmail({ to: email, subject: SCHOOL_NAME + ': your new access code', body: message, name: SCHOOL_NAME }); emailed = 'Sent'; }
      } catch (e) { console.error(e); emailed = 'Error'; }
    }
  }
  if (forced) rs_mcAdd_(name, id); else rs_mcClear_(name, id);
  rs_log_(who, name, id, rs_cell_(row, kind.name), emailed);
  return { ok: true, forced: forced, code: code, id: id, name: rs_cell_(row, kind.name), kindLabel: kind.label, emailed: emailed, message: message,
    whatsapp: rs_digits_(phone) ? waLink_(phone, message) : '' };
}

/* ===== RECENT RESETS (so admins can see what has been done) ===== */
function rs_recent_(who) {
  let t;
  try { t = ss_().getSheetByName(RS_LOG) ? table_(RS_LOG) : null; } catch (e) { t = null; }
  if (!t) return { ok: true, recent: [] };
  const rows = t.rows.filter(function (r) { return who.kinds.indexOf(String(r.Kind)) >= 0; }).slice(-10).reverse();
  return { ok: true, recent: rows.map(function (r) {
    const k = RS_KINDS[String(r.Kind)];
    return { when: iso_(r.When, true), by: String(r.ByName || r.ById || ''), kindLabel: k ? k.label : String(r.Kind), target: String(r.TargetName || '') + ' (' + String(r.TargetID || '') + ')', emailed: String(r.Emailed || '') };
  }) };
}


/* ===== CHOOSE YOUR OWN CODE (the person, after a reset) ===== */
function rs_mcTable_() {
  let sh = ss_().getSheetByName(RS_MC);
  if (!sh) { sh = ss_().insertSheet(RS_MC); sh.getRange(1, 1, 1, RS_MC_HEAD.length).setValues([RS_MC_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return table_(RS_MC);
}
function rs_mcHas_(kindName, id) {
  if (!ss_().getSheetByName(RS_MC)) return false;
  return table_(RS_MC).rows.some(function (r) { return String(r.Kind) === kindName && key_(r.ID) === key_(id); });
}
function rs_mcAdd_(kindName, id) {
  if (rs_mcHas_(kindName, id)) return;
  append_(rs_mcTable_(), { Kind: kindName, ID: id, Since: iso_(new Date(), true) }, ['Kind', 'ID', 'Since']);
}
function rs_mcClear_(kindName, id) {
  if (!ss_().getSheetByName(RS_MC)) return;
  const t = table_(RS_MC);
  for (let i = t.rows.length - 1; i >= 0; i--) if (String(t.rows[i].Kind) === kindName && key_(t.rows[i].ID) === key_(id)) t.sh.deleteRow(t.rows[i]._row);
}

/* Sign the person in with the portal's own check (so lockouts apply), then find their row. */
function rs_userRow_(p) {
  let name = String(p.kind || '');
  const id = String(p.id || ''), code = String(p.code || '');
  if (!RS_KINDS[name]) rs_fail_('Not allowed.');
  if (name === 'bootcamp' && !/^HB-/i.test(id.trim())) name = 'student';          // Madrasah students use the bootcamp with their own sign-in
  let au;
  if (name === 'student') au = auth_(id, code);
  else if (name === 'teacher') au = tchAuth_(id, code);
  else if (name === 'librarian') au = lb_auth_(id, code);
  else if (name === 'admin') au = adm_auth_(id, code);
  else if (name === 'academyStudent') au = acd_auth_(ACD.Students, 'StudentID', { id: id, code: code });
  else if (name === 'academyTutor') au = acd_auth_(ACD.Tutors, 'TutorID', { id: id, code: code });
  else if (name === 'academyAdmin') au = acd_auth_(ACD.Admins, 'AdminID', { id: id, code: code });
  else if (name === 'skillsStudent') au = acd_auth_(SK.Students, 'StudentID', { id: id, code: code });
  else if (name === 'skillsTutor') au = acd_auth_(SK.Tutors, 'TutorID', { id: id, code: code });
  else if (name === 'skillsAdmin') au = acd_auth_(SK.Admins, 'AdminID', { id: id, code: code });
  else if (name === 'owner') au = acd_auth_(OW_TAB, 'OwnerID', { id: id, code: code });
  else if (name === 'bootcamp') au = bc_auth_(id, code);
  else au = ref_auth_({ code: id, access: code });
  if (au.error) rs_fail_(au.error);
  const kind = RS_KINDS[name], t = rs_rows_(kind), row = t && rs_find_row_(kind, t, id);
  if (!row) rs_fail_('Account not found.');
  return { name: name, kind: kind, t: t, row: row, id: rs_cell_(row, kind.id) };
}
function rs_mcCheck_(p) {
  const u = rs_userRow_(p);
  return { ok: true, mustChange: rs_mcHas_(u.name, u.id) };
}
function rs_mcSet_(p) {
  const u = rs_userRow_(p), next = String(p.newCode || '');
  if (next.length < 8 || next.length > 40) rs_fail_('Your new code must be 8 to 40 characters.');
  if (code_ok_(u.row.AccessCode, next)) rs_fail_('Choose a code different from the one you were given.');
  if (key_(next) === key_(u.id)) rs_fail_('Your code cannot be the same as your ID.');
  put_(u.t, u.row._row, 'AccessCode', next, true);
  rs_mcClear_(u.name, u.id);
  const cache = CacheService.getScriptCache();
  const keys = [u.id]; if (u.kind.alt && rs_cell_(u.row, u.kind.alt)) keys.push(rs_cell_(u.row, u.kind.alt));
  keys.forEach(function (k) { u.kind.lock(key_(k)).forEach(function (ck) { cache.remove(ck); }); });
  return { ok: true };
}

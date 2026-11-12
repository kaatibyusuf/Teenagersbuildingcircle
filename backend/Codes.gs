/**
 * Himaayah access-code protection (Codes.gs)
 * Add this file to the SAME Apps Script project as Code.gs, then follow SETUP-CODES.md.
 *
 * Access codes used to sit in the sheet as plain text, so anyone who could open the sheet could read every login.
 * This file stores them as a salted, keyed hash instead ("h1$salt$hash"), the way passwords should be stored.
 *
 *  - Logins accept BOTH forms, so nothing breaks while you switch: a plain code still works until it is protected.
 *  - Every new or changed code is protected automatically (put_ in Code.gs calls code_store_).
 *  - The menu item "Protect access codes" protects all the codes already in the sheet, once.
 *  - A protected code can never be read back. To help someone who forgot theirs, use the reset feature in the admin
 *    portal, which makes a new code and shows it once. "Forgot my details" emails for referrers now send a new code.
 *  - The key ("pepper") lives in Script Properties, not in the sheet, so a copy of the sheet alone cannot be cracked.
 */

const CODE_TABS = ['Students', 'AcademyStudents', 'AcademyTutors', 'AcademyAdmins', 'SkillsStudents', 'SkillsTutors', 'SkillsAdmins',
  'Teachers', 'Admins', 'Owners', 'Librarians', 'Bootcamp students', 'Referrers', 'Parents'];

function code_pepper_() {
  const props = PropertiesService.getScriptProperties();
  let p = props.getProperty('CODE_PEPPER');
  if (!p) { p = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid(); props.setProperty('CODE_PEPPER', p); }
  return p;
}
function code_isHashed_(s) { return /^h1\$[0-9a-f]{8}\$[0-9a-f]{64}$/.test(String(s == null ? '' : s).trim()); }
function code_hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function code_mac_(code, salt) { return code_hex_(Utilities.computeHmacSha256Signature(String(code), code_pepper_() + salt)); }
function code_hash_(code) {
  const salt = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase();
  return 'h1$' + salt + '$' + code_mac_(code, salt);
}
/** What goes into the sheet: hashes a plain code, leaves empty values and existing hashes alone. */
function code_store_(v) {
  v = String(v == null ? '' : v);
  return v.trim() && !code_isHashed_(v) ? code_hash_(v.trim()) : v;
}
/** Does the typed code match what the sheet holds (a hash or, until protected, the plain code)? */
function code_ok_(stored, typed) {
  stored = String(stored == null ? '' : stored).trim(); typed = String(typed == null ? '' : typed).trim();
  if (!stored || !typed) return false;
  if (!code_isHashed_(stored)) return same_(stored, typed);
  const p = stored.split('$');
  return same_(p[2], code_mac_(typed, p[1]));
}

/** Menu: protect every plain access code already in the sheet. Safe to run again: protected codes are skipped. */
function codesProtect() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  const report = [];
  try {
    CODE_TABS.forEach(function (name) {
      const sh = ss_().getSheetByName(name);
      if (!sh || sh.getLastRow() < 2) return;
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
      const c = head.indexOf('AccessCode') + 1;
      if (!c) return;
      const rng = sh.getRange(2, c, sh.getLastRow() - 1, 1), vals = rng.getValues();
      let done = 0;
      const out = vals.map(function (r) {
        const v = String(r[0] == null ? '' : r[0]).trim();
        if (!v || code_isHashed_(v)) return [r[0]];
        done++; return [code_hash_(v)];
      });
      if (done) { rng.setNumberFormat('@'); rng.setValues(out); }
      report.push(name + ': ' + done + ' protected');
    });
  } finally { lock.releaseLock(); }
  const msg = 'Access codes are now protected.\n\n' + (report.join('\n') || 'No tabs found.') + '\n\nPeople sign in exactly as before. If someone forgets their code, reset it in the admin portal.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

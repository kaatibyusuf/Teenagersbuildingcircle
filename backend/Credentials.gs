/**
 * Credentials.gs : sends login details automatically to students the admin adds by hand.
 *
 * How it works
 *  - Watches the Students, AcademyStudents and SkillsStudents tabs.
 *  - A row qualifies when it has a Name and a valid Email, is not Active=FALSE and its LoginSent cell is empty.
 *  - Missing StudentID / AccessCode are generated, then the login email is sent and LoginSent is stamped.
 *  - LoginWhatsApp gets a one-tap wa.me link (WhatsApp cannot be sent automatically; tap the link to send).
 *  - To send again: clear the LoginSent cell on that row. If the daily email limit is reached the row says
 *    "Waiting" and the hourly job sends it later.
 *  - Students created through enrolment are marked by the enrolment code, so nobody gets two emails.
 *
 * Setup: paste this file, then run credSetup() once from the editor.
 */
const CR_TABS = [
  { tab: 'Students', prefix: function () { return typeof EN_ID_PREFIX !== 'undefined' ? EN_ID_PREFIX : 'HM-'; }, area: 'Himaayah' },
  { tab: 'AcademyStudents', prefix: function () { return typeof ACD_ID_PREFIX !== 'undefined' ? ACD_ID_PREFIX : 'AC-'; }, area: 'Academy' },
  { tab: 'SkillsStudents', prefix: function () { return typeof SK_ID_PREFIX !== 'undefined' ? SK_ID_PREFIX : 'SK-'; }, area: 'Skills School' },
];

function cr_url_(area, row) {
  if (area === 'Academy') return typeof ACD_DASHBOARD_URL !== 'undefined' ? ACD_DASHBOARD_URL : DASHBOARD_URL;
  if (area === 'Skills School') return typeof SK_DASHBOARD_URL !== 'undefined' ? SK_DASHBOARD_URL : DASHBOARD_URL;
  if (typeof tbcIs_ === 'function' && tbcIs_(row)) return 'https://www.himaayahschools.com/tbc-dashboard.html';
  return DASHBOARD_URL;
}

function cr_message_(name, id, code, url) {
  const first = String(name).split(' ')[0];
  const text = ['Assalaamu alaykum ' + first + ',', '',
    'Welcome to ' + SCHOOL_NAME + '. Your student account is ready.', '',
    'Student ID: ' + id, 'Access code: ' + code, 'Sign in at: ' + url, '',
    'Please keep the access code private. You can change it after signing in.', '',
    'Jazakumullahu khayran,', SCHOOL_NAME].join('\n');
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0E2A3D;max-width:520px">' +
    text.split('\n').map(function (l) { return l === '' ? '<br>' : esc(l); }).join('<br>') +
    '<p><a href="' + url + '" style="display:inline-block;background:#0E2A3D;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Sign in to your dashboard</a></p></div>';
  return { text: text, html: html };
}

function cr_ensureCols_(sh) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  ['LoginSent', 'LoginWhatsApp'].forEach(function (h) {
    if (head.indexOf(h) < 0) { head.push(h); sh.getRange(1, head.length).setValue(h).setFontWeight('bold'); }
  });
}

function cr_nextId_(rows, prefix) {
  let max = 0;
  rows.forEach(function (r) { const m = new RegExp('^' + prefix + '(\\d+)$', 'i').exec(String(r.StudentID || '').trim()); if (m) max = Math.max(max, +m[1]); });
  return prefix + String(max + 1).padStart(4, '0');
}

/** Processes one tab. Returns how many emails were sent. */
function cr_sweepTab_(cfg) {
  const sh = ss_().getSheetByName(cfg.tab);
  if (!sh) return 0;
  cr_ensureCols_(sh);
  const t = table_(cfg.tab), prefix = cfg.prefix();
  let sent = 0;
  t.rows.forEach(function (r) {
    const mark = String(r.LoginSent || '').trim();
    if (mark && mark.indexOf('Waiting') !== 0) return;
    if (!String(r.Name || '').trim() || String(r.Active).trim().toUpperCase() === 'FALSE') return;
    const email = String(r.Email || '').trim(), phone = String(r.WhatsApp || '').replace(/\D/g, '').replace(/^0/, '234');
    if (!validEmail_(email) && !phone) return;                                 // nothing to send to yet
    let id = String(r.StudentID || '').trim(), code = String(r.AccessCode || '').trim();
    if (!id) { id = cr_nextId_(t.rows, prefix); r.StudentID = id; put_(t, r._row, 'StudentID', id, true); }
    if (!code || code_isHashed_(code)) { code = en_code(); put_(t, r._row, 'AccessCode', code, true); }   // a protected code cannot be read back, so make a new one
    const msg = cr_message_(r.Name, id, code, cr_url_(cfg.area, r));
    if (phone) put_(t, r._row, 'LoginWhatsApp', 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg.text));
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    if (!validEmail_(email)) { put_(t, r._row, 'LoginSent', 'No email: use LoginWhatsApp link'); return; }
    if (!SEND_EMAILS) { put_(t, r._row, 'LoginSent', 'Email off: use LoginWhatsApp link'); return; }
    try {
      if (MailApp.getRemainingDailyQuota() < 1) { put_(t, r._row, 'LoginSent', 'Waiting (email limit)'); return; }
      MailApp.sendEmail({ to: email, name: SCHOOL_NAME, subject: 'Your ' + SCHOOL_NAME + ' student login', htmlBody: msg.html, body: msg.text });
      put_(t, r._row, 'LoginSent', 'Emailed ' + stamp); sent++;
    } catch (err) { put_(t, r._row, 'LoginSent', 'Email failed: ' + String(err.message).slice(0, 80)); }
  });
  return sent;
}

function credSweep() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { let n = 0; CR_TABS.forEach(function (c) { n += cr_sweepTab_(c); }); return n; }
  finally { lock.releaseLock(); }
}

/** Called from onSheetEdit (Code.gs) when one of the student tabs is edited. */
function credOnEdit_(sheetName) {
  if (CR_TABS.some(function (c) { return c.tab === sheetName; })) credSweep();
}

/** Used by the enrolment code so that students it creates (and already emails) are never emailed twice. */
function cr_mark_(tab, id, note) {
  try {
    const sh = ss_().getSheetByName(tab); if (!sh) return;
    cr_ensureCols_(sh);
    const t = table_(tab), r = t.rows.filter(function (x) { return String(x.StudentID).trim() === id; })[0];
    if (r) put_(t, r._row, 'LoginSent', note || 'Emailed (enrolment)');
  } catch (e) {}
}

/** Run once from the editor. Marks everyone already in the sheets as done, then installs the hourly catch-up. */
function credSetup() {
  CR_TABS.forEach(function (c) {
    const sh = ss_().getSheetByName(c.tab); if (!sh) return;
    cr_ensureCols_(sh);
    const t = table_(c.tab);
    t.rows.forEach(function (r) { if (r.StudentID && !String(r.LoginSent || '').trim()) put_(t, r._row, 'LoginSent', 'Existing student'); });
  });
  ScriptApp.getProjectTriggers().forEach(function (tr) { if (tr.getHandlerFunction() === 'credSweep') ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('credSweep').timeBased().everyHours(1).create();
  return 'Done. New students added by the admin now receive their login automatically.';
}

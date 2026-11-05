/**
 * Himaayah Librarian portal API (Librarian.gs)
 * Add this file to the SAME Apps Script project as Code.gs and Library.gs, then follow SETUP-LIBRARIAN.md.
 *
 * Actions (called by librarian.html):
 *   lb_login      sign in, returns every library item (including hidden ones)
 *   lb_save       add an item, or change one (send its ItemID)
 *   lb_active     show or hide one item (nothing is ever deleted)
 *   lb_check      check that the links of some items still open (20 at a time)
 *   lb_member     check a library card number (Cards.gs)
 *   lb_password   change the librarian's own access code
 *
 * The librarian signs in with an ID and access code from the Librarians tab. This portal can only read and write the
 * Library tab, so it cannot see students, payments or quizzes.
 */

const LB_TAB = 'Librarians';
const LB_TYPES = ['PDF', 'Book', 'Link'];
const LB_MAX_CHECK = 20;                 // links checked per request

/* ===== AUTH ===== */
function lb_auth_(id, code) {
  id = key_(id).slice(0, 40); code = String(code || '').trim();
  if (!id || !code) return { error: 'Enter your Librarian ID and access code.' };
  const cache = CacheService.getScriptCache(), lk = 'llock:' + id, fk = 'lfail:' + id;
  if (cache.get(lk)) return { error: 'Too many attempts. Please try again in 15 minutes.' };
  const t = table_(LB_TAB);
  const a = t.rows.filter(function (r) { return key_(r.LibrarianID) === id; })[0];
  const ok = a && key_(a.Active) !== 'FALSE' && String(a.AccessCode).trim() !== '' && code_ok_(a.AccessCode, code);
  if (!ok) {
    const n = Number(cache.get(fk) || 0) + 1;
    if (n >= LOCKOUT_TRIES) { cache.put(lk, '1', LOCKOUT_SECONDS); cache.remove(fk); } else cache.put(fk, String(n), LOCKOUT_SECONDS);
    return { error: 'Wrong ID or access code.' };
  }
  cache.remove(fk);
  return { lib: a, table: t };
}

/* ===== STATE ===== */
function lb_levels_() { return typeof ADMIN_LEVELS !== 'undefined' ? ADMIN_LEVELS.slice() : []; }
function lb_newId_() { return 'L-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(); }
function lb_ensureIds_() {   // rows added by hand in the sheet get an ID the first time the librarian page loads
  let t = lib_table_();
  const need = t.rows.filter(function (r) { return r.Title && !String(r.ItemID || '').trim(); });
  if (!need.length) return t;
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { need.forEach(function (r) { put_(t, r._row, 'ItemID', lb_newId_(), true); }); } finally { lock.releaseLock(); }
  return lib_table_();
}
function lb_item_(r) {
  const type = String(r.Type || '').trim().toLowerCase();
  return {
    ItemID: String(r.ItemID).trim(), Title: String(r.Title || ''), Author: String(r.Author || ''),
    Type: type === 'link' ? 'Link' : type === 'book' ? 'Book' : 'PDF', Subject: String(r.Subject || '').trim(),
    Level: String(r.Level || '').trim() || 'All', Url: String(r.URL || '').trim(), Description: String(r.Description || ''),
    Added: iso_(r.Added), Active: key_(r.Active) !== 'FALSE', UpdatedBy: String(r.UpdatedBy || ''), Updated: iso_(r.Updated, true)
  };
}
function lb_state_(lib) {
  const t = lb_ensureIds_();
  const items = t.rows.filter(function (r) { return r.Title; }).map(lb_item_);
  const subjects = {}; items.forEach(function (i) { if (i.Subject) subjects[i.Subject] = 1; });
  return { ok: true, today: today_(), librarian: { LibrarianID: String(lib.LibrarianID).trim(), Name: lib.Name },
    items: items, levels: lb_levels_(), subjects: Object.keys(subjects).sort(), types: LB_TYPES };
}

/* ===== SAVE ===== */
function lb_blockedHost_(url) {   // the link checker must not be pointed at the school's own network
  const m = String(url).match(/^https?:\/\/([^\/:?#]+)/i);
  if (!m) return true;
  const h = m[1].toLowerCase();
  return h === 'localhost' || /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /\.(local|internal)$/.test(h) || h.indexOf('.') < 0;
}
function lb_clean_(p) {
  const title = String(p.Title || '').trim(), url = String(p.Url || '').trim();
  if (!title) return { error: 'Add a title.' };
  if (title.length > 200) return { error: 'The title is too long (200 characters at most).' };
  if (!/^https?:\/\//i.test(url) || url.length > 500) return { error: 'The link must start with https:// and be under 500 characters.' };
  if (/\s/.test(url)) return { error: 'The link cannot contain spaces.' };
  const type = LB_TYPES.filter(function (x) { return x.toLowerCase() === String(p.Type || '').trim().toLowerCase(); })[0];
  if (!type) return { error: 'Choose PDF, Book or Link.' };
  const subject = String(p.Subject || '').trim();
  if (!subject) return { error: 'Add a subject.' };
  if (subject.length > 40) return { error: 'The subject is too long (40 characters at most).' };
  const levels = lb_levels_();
  let level = String(p.Level || '').trim();
  if (!level || key_(level) === 'ALL') level = 'All';
  else {
    const parts = level.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    const bad = parts.filter(function (x) { return levels.length && levels.indexOf(x) < 0; })[0];
    if (bad) return { error: '"' + bad + '" is not a known level.' };
    level = parts.join(', ');
  }
  const desc = String(p.Description || '').trim();
  if (desc.length > 500) return { error: 'The description is too long (500 characters at most).' };
  const author = String(p.Author || '').trim();
  if (author.length > 120) return { error: 'The author is too long (120 characters at most).' };
  const added = iso_(p.Added);
  if (p.Added && !/^\d{4}-\d{2}-\d{2}$/.test(String(p.Added))) return { error: 'The date is not valid.' };
  return { v: { Title: title, Author: author, Type: type, Subject: subject, Level: level, URL: url, Description: desc, Added: added || today_() } };
}
function lb_save_(a, p) {
  const c = lb_clean_(p);
  if (c.error) return { ok: false, error: c.error };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const t = lb_ensureIds_(), id = String(p.ItemID || '').trim();
    const who = String(a.lib.Name || a.lib.LibrarianID).trim(), now = new Date();
    const text = ['Title', 'Author', 'Subject', 'Level', 'URL', 'Description'];   // stored as text so nothing is read as a formula
    let row;
    if (id) {
      row = t.rows.filter(function (r) { return String(r.ItemID).trim() === id; })[0];
      if (!row) return { ok: false, error: 'That item no longer exists. Refresh the page.' };
      Object.keys(c.v).forEach(function (k) { put_(t, row._row, k, c.v[k], text.indexOf(k) >= 0); });
      put_(t, row._row, 'UpdatedBy', who, true); put_(t, row._row, 'Updated', now);
    } else {
      const obj = c.v; obj.ItemID = lb_newId_(); obj.Active = 'TRUE'; obj.UpdatedBy = who; obj.Updated = now;
      append_(t, obj, text.concat(['ItemID', 'UpdatedBy']));
    }
  } finally { lock.releaseLock(); }
  return { ok: true };
}
function lb_active_(a, p) {
  const id = String(p.ItemID || '').trim(), on = p.active === true || p.active === 'true';
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const t = lb_ensureIds_(), row = t.rows.filter(function (r) { return String(r.ItemID).trim() === id; })[0];
    if (!row) return { ok: false, error: 'That item no longer exists. Refresh the page.' };
    put_(t, row._row, 'Active', on ? 'TRUE' : 'FALSE', true);
    put_(t, row._row, 'UpdatedBy', String(a.lib.Name || a.lib.LibrarianID).trim(), true); put_(t, row._row, 'Updated', new Date());
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/* ===== LINK CHECK ===== */
function lb_check_(p) {
  const ids = (Array.isArray(p.ids) ? p.ids : []).map(String).slice(0, LB_MAX_CHECK);
  const t = lb_ensureIds_(), rows = ids.map(function (id) { return t.rows.filter(function (r) { return String(r.ItemID).trim() === id; })[0]; });
  const reqs = [], idx = [], out = {};
  rows.forEach(function (r, i) {
    if (!r) { out[ids[i]] = { status: 'missing', text: 'Item not found' }; return; }
    const u = String(r.URL || '').trim();
    if (lb_blockedHost_(u)) { out[ids[i]] = { status: 'bad', text: 'Not a public link' }; return; }
    reqs.push({ url: u, method: 'get', muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HimaayahLibraryCheck)' } }); idx.push(i);
  });
  let res = [];
  try { res = reqs.length ? UrlFetchApp.fetchAll(reqs) : []; } catch (e) { reqs.forEach(function () { res.push(null); }); }
  res.forEach(function (r, k) {
    const id = ids[idx[k]];
    if (!r) { out[id] = { status: 'bad', text: 'Could not be reached' }; return; }
    const code = r.getResponseCode();
    out[id] = code < 400 ? { status: 'ok', text: 'Opens (' + code + ')' }
      : (code === 401 || code === 403 || code === 405 || code === 429 ? { status: 'maybe', text: 'The site blocks checks (' + code + '). Open it yourself to be sure.' }
      : { status: 'bad', text: 'Broken (' + code + ')' });
  });
  return { ok: true, checked: out };
}

/* ===== PASSWORD ===== */
function lb_password_(a, p) {
  const code = String(p.newCode || '').trim();
  if (code.length < 8 || code.length > 40) return { ok: false, error: 'Your new code must be 8 to 40 characters.' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { put_(a.table, a.lib._row, 'AccessCode', code, true); } finally { lock.releaseLock(); }
  return { ok: true };
}

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function librarianFromRequest(p) {
  try {
    const a = lb_auth_(p.id, p.code);
    if (a.error) return { ok: false, error: a.error };
    if (p.action === 'lb_check') return lb_check_(p);
    if (p.action === 'lb_member') return cards_forLibrarian_(p.member);        // check a library card (Cards.gs)
    let r = { ok: true };
    if (p.action === 'lb_save') r = lb_save_(a, p);
    else if (p.action === 'lb_active') r = lb_active_(a, p);
    else if (p.action === 'lb_password') r = lb_password_(a, p);
    else if (p.action !== 'lb_login') return { ok: false, error: 'Unknown action.' };
    return r.ok ? lb_state_(a.lib) : r;
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* ===== ONE-TIME SETUP (run from the Himaayah menu or the editor) ===== */
function librarianSetup() {
  const ss = ss_(), want = ['LibrarianID', 'Name', 'AccessCode', 'Active'];
  const sh = ss.getSheetByName(LB_TAB) || ss.insertSheet(LB_TAB);
  if (!sh.getLastColumn() || !sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].some(Boolean)) sh.getRange(1, 1, 1, want.length).setValues([want]);
  sh.setFrozenRows(1); sh.getRange(1, 1, 1, want.length).setFontWeight('bold');
  lib_table_();
  try { ss.toast('Librarians tab is ready. Add the librarian in row 2: ID, name, a strong access code, and TRUE.', SCHOOL_NAME); } catch (e) {}
}

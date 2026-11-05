/**
 * Himaayah library cards and ID cards (Cards.gs)
 * Add this file to the SAME Apps Script project as Code.gs. No new tabs and no setup: a person's card number is their
 * existing ID (HM-0001, a tutor ID, and so on) and their library number is "LIB-" plus that ID, so every student and
 * staff member already has one the moment their account exists.
 *
 * Actions (called by card.html, verify.html and librarian.html):
 *   cards / op "get"     person signs in with ID and access code, gets their card details and a check code for the QR
 *   cards / op "verify"  anyone who scans the QR (ID + check code) sees: valid or not, masked name, type, programme
 *   lb_member            (Librarian.gs) a signed-in librarian checks a library number, no check code needed
 *
 * The QR carries a check code made from a secret kept in Script Properties (CARD_SECRET, created on first use), so
 * nobody can read other people's card details by guessing IDs.
 */

// Every place a person can have an account: tab, ID column, kind, programme label.
const CARD_SOURCES = [
  { tab: 'Students',        id: 'StudentID',   kind: 'student', prog: function (r) { return 'Madrasah' + (r.Level ? ' · ' + r.Level : ''); }, plan: function (r) { return String(r.Plan || ''); } },
  { tab: 'AcademyStudents', id: 'StudentID',   kind: 'student', prog: function (r) { return 'Academy' + (r.Track ? ' · ' + r.Track : ''); },   plan: function (r) { return String(r.Track || ''); } },
  { tab: 'SkillsStudents',  id: 'StudentID',   kind: 'student', prog: function (r) { return 'Skills School' + (r.Course ? ' · ' + r.Course : ''); }, plan: function (r) { return String(r.Course || ''); } },
  { tab: 'Teachers',        id: 'TeacherID',   kind: 'staff',   prog: function () { return 'Madrasah'; },       plan: function (r) { return String(r.Role || 'Teacher'); } },
  { tab: 'AcademyTutors',   id: 'TutorID',     kind: 'staff',   prog: function () { return 'Academy'; },        plan: function (r) { return String(r.Role || 'Tutor'); } },
  { tab: 'AcademyAdmins',   id: 'AdminID',     kind: 'staff',   prog: function () { return 'Academy'; },        plan: function () { return 'Administrator'; } },
  { tab: 'SkillsTutors',    id: 'TutorID',     kind: 'staff',   prog: function () { return 'Skills School'; },  plan: function (r) { return String(r.Role || 'Tutor'); } },
  { tab: 'SkillsAdmins',    id: 'AdminID',     kind: 'staff',   prog: function () { return 'Skills School'; },  plan: function () { return 'Administrator'; } },
  { tab: 'Librarians',      id: 'LibrarianID', kind: 'staff',   prog: function () { return 'Library'; },        plan: function () { return 'Librarian'; } },
];

function cards_secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('CARD_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('CARD_SECRET', s); }
  return s;
}
function cards_token_(id) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, cards_secret_() + '|' + key_(id));
  return d.slice(0, 5).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').toUpperCase();   // 10 characters
}

/* Find a person by ID (and optionally check the access code). Returns { src, row } or null. */
function cards_find_(id, code) {
  id = key_(id).slice(0, 40);
  if (!id) return null;
  for (let i = 0; i < CARD_SOURCES.length; i++) {
    const src = CARD_SOURCES[i];
    let t;
    try { t = table_(src.tab); } catch (e) { continue; }          // a tab that does not exist yet is skipped
    const row = t.rows.filter(function (r) { return key_(r[src.id]) === id; })[0];
    if (!row) continue;
    if (key_(row.Active) === 'FALSE') return null;
    if (code != null) {
      const stored = String(row.AccessCode || '').trim();
      if (!stored || !code_ok_(stored, code)) return null;
    }
    return { src: src, row: row };
  }
  return null;
}

function cards_build_(f) {
  const r = f.row, id = String(r[f.src.id]).trim();
  const due = f.src.kind === 'student' ? iso_(r.NextDue) : '';
  const lapsed = !!due && due < iso_(new Date(new Date().getTime() - 7 * 86400000));   // a week of grace after the due date
  return {
    id: id, libraryNo: 'LIB-' + id, name: String(r.Name || '').trim(), kind: f.src.kind,
    programme: f.src.prog(r), plan: f.src.plan(r),
    validUntil: due, status: lapsed ? 'Renew' : 'Active', check: cards_token_(id)
  };
}
function cards_mask_(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  return p.length < 2 ? (p[0] || '') : p[0] + ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.';
}

function cards_throttle_(key, max, secs) {
  const cache = CacheService.getScriptCache(), n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), secs);
  return n <= max;
}

function cardsRequest(p) {
  p = p || {};   // pressing Run in the editor sends nothing
  try {
    const op = String(p.op || 'get');
    if (op === 'verify') {
      if (!cards_throttle_('cardv', 120, 60)) return { ok: false, error: 'Too many checks. Please try again in a minute.' };
      const id = key_(p.id), chk = String(p.check || '').trim().toUpperCase();
      const f = id && chk.length === 10 && same_(chk, cards_token_(id)) ? cards_find_(id) : null;
      if (!f) return { ok: true, valid: false };
      const c = cards_build_(f);
      return { ok: true, valid: c.status === 'Active', status: c.status, name: cards_mask_(c.name), kind: c.kind, programme: c.programme, libraryNo: c.libraryNo };
    }
    // get: sign in with ID and access code (locks for 15 minutes after 5 wrong tries, like the portals)
    const id = key_(p.id).slice(0, 40), cache = CacheService.getScriptCache(), lk = 'clock:' + id, fk = 'cfail:' + id;
    if (!id || !String(p.code || '').trim()) return { ok: false, error: 'Enter your ID and access code.' };
    if (cache.get(lk)) return { ok: false, error: 'Too many attempts. Please try again in 15 minutes.' };
    const f = cards_find_(id, p.code);
    if (!f) {
      const n = Number(cache.get(fk) || 0) + 1;
      if (n >= 5) { cache.put(lk, '1', 900); cache.remove(fk); } else cache.put(fk, String(n), 900);
      return { ok: false, error: 'That ID and access code do not match.' };
    }
    cache.remove(fk);
    return { ok: true, card: cards_build_(f) };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* Used by Librarian.gs: a signed-in librarian types or scans a library number. */
function cards_forLibrarian_(member) {
  const id = key_(member).replace(/^LIB-/, '');
  const f = id ? cards_find_(id) : null;
  if (!f) return { ok: true, found: false };
  const c = cards_build_(f);
  return { ok: true, found: true, member: { name: c.name, libraryNo: c.libraryNo, kind: c.kind, programme: c.programme, plan: c.plan, validUntil: c.validUntil, status: c.status } };
}

/* Optional: pick this in the editor and press Run to see that Cards.gs works. It reads the first student and prints the card (never their access code). */
function cardsCheck() {
  const t = table_('Students'), r = t.rows[0];
  if (!r) { console.log('The Students tab has no rows yet.'); return; }
  console.log(JSON.stringify(cards_build_({ src: CARD_SOURCES[0], row: r })));
}

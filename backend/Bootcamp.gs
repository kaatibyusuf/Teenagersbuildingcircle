/**
 * Ḥadīth Bootcamp: al-Arbaʿīn an-Nawawiyyah (self-paced, paid)
 *
 * Pages: hadith-bootcamp (public: what it is, price, free preview, buy) and bootcamp (the student portal).
 *
 * Who can log in to the portal:
 *   - buyers: a Bootcamp ID (HB-XXXXX) and access code, created automatically when Bachs confirms
 *     the payment, and emailed to them,
 *   - current Madrasah students: their usual Student ID and access code, free of charge.
 *
 * Tabs (Himaayah → Set up the Hadith Bootcamp):
 *   Bootcamp students     one row per buyer (and per Madrasah student once they open the portal).
 *                         To add someone by hand (bank transfer, gift): type Name and Email, leave
 *                         BootcampID and AccessCode empty, then Himaayah → Bootcamp: send missing logins.
 *                         Set Active to FALSE to stop someone's access.
 *   Bootcamp recordings   one row per audio file. Hadith = the ḥadīth number it covers (or a range like
 *                         3-4), Part = order when a ḥadīth has more than one recording, DriveLink = the
 *                         Google Drive share link (Share → General access: Anyone with the link → Copy link).
 *                         Free = TRUE shows that recording on the public page as a preview.
 *   Bootcamp progress     filled automatically: what each student listened to and their quiz scores.
 *
 * Payments: api/bootcamp-checkout asks for the price (action bc_quote, protected by CARD_SECRET), Bachs takes the
 * payment, and api/bachs-webhook sends it to CardPayments.gs, which passes kind "bootcamp" to bootcampCardPayment_.
 * The ḥadīth texts, translations, lessons and quizzes are in BootcampContent.gs.
 */

const BC_PRICE = 15000;                 // naira
const BC_PASS = 4;                      // correct answers out of 5 needed to pass a quiz
const BC_NAME = 'Ḥadīth Bootcamp: al-Arbaʿīn an-Nawawiyyah';
const BC_PORTAL = 'https://www.himaayahschools.com/bootcamp';
const BC_PAGE = 'https://www.himaayahschools.com/hadith-bootcamp';
const BC_ST_TAB = 'Bootcamp students';
const BC_ST_HEAD = ['BootcampID', 'Name', 'Email', 'WhatsApp', 'AccessCode', 'Joined', 'Source', 'Amount', 'Reference', 'EventID', 'Active',
                    'Completed', 'CertificateID', 'LastSeen', 'Notes'];
const BC_REC_TAB = 'Bootcamp recordings';
const BC_REC_HEAD = ['Hadith', 'Part', 'Title', 'DriveLink', 'Minutes', 'Free', 'Notes'];
const BC_PR_TAB = 'Bootcamp progress';
const BC_PR_HEAD = ['Key', 'BootcampID', 'Hadith', 'Listened', 'BestScore', 'Passed', 'Attempts', 'Updated'];

function bc_t_(name, head) { return sp_t_(name, head); }   // creates or upgrades a tab (Sponsors.gs)
function bc_st_() { return bc_t_(BC_ST_TAB, BC_ST_HEAD); }
function bc_rec_() { return bc_t_(BC_REC_TAB, BC_REC_HEAD); }
function bc_pr_() { return bc_t_(BC_PR_TAB, BC_PR_HEAD); }
function bc_txt_(v, n) { return sp_txt_(v, n); }
function bc_rand_(n, chars) { let s = ''; for (let i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * chars.length)); return s; }
function bc_newId_(T) {
  const have = {}; T.rows.forEach(function (r) { have[key_(r.BootcampID)] = 1; });
  let id; do { id = 'HB-' + bc_rand_(5, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); } while (have[id]);
  return id;
}
function bc_newCode_() { return bc_rand_(10, 'abcdefghjkmnpqrstuvwxyz23456789'); }
function bc_yes_(v) { return /^(yes|true|1)$/i.test(String(v == null ? '' : v).trim()); }

function bootcampSetup() {
  bc_st_(); bc_pr_();
  const R = bc_rec_();
  if (!R.rows.length) {
    const rows = BC_CONTENT.map(function (h) { return [h.n, 1, h.title, '', '', h.n === 1 ? true : false, '']; });
    R.sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  const msg = 'The Hadith Bootcamp tabs are ready. Paste each recording\'s Google Drive link into "' + BC_REC_TAB + '" (one row per ḥadīth is already there; add rows for extra parts).';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function bootcampFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (a === 'bc_info') return bc_info_();
    if (a === 'bc_verify') return bc_verify_(p);
    if (a === 'bc_quote') {
      const secret = PropertiesService.getScriptProperties().getProperty('CARD_SECRET');
      if (!secret || !same_(String(p.secret || ''), secret)) return { ok: false, error: 'Not allowed' };
      return { ok: true, amount: BC_PRICE, label: BC_NAME };
    }
    const who = bc_auth_(p.id, p.code);
    if (who.error) return { ok: false, error: who.error };
    if (a === 'bc_login') return bc_payload_(who);
    if (a === 'bc_lesson') return bc_lesson_(who, p);
    if (a === 'bc_listened') return bc_listened_(who, p);
    if (a === 'bc_quiz') return bc_quiz_(who, p);
    if (a === 'bc_cert') return bc_cert_(who);
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* ===== LOGIN: a Bootcamp ID, or a Madrasah student's own login (free) ===== */
function bc_auth_(id, code) {
  const k = key_(id).slice(0, 40); code = String(code || '').trim();
  if (!k || !code) return { error: 'Enter your ID and access code.' };
  if (!/^HB-/.test(k)) {
    const a = auth_(k, code);                       // Madrasah login (Code.gs), with its own lockout
    if (a.error) return { error: a.error };
    return bc_member_(a.st);
  }
  const cache = CacheService.getScriptCache(), lk = 'bclock:' + k, fk = 'bcfail:' + k;
  if (cache.get(lk)) return { error: 'Too many attempts. Please try again in 15 minutes.' };
  const T = bc_st_();
  const r = T.rows.filter(function (x) { return key_(x.BootcampID) === k; })[0];
  const ok = r && key_(r.Active) !== 'FALSE' && String(r.AccessCode).trim() !== '' && code_ok_(r.AccessCode, code);
  if (!ok) {
    const n = Number(cache.get(fk) || 0) + 1;
    if (n >= LOCKOUT_TRIES) { cache.put(lk, '1', LOCKOUT_SECONDS); cache.remove(fk); } else cache.put(fk, String(n), LOCKOUT_SECONDS);
    return { error: 'Wrong ID or access code.' };
  }
  cache.remove(fk);
  bc_seen_(T, r);
  return { id: k, name: String(r.Name || ''), email: String(r.Email || ''), row: r, T: T, source: String(r.Source || 'Card') };
}
/* A Madrasah student gets a row the first time they open the portal, so their certificate and progress are kept. */
function bc_member_(st) {
  const sid = key_(st.StudentID);
  const T = bc_st_();
  let r = T.rows.filter(function (x) { return key_(x.BootcampID) === sid; })[0];
  if (r && key_(r.Active) === 'FALSE') return { error: 'Your bootcamp access has been paused. Please contact the school.' };
  if (!r) {
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const T2 = bc_st_();
      r = T2.rows.filter(function (x) { return key_(x.BootcampID) === sid; })[0];
      if (!r) {
        append_(T2, { BootcampID: sid, Name: String(st.Name || ''), Email: String(st.Email || ''), WhatsApp: String(st.WhatsApp || ''), Joined: iso_(new Date(), true),
          Source: 'Madrasah', Amount: 0, Active: true }, ['BootcampID', 'Name', 'Email', 'WhatsApp', 'Joined']);
        r = bc_st_().rows.filter(function (x) { return key_(x.BootcampID) === sid; })[0];
      }
    } finally { lock.releaseLock(); }
  }
  const T3 = bc_st_();
  bc_seen_(T3, r);
  return { id: sid, name: String(st.Name || r.Name || ''), email: String(st.Email || r.Email || ''), row: r, T: T3, source: 'Madrasah' };
}
function bc_seen_(T, r) { try { put_(T, r._row, 'LastSeen', iso_(new Date(), true), true); } catch (e) {} }

/* ===== RECORDINGS ===== */
function bc_driveId_(link) {
  const s = String(link || '').trim();
  const m = s.match(/\/d\/([\w-]{20,})/) || s.match(/[?&]id=([\w-]{20,})/) || s.match(/^([\w-]{25,})$/);
  return m ? m[1] : '';
}
function bc_covers_(cell, n) {            // "3", "3-4", "3, 5"
  return String(cell == null ? '' : cell).split(/[,;]+/).some(function (part) {
    const m = part.trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
    if (!m) return false;
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    return n >= Math.min(a, b) && n <= Math.max(a, b);
  });
}
function bc_recordings_(n, freeOnly, R) {
  R = R || bc_rec_();
  return R.rows.filter(function (r) { return bc_covers_(r.Hadith, n) && bc_driveId_(r.DriveLink) && (!freeOnly || bc_yes_(r.Free)); })
    .sort(function (x, y) { return (Number(x.Part) || 1) - (Number(y.Part) || 1); })
    .map(function (r, i) {
      return { part: Number(r.Part) || i + 1, title: String(r.Title || ''), minutes: Number(r.Minutes) || 0,
               embed: 'https://drive.google.com/file/d/' + bc_driveId_(r.DriveLink) + '/preview' };
    });
}

/* ===== PUBLIC: price and free preview ===== */
function bc_info_() {
  const c = CacheService.getScriptCache(), hit = c.get('bc_info');
  if (hit) return JSON.parse(hit);
  const R = bc_rec_();
  const preview = [];
  BC_CONTENT.forEach(function (h) {
    const recs = bc_recordings_(h.n, true, R);
    if (recs.length) preview.push({ n: h.n, title: h.title, recordings: recs });
  });
  const out = { ok: true, price: BC_PRICE, lessons: BC_CONTENT.length, preview: preview,
    ready: BC_CONTENT.filter(function (h) { return bc_recordings_(h.n, false, R).length; }).length };
  c.put('bc_info', JSON.stringify(out), 300);
  return out;
}
function bc_verify_(p) {
  const id = key_(p.cert).slice(0, 20);
  if (!/^HBC-[A-Z0-9]{6}$/.test(id)) return { ok: false, error: 'Enter a certificate number such as HBC-7K2M9Q.' };
  const r = bc_st_().rows.filter(function (x) { return key_(x.CertificateID) === id; })[0];
  if (!r) return { ok: false, error: 'No certificate with that number was found.' };
  return { ok: true, name: String(r.Name || ''), completed: iso_(r.Completed), course: BC_NAME };
}

/* ===== PORTAL ===== */
function bc_progress_(id, P) {
  P = P || bc_pr_();
  const m = {};
  P.rows.forEach(function (r) { if (key_(r.BootcampID) === id) m[Number(r.Hadith)] = r; });
  return m;
}
function bc_payload_(who) {
  const R = bc_rec_(), prog = bc_progress_(who.id);
  const list = BC_CONTENT.map(function (h) {
    const p = prog[h.n] || {};
    return { n: h.n, title: h.title, recordings: bc_recordings_(h.n, false, R).length, listened: !!p.Listened, best: Number(p.BestScore) || 0, passed: bc_yes_(p.Passed) };
  });
  const passed = list.filter(function (x) { return x.passed; }).length;
  const r = who.row || {};
  return { ok: true, student: { id: who.id, name: who.name, source: who.source }, price: BC_PRICE, pass: BC_PASS, total: list.length,
           passed: passed, listened: list.filter(function (x) { return x.listened; }).length, lessons: list,
           certificate: r.CertificateID ? { id: String(r.CertificateID), completed: iso_(r.Completed) } : null };
}
function bc_shuffle_(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function bc_find_(n) { n = Math.round(Number(n)); return BC_CONTENT.filter(function (h) { return h.n === n; })[0]; }
function bc_lesson_(who, p) {
  const h = bc_find_(p.n);
  if (!h) return { ok: false, error: 'Lesson not found.' };
  const pr = bc_progress_(who.id)[h.n] || {};
  return { ok: true, lesson: { n: h.n, title: h.title, narrator: h.narrator, source: h.source, ar: h.ar, en: h.en, lessons: h.lessons,
    recordings: bc_recordings_(h.n, false),
    quiz: h.quiz.map(function (q, i) { return { i: i, q: q[0], options: bc_shuffle_(q.slice(1)) }; }),
    listened: !!pr.Listened, best: Number(pr.BestScore) || 0, passed: bc_yes_(pr.Passed), attempts: Number(pr.Attempts) || 0 } };
}
function bc_upsert_(id, n, fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const P = bc_pr_(), key = id + '|' + n;
    let r = P.rows.filter(function (x) { return String(x.Key) === key; })[0];
    if (!r) {
      append_(P, { Key: key, BootcampID: id, Hadith: n, Attempts: 0, BestScore: 0, Passed: false, Updated: iso_(new Date(), true) }, ['Key', 'BootcampID', 'Updated']);
      r = bc_pr_().rows.filter(function (x) { return String(x.Key) === key; })[0];
    }
    fn(bc_pr_(), r);
  } finally { lock.releaseLock(); }
}
function bc_listened_(who, p) {
  const h = bc_find_(p.n);
  if (!h) return { ok: false, error: 'Lesson not found.' };
  bc_upsert_(who.id, h.n, function (P, r) {
    if (!r.Listened) put_(P, r._row, 'Listened', iso_(new Date(), true), true);
    put_(P, r._row, 'Updated', iso_(new Date(), true), true);
  });
  return { ok: true };
}
function bc_quiz_(who, p) {
  const h = bc_find_(p.n);
  if (!h) return { ok: false, error: 'Lesson not found.' };
  const ans = Array.isArray(p.answers) ? p.answers : [];
  if (ans.length !== h.quiz.length) return { ok: false, error: 'Answer every question first.' };
  const marks = h.quiz.map(function (q, i) { return String(ans[i] == null ? '' : ans[i]) === q[1]; });
  const score = marks.filter(Boolean).length, passed = score >= BC_PASS;
  let best = score, nowPassed = passed, attempts = 1;
  bc_upsert_(who.id, h.n, function (P, r) {
    attempts = (Number(r.Attempts) || 0) + 1;
    best = Math.max(Number(r.BestScore) || 0, score);
    nowPassed = bc_yes_(r.Passed) || passed;
    put_(P, r._row, 'Attempts', attempts); put_(P, r._row, 'BestScore', best); put_(P, r._row, 'Passed', nowPassed);
    if (!r.Listened) put_(P, r._row, 'Listened', iso_(new Date(), true), true);
    put_(P, r._row, 'Updated', iso_(new Date(), true), true);
  });
  return { ok: true, score: score, outOf: h.quiz.length, passed: passed, best: best, everPassed: nowPassed, attempts: attempts, marks: marks, pass: BC_PASS };
}
function bc_cert_(who) {
  const prog = bc_progress_(who.id);
  const left = BC_CONTENT.filter(function (h) { return !(prog[h.n] && bc_yes_(prog[h.n].Passed)); }).map(function (h) { return h.n; });
  if (left.length) return { ok: false, error: 'Pass every quiz first. Still to pass: ' + left.slice(0, 10).join(', ') + (left.length > 10 ? '…' : '') + '.' };
  let id = '', date = '', first = false;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const T = bc_st_();
    const r = T.rows.filter(function (x) { return key_(x.BootcampID) === who.id; })[0];
    if (!r) return { ok: false, error: 'Your bootcamp record was not found. Please contact the school.' };
    id = String(r.CertificateID || ''); date = iso_(r.Completed);
    if (!id) {
      const have = {}; T.rows.forEach(function (x) { have[key_(x.CertificateID)] = 1; });
      do { id = 'HBC-' + bc_rand_(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); } while (have[id]);
      date = iso_(new Date());
      put_(T, r._row, 'CertificateID', id, true); put_(T, r._row, 'Completed', date, true);
      first = true;
    }
  } finally { lock.releaseLock(); }
  if (first) {
    try {
      MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': ' + who.name + ' completed the Hadith Bootcamp',
        body: who.name + ' (' + who.id + ') passed all ' + BC_CONTENT.length + ' quizzes of the ' + BC_NAME + '.\nCertificate: ' + id + '\n\nMasha Allah.' });
      if (validEmail_(who.email) && MailApp.getRemainingDailyQuota() > 0) {
        MailApp.sendEmail({ to: who.email, name: SCHOOL_NAME, subject: 'Mā shāʾ Allāh: you completed the Hadith Bootcamp',
          body: 'Assalaamu alaykum ' + String(who.name).split(' ')[0] + ',\n\nCongratulations. You have studied and passed all ' + BC_CONTENT.length + ' ḥadīth of al-Arbaʿīn an-Nawawiyyah.\n\n' +
                'Your certificate number is ' + id + '. You can download your certificate any time from ' + BC_PORTAL + ', and anyone can check it at ' + BC_PAGE + '?verify=' + id + '\n\n' +
                'The Prophet ﷺ said: "May Allah brighten the face of a person who hears something from us and conveys it as he heard it." (at-Tirmidhī 2657)\n\n' +
                'Keep revising, and act on what you learned.\n\n' + SCHOOL_NAME });
      }
    } catch (e) { console.error(e); }
  }
  return { ok: true, certificate: { id: id, completed: date, name: who.name, course: BC_NAME } };
}

/* ===== PAYMENT ARRIVES (from cardPaymentFromRequest in CardPayments.gs, after the secret check) ===== */
function bootcampCardPayment_(p) {
  const rec = {
    name: bc_txt_(p.donorName || p.student || '', 100), email: bc_txt_(p.donorEmail || p.email || '', 120).toLowerCase(), phone: bc_txt_(p.donorPhone || '', 30),
    amount: Number(p.amount) || 0, currency: String(p.currency || '').toUpperCase(), status: String(p.status || '').toUpperCase(),
    eventId: String(p.eventId || ''), checkoutId: String(p.checkoutId || ''), chargeId: String(p.chargeId || ''), ref: bc_txt_(p.ref || '', 40)
  };
  const paid = /^(SUCCEEDED|ACCEPTED|OVERPAID)$/.test(rec.status) && rec.currency === 'NGN' && rec.amount >= BC_PRICE;
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
    if (!paid) result = rec.currency === 'NGN' && rec.amount > 0 && rec.amount < BC_PRICE ? 'Paid less than the bootcamp price: check in Bachs' : 'Not a completed NGN payment';
    else {
      const T = bc_st_();
      const id = bc_newId_(T), code = bc_newCode_();
      append_(T, { BootcampID: id, Name: rec.name, Email: rec.email, WhatsApp: rec.phone, AccessCode: code, Joined: iso_(new Date(), true), Source: 'Card',
        Amount: rec.amount, Reference: rec.checkoutId || rec.ref, EventID: rec.eventId, Active: true },
        ['BootcampID', 'Name', 'Email', 'WhatsApp', 'AccessCode', 'Joined', 'Reference', 'EventID']);
      created = { id: id, code: code, name: rec.name, email: rec.email };
      result = 'Bootcamp account ' + id + ' created';
    }
    const r = log.getLastRow() + 1;
    log.getRange(r, 1, 1, CARD_LOG_HEAD.length).setNumberFormat('@').setValues([[
      iso_(new Date(), true), rec.ref || 'BOOTCAMP', rec.name, 'Hadith Bootcamp', String(rec.amount), rec.currency, rec.status,
      rec.email, rec.checkoutId, rec.chargeId, rec.eventId, result
    ]]);
  } finally { lock.releaseLock(); }
  if (created) bc_sendLogin_(created);
  try {
    MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': Hadith Bootcamp payment ' + naira_(rec.amount),
      body: 'A Hadith Bootcamp payment came in through the website.\n\nFrom: ' + (rec.name || '-') + ' (' + (rec.email || 'no email') + ', ' + (rec.phone || 'no phone') + ')\nAmount: ' +
            naira_(rec.amount) + ' ' + rec.status + '\nResult: ' + result + '\n\nSee the "' + BC_ST_TAB + '" tab.' });
  } catch (e) { console.error(e); }
  return { ok: true, result: result };
}
function bc_sendLogin_(a) {
  if (!validEmail_(a.email)) return false;
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return false;
    MailApp.sendEmail({ to: a.email, name: SCHOOL_NAME, subject: 'Your Hadith Bootcamp login',
      body: 'Assalaamu alaykum' + (a.name ? ' ' + String(a.name).split(' ')[0] : '') + ',\n\nJazakallahu khayran for joining the ' + BC_NAME + '.\n\n' +
            'Log in here: ' + BC_PORTAL + '\nBootcamp ID: ' + a.id + '\nAccess code: ' + a.code + '\n\n' +
            'Keep these details private. Work through the ḥadīth at your own pace: listen to the lesson, read the text and notes, then pass the short quiz. ' +
            'Pass all ' + BC_CONTENT.length + ' quizzes to receive your certificate.\n\n' +
            'The Prophet ﷺ said: "Whoever takes a path seeking knowledge, Allah makes easy for him a path to Paradise." (Muslim 2699)\n\n' +
            'Any problem? Reply to this email or message the Madrasah line on WhatsApp: +234 702 584 2849.\n\n' + SCHOOL_NAME });
    return true;
  } catch (e) { console.error(e); return false; }
}

/* Staff added people by hand (bank transfer, gifts): create their logins and email them. */
function bootcampSendLogins() {
  const T = bc_st_();
  let n = 0, skipped = 0;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  const todo = [];
  try {
    T.rows.forEach(function (r) {
      if (!String(r.Name || '').trim() || String(r.BootcampID || '').trim() || key_(r.Active) === 'FALSE') return;
      const id = bc_newId_(bc_st_()), code = bc_newCode_();
      put_(T, r._row, 'BootcampID', id, true); put_(T, r._row, 'AccessCode', code, true);
      if (!r.Joined) put_(T, r._row, 'Joined', iso_(new Date(), true), true);
      if (!r.Source) put_(T, r._row, 'Source', 'Manual', true);
      if (r.Active === '') put_(T, r._row, 'Active', true);
      todo.push({ id: id, code: code, name: String(r.Name), email: String(r.Email || '').trim() });
    });
  } finally { lock.releaseLock(); }
  todo.forEach(function (a) { if (bc_sendLogin_(a)) n++; else skipped++; });
  const msg = todo.length ? 'Created ' + todo.length + ' login(s). Emailed ' + n + (skipped ? '; ' + skipped + ' had no valid email, so send their ID and code yourself (they are in the tab).' : '.') : 'Everyone already has a login.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

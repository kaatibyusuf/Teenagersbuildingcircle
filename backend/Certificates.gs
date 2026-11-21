/**
 * Himaayah Schools certificates
 *
 * One record per certificate on a "Certificates" tab. The website page certificate.html shows it (and the signature) only when the
 * ID and the check code in the link match a row here, so nobody can make a certificate up. Staff can withdraw one by typing TRUE in
 * its Revoked cell.
 *
 * Add this file to the SAME Apps Script project as Code.gs, then run certSetup once (Himaayah menu -> Set up certificates).
 * Code.gs routes action "certificate" to certificateFromRequest.
 *
 * Other files issue a certificate with cert_issue_ (Skills.gs does it when a tutor marks a student completed).
 *   cert_issue_({ name, programme, course, kind, teachers, lang: 'en' | 'ar', gender: 'm' | 'f', date, studentId })
 *   returns { ok, id, url }    url is the link to give the student
 */

const CERT_TAB = 'Certificates';
const CERT_URL = 'https://www.himaayahschools.com/certificate';
const CERT_HEAD = ['CertID', 'Check', 'Name', 'Programme', 'Course', 'Kind', 'Teachers', 'Lang', 'Gender', 'Date', 'StudentID', 'Signers', 'Issued', 'Revoked'];
const CERT_LOOKUPS_PER_HOUR = 600;   // simple protection against someone guessing links

function certSetup() {
  const ss = ss_(), sh = ss.getSheetByName(CERT_TAB) || ss.insertSheet(CERT_TAB);
  const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  if (!have.some(Boolean)) sh.getRange(1, 1, 1, CERT_HEAD.length).setValues([CERT_HEAD]);
  else CERT_HEAD.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h); } });
  sh.setFrozenRows(1); sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  dropdown_(ss, CERT_TAB, 'Revoked', ['', 'TRUE'], false);
  try { ss.toast('Certificates tab is ready.', SCHOOL_NAME); } catch (e) {}
}

/* The public check used by certificate.html. Returns the certificate only for a matching ID and check code. */
function certificateFromRequest(p) {
  try {
    if (String(p.op || 'get') !== 'get') return { ok: false, error: 'Unknown action.' };
    const cache = CacheService.getScriptCache(), k = 'certlookups', n = Number(cache.get(k) || 0);
    if (n >= CERT_LOOKUPS_PER_HOUR) return { ok: false, error: 'Too many checks right now. Please try again later.' };
    cache.put(k, String(n + 1), 3600);
    const id = key_(p.id).slice(0, 30), chk = String(p.check || '').trim().slice(0, 40);
    if (!id || !chk) return { ok: false, error: 'This certificate could not be found. Please contact the school.' };
    const t = table_(CERT_TAB), r = t.rows.filter(function (x) { return key_(x.CertID) === id; })[0];
    if (!r || !same_(String(r.Check || '').trim(), chk)) return { ok: false, error: 'This certificate could not be found. Please contact the school.' };
    return { ok: true, certificate: {
      id: String(r.CertID).trim(), name: String(r.Name || ''), course: String(r.Course || ''), kind: String(r.Kind || ''), teachers: String(r.Teachers || ''),
      lang: String(r.Lang || '').toLowerCase() === 'ar' ? 'ar' : 'en', gender: String(r.Gender || '').toLowerCase() === 'f' ? 'f' : 'm',
      date: iso_(r.Date), revoked: key_(r.Revoked) === 'TRUE',
      signers: String(r.Signers || 'founder').split(',').map(function (s) { return s.trim(); }).filter(Boolean)
    } };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/* Issues one certificate (or returns the one already issued for the same student, programme and course). */
function cert_issue_(o) {
  const name = String(o.name || '').trim().slice(0, 120), course = String(o.course || '').trim().slice(0, 160);
  if (!name || !course) return { ok: false, error: 'A certificate needs a name and a course.' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const t = table_(CERT_TAB), sid = key_(o.studentId), prog = String(o.programme || '').trim();
    if (sid) {
      const ex = t.rows.filter(function (r) { return key_(r.StudentID) === sid && String(r.Programme || '').trim() === prog && String(r.Course || '').trim() === course && key_(r.Revoked) !== 'TRUE'; })[0];
      if (ex) return { ok: true, id: String(ex.CertID).trim(), url: cert_url_(ex.CertID, ex.Check), existing: true };
    }
    let id = o.id ? key_(o.id) : '';
    if (id && t.rows.some(function (r) { return key_(r.CertID) === id; })) id = '';
    if (!id) do { id = 'HIM-' + en_code(); } while (t.rows.some(function (r) { return key_(r.CertID) === id; }));   // en_code: Enrol.gs
    const chk = en_code() + en_code();
    append_(t, {
      CertID: id, Check: chk, Name: name, Programme: prog, Course: course, Kind: String(o.kind || '').slice(0, 160), Teachers: String(o.teachers || '').slice(0, 160),
      Lang: o.lang === 'ar' ? 'ar' : 'en', Gender: String(o.gender || '').toLowerCase() === 'f' ? 'f' : String(o.gender || '').toLowerCase() === 'm' ? 'm' : '',
      Date: iso_(o.date) || today_(), StudentID: String(o.studentId || '').trim(), Signers: 'founder', Issued: new Date()
    }, ['CertID', 'Check', 'Name', 'Course', 'Kind', 'Teachers', 'StudentID']);
    return { ok: true, id: id, url: cert_url_(id, chk) };
  } finally { lock.releaseLock(); }
}
function cert_url_(id, chk) { return CERT_URL + '?c=' + encodeURIComponent(String(id).trim()) + '&k=' + encodeURIComponent(String(chk).trim()); }

/**
 * Testimonials (success-stories.html)
 *
 * Parents and students share their experience with the form on success-stories.html (#share).
 * Nothing appears on the site until staff approve it on the owner dashboard (Stories tab), or by
 * setting Status to Approved in the "Testimonials" tab. Featured ones are shown first.
 *
 * Asking for them: Himaayah → Ask families for a testimonial emails every active student's
 * family a short request with a link to the form. Each email address is asked at most once
 * every TM_ASK_DAYS days, and the daily email quota is respected (run it again the next day
 * to reach the rest).
 */

const TM_TAB = 'Testimonials';
const TM_HEAD = ['ID', 'Submitted', 'Name', 'ShowAs', 'Role', 'Programme', 'StudentID', 'Result', 'Rating', 'Text', 'Email', 'Status', 'Featured', 'Source'];
const TM_ASK_TAB = 'Testimonial asks';
const TM_ASK_HEAD = ['Email', 'StudentID', 'Asked'];
const TM_ASK_DAYS = 180;
const TM_SHARE_URL = 'https://www.himaayahschools.com/success-stories.html';
const TM_ROLES = ['Parent', 'Student', 'Former student', 'Other'];
const TM_PROGRAMMES = ['Madrasah', 'Academy', 'Skills School', 'Teenagers Building Circle'];

function tm_t_(name, head) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); }
  else {
    const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    head.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h).setFontWeight('bold'); } });
  }
  return table_(name);
}
function tm_txt_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n); }
function tm_show_(name, how) {   // how the name appears on the site
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || how === 'Anonymous') return '';
  if (how === 'Initials') return parts.map(function (p) { return p.charAt(0).toUpperCase() + '.'; }).join(' ');
  return parts[0] + (parts.length > 1 ? ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.' : '');
}

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function testimonialsFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (a === 'tm_list') return tm_list_();
    if (a === 'tm_submit') return tm_submit_(p);
    return { ok: false, error: 'Unknown action.' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

function tm_list_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('tm_list');
  if (hit) return JSON.parse(hit);
  let rows = [];
  try { rows = table_(TM_TAB).rows; } catch (e) {}
  const list = rows.filter(function (r) { return String(r.Status) === 'Approved' && String(r.Text || '').trim(); })
    .sort(function (a, b) {
      const fa = /^(yes|true)$/i.test(String(a.Featured)) ? 1 : 0, fb = /^(yes|true)$/i.test(String(b.Featured)) ? 1 : 0;
      return fb - fa || (iso_(a.Submitted, true) < iso_(b.Submitted, true) ? 1 : -1);
    }).slice(0, 30)
    .map(function (r) {
      return { Name: tm_show_(r.Name, String(r.ShowAs || 'First name')), Role: String(r.Role || ''), Programme: String(r.Programme || ''), Result: String(r.Result || ''),
               Rating: Math.max(0, Math.min(5, Number(r.Rating) || 0)), Text: String(r.Text || '') };
    });
  const out = { ok: true, stories: list };
  try { cache.put('tm_list', JSON.stringify(out), 600); } catch (e) {}
  return out;
}

function tm_submit_(p) {
  if (String(p.website || '').trim()) return { ok: true };   // honeypot
  const d = {
    name: tm_txt_(p.name, 80), showAs: ['First name', 'Initials', 'Anonymous'].indexOf(String(p.showAs)) >= 0 ? String(p.showAs) : 'First name',
    role: TM_ROLES.indexOf(String(p.role)) >= 0 ? String(p.role) : 'Other', programme: TM_PROGRAMMES.indexOf(String(p.programme)) >= 0 ? String(p.programme) : '',
    studentId: key_(p.studentId).slice(0, 20), result: tm_txt_(p.result, 60), rating: Math.max(1, Math.min(5, Math.round(Number(p.rating) || 5))),
    text: tm_txt_(p.text, 1200), email: tm_txt_(p.email, 120).toLowerCase(), source: tm_txt_(p.source, 30)
  };
  if (!d.name) return { ok: false, error: 'Enter your name.' };
  if (!d.programme) return { ok: false, error: 'Choose a programme.' };
  if (d.text.length < 30) return { ok: false, error: 'Write a few sentences about your experience.' };
  if (d.email && !validEmail_(d.email)) return { ok: false, error: 'Enter a valid email address, or leave it blank.' };
  const cache = CacheService.getScriptCache(), k = 'tm_' + (d.email || d.name.toLowerCase()), n = Number(cache.get(k) || 0);
  if (n >= 3) return { ok: false, error: 'Thank you, we already have your story.' };
  cache.put(k, String(n + 1), 86400);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    append_(tm_t_(TM_TAB, TM_HEAD), { ID: 'T-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(), Submitted: iso_(new Date(), true), Name: d.name, ShowAs: d.showAs,
      Role: d.role, Programme: d.programme, StudentID: d.studentId, Result: d.result, Rating: d.rating, Text: d.text, Email: d.email, Status: 'New', Featured: '', Source: d.source || 'website' },
      ['ID', 'Submitted', 'Name', 'StudentID', 'Result', 'Text', 'Email', 'Source']);
  } finally { lock.releaseLock(); }
  try {
    if (MailApp.getRemainingDailyQuota() > 0) MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': new testimonial from ' + d.name,
      body: d.name + ' (' + d.role + ', ' + d.programme + (d.result ? ', ' + d.result : '') + ') rated ' + d.rating + '/5:\n\n"' + d.text + '"\n\nApprove it on the owner dashboard (Stories) to show it on the website.' });
  } catch (e) { console.error(e); }
  return { ok: true };
}

/* ===== owner dashboard ===== */
function tm_summary_() {
  let rows = [];
  try { rows = table_(TM_TAB).rows; } catch (e) {}
  return rows.filter(function (r) { return r.ID; }).sort(function (a, b) {
    return (String(a.Status) === 'New' ? 0 : 1) - (String(b.Status) === 'New' ? 0 : 1) || (iso_(a.Submitted, true) < iso_(b.Submitted, true) ? 1 : -1);
  }).slice(0, 100).map(function (r) {
    return { ID: String(r.ID), Submitted: iso_(r.Submitted, true), Name: String(r.Name || ''), ShowAs: String(r.ShowAs || 'First name'), Shown: tm_show_(r.Name, String(r.ShowAs || 'First name')),
             Role: String(r.Role || ''), Programme: String(r.Programme || ''), StudentID: String(r.StudentID || ''), Result: String(r.Result || ''), Rating: Number(r.Rating) || 0,
             Text: String(r.Text || ''), Email: String(r.Email || ''), Status: String(r.Status || 'New'), Featured: /^(yes|true)$/i.test(String(r.Featured)) };
  });
}
function tm_save_(p) {
  const t = tm_t_(TM_TAB, TM_HEAD), r = t.rows.filter(function (x) { return String(x.ID) === String(p.testimonialId || ''); })[0];
  if (!r) return { ok: false, error: 'Testimonial not found.' };
  const status = String(p.status || r.Status);
  if (['New', 'Approved', 'Hidden'].indexOf(status) < 0) return { ok: false, error: 'Unknown status.' };
  put_(t, r._row, 'Status', status);
  put_(t, r._row, 'Featured', p.featured ? 'Yes' : '');
  if (p.showAs && ['First name', 'Initials', 'Anonymous'].indexOf(String(p.showAs)) >= 0) put_(t, r._row, 'ShowAs', String(p.showAs));
  if (p.result != null) put_(t, r._row, 'Result', tm_txt_(p.result, 60), true);
  if (p.text != null && tm_txt_(p.text, 1200).length >= 10) put_(t, r._row, 'Text', tm_txt_(p.text, 1200), true);
  CacheService.getScriptCache().remove('tm_list');
  return { ok: true, message: status === 'Approved' ? 'Approved. It now shows on Success stories.' : status === 'Hidden' ? 'Hidden from the website.' : 'Saved.' };
}

/* ===== Menu: Himaayah → Ask families for a testimonial ===== */
function askForTestimonials() {
  const msg = tm_ask_();
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
function tm_ask_() {
  if (typeof rp_students_ !== 'function') return 'Add Reports.gs first: it knows who each family is.';
  const A = tm_t_(TM_ASK_TAB, TM_ASK_HEAD), last = {}, cutoff = addMonths_(today_(), -Math.round(TM_ASK_DAYS / 30));
  A.rows.forEach(function (r) { const e = String(r.Email || '').toLowerCase(); if (e && iso_(r.Asked) > (last[e] || '')) last[e] = iso_(r.Asked); });
  const emails = rp_emailMap_(), reserve = typeof RP_RESERVE === 'number' ? RP_RESERVE : 25;
  let sent = 0, skipped = 0, left = 0;
  rp_students_().forEach(function (x) {
    const to = rp_to_(x, emails).filter(function (e) { return !(last[e] && last[e] >= cutoff); });
    if (!to.length) { skipped++; return; }
    if (MailApp.getRemainingDailyQuota() < reserve + to.length) { left++; return; }
    const first = String(x.s.Name || '').split(' ')[0], link = TM_SHARE_URL + '?share=1&id=' + encodeURIComponent(x.id) + '&p=' + encodeURIComponent(x.programme) + '#share';
    try {
      MailApp.sendEmail({ to: to.join(','), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': how is ' + first + ' getting on?',
        body: 'Assalaamu alaykum,\n\nWe would love to hear how ' + first + "'s time in the " + x.programme + ' has been. A few sentences about what has changed or what you have liked helps other families decide, and helps us improve.\n\n' +
              'Share your experience here (it takes two minutes): ' + link + '\n\nYou can choose to show only your initials. Nothing is published without your permission.\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
      to.forEach(function (e) { append_(A, { Email: e, StudentID: x.id, Asked: today_() }, ['Email', 'StudentID', 'Asked']); last[e] = today_(); });
      sent++;
    } catch (err) { console.error(err); }
  });
  return 'Asked ' + sent + ' famil' + (sent === 1 ? 'y' : 'ies') + ' for a testimonial.' + (left ? ' ' + left + ' more will fit in tomorrow\'s email quota: run this again tomorrow.' : '') + (skipped ? ' ' + skipped + ' were skipped (asked recently or no email).' : '');
}

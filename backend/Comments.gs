/**
 * Article comments (articles/*.html)
 *
 * Readers leave a comment under any article. Nothing appears on the site until staff approve it:
 * open the "Comments" tab and set Status to Approved (use Hidden to remove one later). To answer a
 * reader, type your answer in the Reply column and it is shown under their comment as "Himaayah Schools".
 * A short email alert goes to the owner for every new comment (when the daily email quota allows).
 *
 * Setup: paste this file, add the router line in Code.gs doPost, and redeploy. The tab is created by itself.
 */
const CM_TAB = 'Comments';
const CM_HEAD = ['ID', 'Submitted', 'Article', 'Name', 'Email', 'Comment', 'Status', 'Reply'];
const CM_SITE = 'https://www.himaayahschools.com/articles/';

function cm_t_() {
  const ss = ss_();
  let sh = ss.getSheetByName(CM_TAB);
  if (!sh) {
    sh = ss.insertSheet(CM_TAB); sh.getRange(1, 1, 1, CM_HEAD.length).setValues([CM_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1);
    sh.getRange(2, CM_HEAD.indexOf('Status') + 1, 2000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['New', 'Approved', 'Hidden'], true).build());
  }
  return table_(CM_TAB);
}
function cm_txt_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, n); }
function cm_slug_(v) { const s = String(v || '').toLowerCase().trim(); return /^[a-z0-9-]{3,120}$/.test(s) ? s : ''; }

function commentsFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (a === 'cm_list') return cm_list_(p);
    if (a === 'cm_post') return cm_post_(p);
    return { ok: false, error: 'Unknown action.' };
  } catch (err) { console.error(err); return { ok: false, error: 'Something went wrong. Please try again.' }; }
}

function cm_list_(p) {
  const slug = cm_slug_(p.slug); if (!slug) return { ok: false, error: 'Unknown article.' };
  const cache = CacheService.getScriptCache(), ck = 'cm_' + slug, hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  let rows = []; try { rows = cm_t_().rows; } catch (e) {}
  const list = rows.filter(function (r) { return cm_slug_(r.Article) === slug && String(r.Status).trim() === 'Approved' && String(r.Comment || '').trim(); })
    .sort(function (a, b) { return iso_(a.Submitted, true) < iso_(b.Submitted, true) ? -1 : 1; }).slice(0, 150)
    .map(function (r) { return { name: String(r.Name || 'Reader'), date: iso_(r.Submitted), text: String(r.Comment), reply: String(r.Reply || '').trim() }; });
  const out = { ok: true, comments: list };
  try { cache.put(ck, JSON.stringify(out), 120); } catch (e) {}
  return out;
}

function cm_post_(p) {
  if (String(p.website || '').trim()) return { ok: true, held: true };   // honeypot
  const slug = cm_slug_(p.slug), name = cm_txt_(p.name, 60), email = cm_txt_(p.email, 120).toLowerCase(), text = String(p.comment == null ? '' : p.comment).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 1500);
  if (!slug) return { ok: false, error: 'Unknown article.' };
  if (name.length < 2) return { ok: false, error: 'Enter your name.' };
  if (text.length < 5) return { ok: false, error: 'Write a short comment first.' };
  if (email && !validEmail_(email)) return { ok: false, error: 'Enter a valid email address, or leave it blank.' };
  if ((text.match(/https?:\/\/|www\./gi) || []).length > 1) return { ok: false, error: 'Please leave out links.' };
  const cache = CacheService.getScriptCache(), k = 'cmr_' + slug + '_' + name.toLowerCase(), n = Number(cache.get(k) || 0), g = Number(cache.get('cmr_all') || 0);
  if (n >= 5 || g >= 300) return { ok: false, error: 'You have posted a lot today. Please try again tomorrow.' };
  cache.put(k, String(n + 1), 86400); cache.put('cmr_all', String(g + 1), 86400);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const dup = cm_t_().rows.some(function (r) { return cm_slug_(r.Article) === slug && String(r.Comment).trim() === text; });
    if (dup) return { ok: true, held: true };
    append_(cm_t_(), { ID: 'C-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(), Submitted: iso_(new Date(), true), Article: slug, Name: name, Email: email, Comment: text, Status: 'New', Reply: '' },
      ['ID', 'Submitted', 'Article', 'Name', 'Email', 'Comment', 'Reply']);
  } finally { lock.releaseLock(); }
  try {
    if (MailApp.getRemainingDailyQuota() > 5) MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': new article comment from ' + name,
      body: name + ' commented on ' + CM_SITE + slug + ':\n\n"' + text + '"\n\nTo publish it, open the Comments tab and set its Status to Approved.' });
  } catch (e) { console.error(e); }
  return { ok: true, held: true };
}

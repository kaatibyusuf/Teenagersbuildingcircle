/**
 * Free trial classes (trial.html)
 *
 * Families book a free class on trial.html. Two ways:
 *   1. Pick one of the open slots. Slots come from the "Trial slots" tab (weekly: Programme, Day, Time,
 *      Length in minutes, Capacity, Link, Active). The page shows the next 14 days, minus full ones.
 *   2. No slot that suits them (or none set up for that programme): they give preferred days and times,
 *      and staff confirm a time on WhatsApp, then set Slot (and Link) on the owner dashboard.
 *
 * What happens next (all automatic, from the daily job in Code.gs):
 *   - on the day of the class: a reminder email with the join link (if the slot has one),
 *   - if they enrol (an Enrolments row with the same email), the booking is marked Enrolled,
 *   - two days after the class (or a week after a request with no time set): one follow-up email
 *     with the enrolment link, unless they enrolled or the booking was cancelled.
 * Staff see every booking on the owner dashboard (Trials), with WhatsApp buttons, and set
 * Attended, No-show or Cancelled.
 *
 * SETUP: add this file, run Himaayah → Set up trial classes once (it creates both tabs with two
 * Madrasah slots to start you off: change or add rows as you like), then Deploy → New version.
 */

const TR_TAB = 'Trial classes';
const TR_HEAD = ['Ref', 'Booked', 'Programme', 'Plan', 'StudentName', 'Age', 'ParentName', 'Email', 'WhatsApp', 'Slot', 'Preferred', 'Status', 'Link',
                 'Reminded', 'FollowedUp', 'Enrolled', 'Notes'];
const TR_SLOTS_TAB = 'Trial slots';
const TR_SLOTS_HEAD = ['Programme', 'Day', 'Time', 'Length', 'Capacity', 'Link', 'Notes', 'Active'];
const TR_SEED = [['Madrasah', 'Monday', '20:30', '40', '3', '', 'Joins the Thāniyah Ibtidā’iyyah class', 'TRUE'],
                 ['Madrasah', 'Wednesday', '20:30', '40', '3', '', 'Joins the Thāniyah Ibtidā’iyyah class', 'TRUE']];
const TR_DAYS_AHEAD = 14;          // how far ahead slots are shown
const TR_MIN_HOURS = 3;            // a slot must be at least this many hours away to book it
const TR_FOLLOW_DAYS = 2;          // follow-up this many days after the class
const TR_PROGRAMMES = { 'Madrasah': 'madrasah', 'Academy': 'academy', 'Skills School': 'skills', 'Teenagers Building Circle': 'tbc' };
const TR_PAGE = 'https://www.himaayahschools.com/trial.html';

function tr_t_(name, head) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); }
  else {
    const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    head.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h).setFontWeight('bold'); } });
  }
  return table_(name);
}
function tr_try_(name) { try { return table_(name); } catch (e) { return { rows: [], head: [] }; } }
function tr_txt_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n); }
function tr_when_(slot) {   // "2026-10-26T20:30" → "Monday 26 Oct 2026 at 8:30pm"
  const m = String(slot || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return String(slot || '');
  const h = Number(m[2]), wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(dn_(m[1]) * 86400000).getUTCDay()];
  return wd + ' ' + nice_(m[1]).slice(4) + ' at ' + ((h % 12) || 12) + ':' + m[3] + (h < 12 ? 'am' : 'pm');
}
function tr_enrolLink_(programme) { return 'https://www.himaayahschools.com/enroll.html?programme=' + (TR_PROGRAMMES[programme] || ''); }

function trialSetup() {
  const sl = tr_t_(TR_SLOTS_TAB, TR_SLOTS_HEAD); tr_t_(TR_TAB, TR_HEAD);
  if (!sl.rows.some(function (r) { return r.Programme; })) sl.sh.getRange(2, 1, TR_SEED.length, TR_SLOTS_HEAD.length).setNumberFormat('@').setValues(TR_SEED);
  CacheService.getScriptCache().remove('tr_slots');
  const msg = 'Trial class tabs are ready. Change the slots in "' + TR_SLOTS_TAB + '" (add a Link so families get it in their reminder). Programmes with no slots still accept requests for a time.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

/* ===== ROUTER (called from doPost in Code.gs) ===== */
function trialsFromRequest(p) {
  try {
    const a = String(p.action || '');
    if (a === 'tr_slots') return tr_slots_();
    if (a === 'tr_book') return tr_book_(p);
    return { ok: false, error: 'Unknown action.' };
  } catch (err) { console.error(err); return { ok: false, error: 'Something went wrong. Please try again.' }; }
}

/* Every open slot in the next TR_DAYS_AHEAD days, with places left */
function tr_open_() {
  const slots = tr_try_(TR_SLOTS_TAB).rows.filter(function (r) { return r.Programme && key_(r.Active) !== 'FALSE'; });
  const taken = {};
  tr_try_(TR_TAB).rows.forEach(function (b) { if (b.Slot && String(b.Status) !== 'Cancelled') { const k = String(b.Programme) + '|' + String(b.Slot).slice(0, 16); taken[k] = (taken[k] || 0) + 1; } });
  const now = iso_(new Date(Date.now() + TR_MIN_HOURS * 3600000), true), today = today_(), out = [];
  for (let i = 0; i <= TR_DAYS_AHEAD; i++) {
    const day = new Date((dn_(today) + i) * 86400000).toISOString().slice(0, 10);
    const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(dn_(day) * 86400000).getUTCDay()];
    slots.forEach(function (s) {
      if (tt_day_(s.Day) !== wd) return;
      const time = tt_time_(s.Time); if (!time) return;
      const when = day + 'T' + time; if (when < now) return;
      const prog = String(s.Programme).trim(), cap = Math.max(1, Number(s.Capacity) || 1), left = cap - (taken[prog + '|' + when] || 0);
      if (left > 0) out.push({ id: prog + '|' + when, Programme: prog, Slot: when, Length: Number(s.Length) || 40, Left: left, Notes: String(s.Notes || ''), Link: String(s.Link || '') });
    });
  }
  return out.sort(function (a, b) { return a.Slot < b.Slot ? -1 : 1; });
}
function tr_slots_() {
  return { ok: true, timezone: 'Africa/Lagos', programmes: Object.keys(TR_PROGRAMMES),
           slots: tr_open_().map(function (s) { return { id: s.id, Programme: s.Programme, Slot: s.Slot, Length: s.Length, Left: s.Left, Notes: s.Notes }; }) };
}

function tr_book_(p) {
  if (String(p.website || '').trim()) return { ok: true, ref: 'TR-000000' };   // honeypot
  const d = {
    programme: tr_txt_(p.programme, 40), plan: tr_txt_(p.plan, 80), studentName: tr_txt_(p.studentName, 100), age: tr_txt_(p.age, 3).replace(/\D/g, ''),
    parentName: tr_txt_(p.parentName, 100), email: tr_txt_(p.email, 120).toLowerCase(), whatsapp: tr_txt_(p.whatsapp, 30), slot: tr_txt_(p.slot, 80), preferred: tr_txt_(p.preferred, 300)
  };
  if (!TR_PROGRAMMES[d.programme]) return { ok: false, error: 'Choose a programme.' };
  if (!d.studentName) return { ok: false, error: "Enter the student's name." };
  if (!d.parentName) return { ok: false, error: 'Enter your name.' };
  if (!validEmail_(d.email)) return { ok: false, error: 'Enter a valid email address.' };
  if (d.whatsapp.replace(/\D/g, '').length < 10) return { ok: false, error: 'Enter a WhatsApp number we can reach.' };
  if (!d.slot && d.preferred.length < 3) return { ok: false, error: 'Choose a time, or tell us which days and times suit you.' };
  const cache = CacheService.getScriptCache(), k = 'trial_' + d.email, n = Number(cache.get(k) || 0);
  if (n >= 3) return { ok: false, error: 'You have already booked. Message us on WhatsApp to change the time.' };
  const ref = 'TR-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  let chosen = null;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (d.slot) {
      chosen = tr_open_().filter(function (s) { return s.id === d.slot && s.Programme === d.programme; })[0];
      if (!chosen) return { ok: false, error: 'Sorry, that time has just filled up. Please choose another.' };
    }
    append_(tr_t_(TR_TAB, TR_HEAD), { Ref: ref, Booked: iso_(new Date(), true), Programme: d.programme, Plan: d.plan, StudentName: d.studentName, Age: d.age, ParentName: d.parentName,
      Email: d.email, WhatsApp: d.whatsapp, Slot: chosen ? chosen.Slot : '', Preferred: d.preferred, Status: chosen ? 'Booked' : 'Requested', Link: chosen ? chosen.Link : '' },
      ['Ref', 'Booked', 'Plan', 'StudentName', 'Age', 'ParentName', 'Email', 'WhatsApp', 'Slot', 'Preferred', 'Link']);
  } finally { lock.releaseLock(); }
  cache.put(k, String(n + 1), 86400);
  tr_confirm_({ Ref: ref, Programme: d.programme, StudentName: d.studentName, ParentName: d.parentName, Email: d.email, Slot: chosen ? chosen.Slot : '', Link: chosen ? chosen.Link : '', Preferred: d.preferred });
  try {
    if (MailApp.getRemainingDailyQuota() > 0) MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME, subject: SCHOOL_NAME + ': free class ' + (chosen ? 'booked' : 'requested') + ' (' + d.programme + ')',
      body: 'Student: ' + d.studentName + (d.age ? ', ' + d.age : '') + '\nProgramme: ' + d.programme + (d.plan ? ' — ' + d.plan : '') + '\nParent: ' + d.parentName + '\nEmail: ' + d.email + '\nWhatsApp: ' + d.whatsapp +
            '\n' + (chosen ? 'Time: ' + tr_when_(chosen.Slot) + (chosen.Link ? '' : '\n\nThis slot has no join link yet: send it on WhatsApp before the class.') : 'Preferred times: ' + d.preferred + '\n\nAgree a time on WhatsApp, then set it on the owner dashboard (Trials).') + '\n\nReference: ' + ref });
  } catch (e) { console.error(e); }
  return { ok: true, ref: ref, slot: chosen ? chosen.Slot : '', when: chosen ? tr_when_(chosen.Slot) : '' };
}
function tr_confirm_(b) {
  if (!validEmail_(b.Email) || MailApp.getRemainingDailyQuota() < 1) return;
  const first = String(b.ParentName || '').split(' ')[0], kid = String(b.StudentName || '').split(' ')[0];
  const body = b.Slot
    ? 'Your free ' + b.Programme + ' class for ' + kid + ' is booked for ' + tr_when_(b.Slot) + ' (Nigeria time).\n\n' + (b.Link ? 'Join here: ' + b.Link + '\n\n' : 'We will send you the join link on WhatsApp before the class.\n\n') +
      'Classes are live on Google Meet or Telegram. Please join a few minutes early from a quiet place, with a notebook. We will remind you on the day.'
    : 'Thank you for asking for a free ' + b.Programme + ' class for ' + kid + '. We will message you on WhatsApp within a day to agree a time' + (b.Preferred ? ' (you said: ' + b.Preferred + ')' : '') + '.';
  try {
    MailApp.sendEmail({ to: b.Email, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': your free class' + (b.Slot ? ' on ' + tr_when_(b.Slot) : ''),
      body: 'Assalaamu alaykum' + (first ? ' ' + first : '') + ',\n\n' + body + '\n\nYour reference is ' + b.Ref + '. Need to change the time? Reply to this email or message us on WhatsApp.\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
  } catch (e) { console.error(e); }
}

/* ===== daily job: reminders, enrolled check, follow-ups ===== */
function tr_dailyJob_() {
  let t;
  try { t = table_(TR_TAB); } catch (e) { return; }
  const today = today_(), enrolled = {};
  tr_try_(typeof EN_TAB === 'string' ? EN_TAB : 'Enrolments').rows.forEach(function (r) {
    [r.KinEmail, r.StudentEmail, r.LoginEmail].forEach(function (e) { e = String(e || '').toLowerCase(); if (e && (!enrolled[e] || iso_(r.Submitted, true) > enrolled[e])) enrolled[e] = iso_(r.Submitted, true); });   // latest enrolment per email
  });
  t.rows.forEach(function (b) {
    if (!b.Ref) return;
    const st = String(b.Status || ''), email = String(b.Email || '').toLowerCase(), slotDay = String(b.Slot || '').slice(0, 10);
    if (st === 'Cancelled' || st === 'Enrolled') return;
    // enrolled since booking?
    if (email && enrolled[email] && enrolled[email] >= String(iso_(b.Booked, true)).slice(0, 10)) {
      put_(t, b._row, 'Status', 'Enrolled'); put_(t, b._row, 'Enrolled', today, true); return;
    }
    if (MailApp.getRemainingDailyQuota() < 10) return;
    // reminder on the day
    if (slotDay === today && !b.Reminded && validEmail_(email)) {
      try {
        MailApp.sendEmail({ to: email, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': your free class is today',
          body: 'Assalaamu alaykum,\n\nA reminder that ' + String(b.StudentName || '').split(' ')[0] + "'s free " + b.Programme + ' class is today, ' + tr_when_(b.Slot) + ' (Nigeria time).\n\n' +
                (b.Link ? 'Join here: ' + b.Link : 'We will send the join link on WhatsApp shortly before the class.') + '\n\nSee you there, in shā’ Allāh.\n' + SCHOOL_NAME });
        put_(t, b._row, 'Reminded', iso_(new Date(), true), true);
      } catch (e) { console.error(e); }
    }
    // follow-up after the class (or a week after a request that never got a time)
    const due = slotDay ? dn_(today) - dn_(slotDay) >= TR_FOLLOW_DAYS : dn_(today) - dn_(iso_(b.Booked) || today) >= 7;
    if (due && !b.FollowedUp && st !== 'No-show' && validEmail_(email)) {
      try {
        MailApp.sendEmail({ to: email, name: SCHOOL_NAME, subject: SCHOOL_NAME + ': how was the class?',
          body: 'Assalaamu alaykum,\n\n' + (slotDay ? 'We hope ' + String(b.StudentName || '').split(' ')[0] + ' enjoyed the free ' + b.Programme + ' class.' : 'Thank you again for your interest in the ' + b.Programme + '.') +
                '\n\nWhen you are ready, you can enrol here: ' + tr_enrolLink_(b.Programme) + '\nIt takes about five minutes, and you can pay by card or bank transfer.\n\nAny questions? Just reply to this email or message us on WhatsApp.\n\nJazakumullahu khayran,\n' + SCHOOL_NAME });
        put_(t, b._row, 'FollowedUp', today, true);
      } catch (e) { console.error(e); }
    }
  });
}

/* ===== owner dashboard ===== */
function tr_summary_() {
  const rows = tr_try_(TR_TAB).rows.filter(function (b) { return b.Ref; }), month = today_().slice(0, 7), today = today_();
  const since = new Date((dn_(today) - 45) * 86400000).toISOString().slice(0, 10);
  const c = { month: 0, attended: 0, enrolled: 0, upcoming: 0, requests: 0 };
  rows.forEach(function (b) {
    const st = String(b.Status || '');
    if (iso_(b.Booked).slice(0, 7) === month) c.month++;
    if (st === 'Attended' || st === 'Enrolled') c.attended++;
    if (st === 'Enrolled') c.enrolled++;
    if (st === 'Requested') c.requests++;
    if (String(b.Slot || '').slice(0, 10) >= today && st === 'Booked') c.upcoming++;
  });
  c.rate = c.attended ? Math.round(100 * c.enrolled / c.attended) : null;
  const list = rows.filter(function (b) { return String(b.Slot || '').slice(0, 10) >= since || iso_(b.Booked) >= since || String(b.Status) === 'Requested'; })
    .map(function (b) {
      return { Ref: String(b.Ref), Booked: iso_(b.Booked, true), Programme: String(b.Programme || ''), Plan: String(b.Plan || ''), StudentName: String(b.StudentName || ''), Age: String(b.Age || ''),
               ParentName: String(b.ParentName || ''), Email: String(b.Email || ''), WhatsApp: String(b.WhatsApp || ''), Slot: String(b.Slot || '').slice(0, 16), Preferred: String(b.Preferred || ''),
               Status: String(b.Status || ''), Link: String(b.Link || ''), Notes: String(b.Notes || ''),
               WaLink: waLink_(b.WhatsApp, 'Assalaamu alaykum. This is Himaayah Schools about the free ' + b.Programme + ' class for ' + String(b.StudentName || '').split(' ')[0] + ' (' + b.Ref + ').') };
    }).sort(function (a, b) {
      const ka = a.Status === 'Requested' ? '0' : a.Slot >= today ? '1' + a.Slot : '2' + (a.Slot || a.Booked), kb = b.Status === 'Requested' ? '0' : b.Slot >= today ? '1' + b.Slot : '2' + (b.Slot || b.Booked);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  return { counts: c, list: list.slice(0, 80) };
}
function tr_save_(p) {
  const t = tr_t_(TR_TAB, TR_HEAD), b = t.rows.filter(function (r) { return String(r.Ref) === String(p.ref || ''); })[0];
  if (!b) return { ok: false, error: 'Booking not found.' };
  const status = String(p.status || b.Status);
  if (['Requested', 'Booked', 'Attended', 'No-show', 'Enrolled', 'Cancelled'].indexOf(status) < 0) return { ok: false, error: 'Unknown status.' };
  const slot = String(p.slot || '').trim();
  if (slot && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)) return { ok: false, error: 'Choose a date and time.' };
  const link = tr_txt_(p.link != null ? p.link : b.Link, 300);
  if (link && !/^https?:\/\//i.test(link)) return { ok: false, error: 'The link must start with https://' };
  const newSlot = slot && slot !== String(b.Slot || '').slice(0, 16);
  put_(t, b._row, 'Status', newSlot && status === 'Requested' ? 'Booked' : status);
  if (slot) put_(t, b._row, 'Slot', slot, true);
  put_(t, b._row, 'Link', link, true);
  if (p.notes != null) put_(t, b._row, 'Notes', tr_txt_(p.notes, 300), true);
  if (newSlot) put_(t, b._row, 'Reminded', '', true);
  let msg = 'Saved.';
  if (p.notify && (slot || b.Slot)) {
    tr_confirm_({ Ref: b.Ref, Programme: b.Programme, StudentName: b.StudentName, ParentName: b.ParentName, Email: b.Email, Slot: slot || String(b.Slot).slice(0, 16), Link: link });
    msg = 'Saved, and the family has been emailed the time' + (link ? ' and link.' : '.');
  }
  return { ok: true, message: msg };
}

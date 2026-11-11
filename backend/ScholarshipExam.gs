/**
 * ScholarshipExam.gs - the Himaayah Schools Scholarship entrance exam (UTME format, scored out of 400).
 *
 * HOW IT WORKS
 *  - An applicant signs in with the reference number and the email address on their application. Only applicants whose Status is
 *    'Verified' or 'Invited' can sit (the Scholarship tab is the list of who is allowed in).
 *  - They choose ONE track (five tracks, see SCX_TRACKS) and the paper is built for them: English (60 questions) plus three subjects (40 each).
 *    Each subject is scored out of 100, so the paper is out of 400. Pass mark is above 290 (SCH_PASS_ABOVE in Scholarship.gs).
 *  - The paper opens on SCX_OPENS (West Africa time) and nobody can START after SCX_LATEST_START. Once started, the timer is kept on the SERVER
 *    (SCX_MINUTES), so closing the tab or refreshing never gives extra time. Answers are saved as the student goes and marked on the server.
 *  - The correct answers never leave Apps Script. Questions and options are shuffled per applicant.
 *  - The mark is written to the ExamScore column of the Scholarship tab, ready for the 'Scholarship: rank the exam' menu item.
 *
 * EVERY TIME YOU CHANGE THE DATE: edit SCX_OPENS, SCX_LATEST_START below, then Deploy > Manage deployments > New version.
 */
const SCX_OPENS = '2026-12-30T09:00:00+01:00';          // PLACEHOLDER time: set the real start time
const SCX_LATEST_START = '2026-12-30T11:00:00+01:00';   // nobody can start after this
const SCX_MINUTES = 120;                                // like the real UTME
const SCX_GRACE_SEC = 45;                               // allowed for the last save to arrive
const SCX_TAB = 'ScholarshipExam';
const SCX_HEAD = ['Ref', 'Name', 'Track', 'Started', 'Deadline', 'Answers', 'Switches', 'Submitted', 'How', 'English', 'Subject2', 'Subject3', 'Subject4', 'Total'];
const SCX_TRACKS = {
  sci: { name: 'Sciences and Medicine', subjects: ['English', 'Biology', 'Chemistry', 'Physics'] },
  eng: { name: 'Engineering and Technology', subjects: ['English', 'Mathematics', 'Physics', 'Chemistry'] },
  soc: { name: 'Social Sciences and Management', subjects: ['English', 'Mathematics', 'Economics', 'Government'] },
  art: { name: 'Arts, Law and Humanities', subjects: ['English', 'Literature', 'Government', 'Islamic Studies'] },
  com: { name: 'Commercial and Accounting', subjects: ['English', 'Mathematics', 'Economics', 'Accounting'] }
};

function scx_hash_(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function scx_rng_(seed) { let a = scx_hash_(seed); return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function scx_shuffle_(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function scx_t_(iso) { return new Date(iso).getTime(); }

// The paper for one applicant and track. Returns [{ id, s, p, q, o:[text...], k:index of the right option in o }]
function scx_paper_(ref, trackKey) {
  const tr = SCX_TRACKS[trackKey]; if (!tr) return null;
  const out = [];
  tr.subjects.forEach(function (sub, si) {
    const qs = SCX_BANK[sub] || [];
    const order = scx_shuffle_(qs.map(function (_, i) { return i; }), scx_rng_(ref + '|' + sub));
    order.forEach(function (qi) {
      const b = qs[qi], id = 's' + si + 'q' + qi;
      const opts = scx_shuffle_([0, 1, 2, 3], scx_rng_(ref + '|' + id));       // opts[pos] = original index (0 is the right one)
      out.push({ id: id, s: sub, p: b[1] || '', q: b[0], o: opts.map(function (oi) { return b[2 + oi]; }), k: opts.indexOf(0) });
    });
  });
  return out;
}
function scx_public_(paper) { return paper.map(function (x) { return { id: x.id, s: x.s, p: x.p, q: x.q, o: x.o }; }); }

function scx_mark_(paper, track, answers) {
  const tr = SCX_TRACKS[track], right = {}, count = {};
  tr.subjects.forEach(function (s) { right[s] = 0; count[s] = 0; });
  paper.forEach(function (x) { count[x.s]++; if (answers && answers[x.id] === x.k) right[x.s]++; });
  const sc = tr.subjects.map(function (s) { return Math.round(right[s] / count[s] * 10000) / 100; });
  const total = Math.round(sc.reduce(function (a, b) { return a + b; }, 0) * 100) / 100;
  return { scores: sc, total: total };
}

function scx_sheet_() {
  const ss = ss_(); let sh = ss.getSheetByName(SCX_TAB);
  if (!sh) { sh = ss.insertSheet(SCX_TAB); sh.getRange(1, 1, 1, SCX_HEAD.length).setValues([SCX_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
function scx_find_(sh, ref) {
  const last = sh.getLastRow(); if (last < 2) return -1;
  const refs = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < refs.length; i++) if (String(refs[i][0]).trim().toUpperCase() === ref) return i + 2;
  return -1;
}
function scx_applicant_(ref, email) {
  ref = String(ref || '').trim().toUpperCase(); email = String(email || '').trim().toLowerCase();
  if (!ref || !email) return { error: 'Enter your reference number and your email address.' };
  const sh = sch_sheet_(), last = sh.getLastRow();
  if (last < 2) return { error: 'We could not find an application with those details.' };
  const rows = sh.getRange(2, 1, last - 1, SCH_HEAD.length).getValues(), c = function (h) { return SCH_HEAD.indexOf(h); };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[c('Ref')]).trim().toUpperCase() === ref && String(r[c('Email')]).trim().toLowerCase() === email) {
      const st = String(r[c('Status')]).trim();
      if (st === 'Disqualified') return { error: 'This application is not eligible for the exam. Please contact the school.' };
      if (st === 'Received') return { error: 'Your result has not been verified yet. We will email you when you are invited to the exam.' };
      if (['Verified', 'Invited', 'Awarded', 'Reserve', 'Not selected'].indexOf(st) < 0) return { error: 'This application is not eligible for the exam. Please contact the school.' };
      return { ref: ref, name: String(r[c('Name')]), row: i + 2 };
    }
  }
  return { error: 'We could not find an application with those details. Check the reference number and the email you applied with.' };
}

function scx_state_(a, att) {
  const now = Date.now(), base = { ok: true, name: a.name, ref: a.ref, now: now, opens: scx_t_(SCX_OPENS), latest: scx_t_(SCX_LATEST_START), minutes: SCX_MINUTES };
  base.tracks = Object.keys(SCX_TRACKS).map(function (k) { return { key: k, name: SCX_TRACKS[k].name, subjects: SCX_TRACKS[k].subjects }; });
  if (att && att.submitted) { base.state = 'done'; return base; }
  if (att) { base.state = 'running'; base.track = att.track; base.deadline = att.deadline; return base; }
  if (now < base.opens) base.state = 'wait';
  else if (now > base.latest) base.state = 'closed';
  else base.state = 'ready';
  return base;
}
function scx_attempt_(sh, row) {
  if (row < 0) return null;
  const v = sh.getRange(row, 1, 1, SCX_HEAD.length).getValues()[0];
  let ans = {}; try { ans = JSON.parse(v[5] || '{}'); } catch (e) {}
  return { row: row, ref: String(v[0]), track: String(v[2]), started: Number(v[3]), deadline: Number(v[4]), answers: ans, switches: Number(v[6] || 0), submitted: v[7] !== '' && v[7] !== null && v[7] !== undefined };
}
function scx_finish_(sh, att, how) {
  const paper = scx_paper_(att.ref, att.track), m = scx_mark_(paper, att.track, att.answers);
  const now = new Date(), tz = tz_();
  sh.getRange(att.row, 8, 1, 7).setValues([[Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss'), how, m.scores[0], m.scores[1], m.scores[2], m.scores[3], m.total]]);
  const ssh = sch_sheet_(), last = ssh.getLastRow(), refs = ssh.getRange(2, SCH_HEAD.indexOf('Ref') + 1, last - 1, 1).getValues();
  for (let i = 0; i < refs.length; i++) if (String(refs[i][0]).trim().toUpperCase() === att.ref) { ssh.getRange(i + 2, SCH_HEAD.indexOf('ExamScore') + 1).setValue(Math.round(m.total * 10) / 10); break; }
  att.submitted = true; return m;
}

function scholarshipExamFromRequest(p) {
  try {
    const op = String(p.op || '');
    if (op === 'info') return { ok: true, now: Date.now(), opens: scx_t_(SCX_OPENS), latest: scx_t_(SCX_LATEST_START), minutes: SCX_MINUTES };
    const a = scx_applicant_(p.ref, p.email); if (a.error) return { ok: false, error: a.error };
    const cache = CacheService.getScriptCache(), k = 'scxtry' + a.ref, n = Number(cache.get(k) || 0);
    if (n > 400) return { ok: false, error: 'Too many requests. Please wait a few minutes.' };
    cache.put(k, String(n + 1), 600);

    const lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      const sh = scx_sheet_(); let row = scx_find_(sh, a.ref), att = scx_attempt_(sh, row);
      // time is up and nothing was submitted: mark what was saved
      if (att && !att.submitted && Date.now() > att.deadline + SCX_GRACE_SEC * 1000) { scx_finish_(sh, att, 'auto'); }

      if (op === 'login') return scx_state_(a, att);

      if (op === 'start') {
        if (att) return scx_state_(a, att);                                         // resume
        const now = Date.now();
        if (now < scx_t_(SCX_OPENS)) return { ok: false, error: 'The exam has not opened yet.' };
        if (now > scx_t_(SCX_LATEST_START)) return { ok: false, error: 'The time to start the exam has passed.' };
        const track = String(p.track || ''); if (!SCX_TRACKS[track]) return { ok: false, error: 'Choose a track.' };
        const deadline = now + SCX_MINUTES * 60000, tz = tz_();
        sh.appendRow([a.ref, a.name, track, now, deadline, '{}', 0, '', '', '', '', '', '', '']);
        row = sh.getLastRow(); att = scx_attempt_(sh, row);
        return scx_state_(a, att);
      }
      if (!att) return { ok: false, error: 'Start the exam first.' };

      if (op === 'paper') {
        if (att.submitted) return { ok: false, error: 'You have already submitted your exam.' };
        const paper = scx_paper_(a.ref, att.track);
        const s = scx_state_(a, att); s.paper = scx_public_(paper); s.answers = att.answers; return s;
      }
      if (op === 'save' || op === 'submit') {
        if (att.submitted) return { ok: true, state: 'done', now: Date.now() };
        const late = Date.now() > att.deadline + SCX_GRACE_SEC * 1000;
        if (!late && p.answers && typeof p.answers === 'object') {
          const clean = {}; Object.keys(p.answers).forEach(function (id) { const v = Number(p.answers[id]); if (/^s\dq\d+$/.test(id) && v >= 0 && v <= 3) clean[id] = v; });
          att.answers = clean;
          sh.getRange(att.row, 6).setValue(JSON.stringify(clean));
          if (p.switches !== undefined) sh.getRange(att.row, 7).setValue(Math.min(999, Number(p.switches) || 0));
        }
        if (op === 'save') return { ok: true, now: Date.now(), deadline: att.deadline, late: late };
        scx_finish_(sh, att, late ? 'late-auto' : 'student');
        return { ok: true, state: 'done', now: Date.now() };
      }
      return { ok: false, error: 'Unknown request.' };
    } finally { lock.releaseLock(); }
  } catch (e) {
    console.error(e); return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

// Menu: after the exam, mark every attempt that was never submitted (from the answers that were saved)
function scholarshipExamFinalise() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const sh = scx_sheet_(), last = sh.getLastRow(); let n = 0;
    for (let r = 2; r <= last; r++) {
      const att = scx_attempt_(sh, r);
      if (att && !att.submitted && Date.now() > att.deadline + SCX_GRACE_SEC * 1000) { scx_finish_(sh, att, 'auto'); n++; }
    }
    sch_say_(n + ' unsubmitted attempt(s) marked. The scores are in the ExamScore column of the Scholarship tab.');
  } finally { lock.releaseLock(); }
}

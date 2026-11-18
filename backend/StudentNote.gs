/**
 * A personal note for each Madrasah student, written from their own record.
 * Add this as a NEW file next to Code.gs. Every name starts with "sn_", so it cannot clash with anything.
 *
 * sn_build_(payload) reads what the dashboard payload already holds (attendance, marks, test results, recitation marks,
 * the daily routine, hifdh progress) and returns { title, greeting, paragraphs, focus, mood, asOf }.
 * Nothing is invented: every sentence rests on a number or a word from the student's own record, and when there is
 * not enough to say, the note says so honestly. The wording rotates by student and by week, so it does not read
 * the same every visit, yet it stays the same within a week.
 */
const SN_MIN_ATTENDANCE = 5;      // classes before a percentage means something

function sn_hash_(s) { let h = 7; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function sn_pick_(list, seed, salt) { return list[sn_hash_(seed + '|' + salt) % list.length]; }
function sn_days_(iso) { return Math.floor(Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') / 86400000); }
function sn_pct_(a, b) { return b > 0 ? Math.round(100 * a / b) : null; }
function sn_num_(v) { return v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v); }
function sn_first_(name) { return String(name || '').trim().split(/\s+/)[0] || 'dear student'; }
function sn_list_(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
function sn_plural_(n, one, many) { return n === 1 ? one : many; }
function sn_clip_(t, n) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n), at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return at > 40 ? cut.slice(0, at + 1) : cut.replace(/\s+\S*$/, '') + '...';
}

/* ===== 1. READ THE RECORD ===== */
function sn_stats_(p, today) {
  const st = p.student || {}, out = {};
  const total = Number(st.AttendanceTotal) || 0, present = Number(st.AttendancePresent) || 0;
  out.att = total >= SN_MIN_ATTENDANCE ? { present: present, total: total, pct: sn_pct_(present, total) } : null;

  const A = p.assignments || [];
  const marked = A.filter(function (a) { return a.Status === 'Marked' && a.Submission; });
  const scored = marked.map(function (a) { const s = sn_num_(a.Submission.Score), m = sn_num_(a.MaxScore); return { title: a.Title, subject: a.Subject || '', score: s, max: m, pct: s !== null && m ? Math.round(100 * s / m) : null, late: !!a.Submission.Late }; });
  const pcts = scored.filter(function (x) { return x.pct !== null; });
  const best = pcts.slice().sort(function (a, b) { return b.pct - a.pct; })[0] || null;
  out.asg = {
    count: A.length, marked: marked.length,
    avg: pcts.length ? Math.round(pcts.reduce(function (n, x) { return n + x.pct; }, 0) / pcts.length) : null,
    best: best, late: scored.filter(function (x) { return x.late; }).length,
    overdue: A.filter(function (a) { return a.Status === 'Overdue'; }),
    waiting: A.filter(function (a) { return a.Status === 'Submitted'; }).length,
    todo: A.filter(function (a) { return a.Status === 'To do'; }).sort(function (a, b) { return String(a.Due || '9999') < String(b.Due || '9999') ? -1 : 1; })
  };

  const R = (p.results || []).map(function (r) { return { date: String(r.Date || ''), subject: String(r.Subject || ''), pct: sn_pct_(Number(r.Score), Number(r.OutOf)) }; }).filter(function (r) { return r.subject && r.pct !== null; });
  const by = {};
  R.forEach(function (r) { (by[r.subject] = by[r.subject] || []).push(r.pct); });
  const subjects = Object.keys(by).map(function (k) { return { subject: k, pct: Math.round(by[k].reduce(function (n, x) { return n + x; }, 0) / by[k].length), n: by[k].length }; });
  subjects.sort(function (a, b) { return b.pct - a.pct; });
  let trend = null;
  if (R.length >= 4) {
    const s = R.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }), half = Math.floor(s.length / 2);
    const avg = function (x) { return x.reduce(function (n, r) { return n + r.pct; }, 0) / x.length; };
    const d = Math.round(avg(s.slice(half)) - avg(s.slice(0, half)));
    trend = d >= 5 ? 'up' : d <= -5 ? 'down' : 'flat';
  }
  out.res = { n: R.length, avg: R.length ? Math.round(R.reduce(function (n, r) { return n + r.pct; }, 0) / R.length) : null, subjects: subjects, trend: trend,
              best: subjects.length >= 2 ? subjects[0] : null, worst: subjects.length >= 2 ? subjects[subjects.length - 1] : null };

  const rec = p.recordings || {}, items = rec.items || [];
  const rm = items.filter(function (x) { return x.Status === 'Marked'; }).sort(function (a, b) { return String(a.Submitted) < String(b.Submitted) ? 1 : -1; });
  const recent = rm.slice(0, 4), crit = { Memorisation: [], Tajwid: [], Fluency: [] }, OUT = { Memorisation: 10, Tajwid: 10, Fluency: 5 };
  recent.forEach(function (x) { Object.keys(crit).forEach(function (k) { const v = sn_num_(x[k]); if (v !== null) crit[k].push(100 * v / OUT[k]); }); });
  const cavg = Object.keys(crit).filter(function (k) { return crit[k].length; }).map(function (k) { return { key: k, pct: Math.round(crit[k].reduce(function (n, x) { return n + x; }, 0) / crit[k].length) }; }).sort(function (a, b) { return a.pct - b.pct; });
  const totals = recent.map(function (x) { return x.Total && Number(x.Total.OutOf) ? sn_pct_(Number(x.Total.Score), Number(x.Total.OutOf)) : null; }).filter(function (v) { return v !== null; });
  const fb = rm.filter(function (x) { return String(x.Feedback || '').trim(); })[0];
  out.rec = { enabled: !!rec.enabled, marked: rm.length, waiting: items.filter(function (x) { return x.Status === 'Waiting'; }).length, sent: items.length,
    avg: totals.length ? Math.round(totals.reduce(function (n, v) { return n + v; }, 0) / totals.length) : null,
    weakest: cavg.length >= 2 && cavg[cavg.length - 1].pct - cavg[0].pct >= 8 ? cavg[0] : null, strongest: cavg.length >= 2 ? cavg[cavg.length - 1] : null,
    feedback: fb ? { text: sn_clip_(fb.Feedback, 150), portion: fb.Portion || '' } : null,
    lastDays: items.length ? today && sn_days_(today) - sn_days_(items.map(function (x) { return String(x.Submitted); }).sort().pop()) : null };

  const rt = p.routine || {};
  out.rt = rt.enabled ? { streak: Number(rt.streak) || 0, best: Number(rt.best) || 0, full: Number(rt.fullDays) || 0 } : null;
  const mem = (p.hifdh || []).filter(function (h) { return String(h.Status) === 'Memorised'; }).length;
  out.hif = { juz: Number(st.Juz) || 0, surah: String(st.CurrentSurah || '').trim(), ayah: Number(st.CurrentAyah) || 0, memorised: mem };

  const sig = [out.att && out.att.pct, out.asg.avg, out.res.avg, out.rec.avg].filter(function (v) { return v !== null && v !== undefined; });
  out.signals = sig.length;
  const mean = sig.length ? sig.reduce(function (n, v) { return n + v; }, 0) / sig.length : null;
  out.mood = !sig.length || (sig.length === 1 && !out.att) ? 'new' : mean >= 85 ? 'strong' : mean >= 72 ? 'steady' : mean >= 58 ? 'building' : 'struggling';
  if (out.asg.overdue.length >= 2 && out.mood === 'strong') out.mood = 'steady';
  return out;
}

/* ===== 2. WRITE IT ===== */
const SN_CRIT = {
  Memorisation: 'memorisation, how securely you hold the āyāt',
  Tajwid: 'tajwīd, the rules of recitation',
  Fluency: 'fluency, how smoothly you move from one āyah to the next'
};
const SN_CRIT_SHORT = { Memorisation: 'memorisation', Tajwid: 'tajwīd', Fluency: 'fluency' };

function sn_compose_(S, name, seed) {
  const first = sn_first_(name), pick = function (list, salt) { return sn_pick_(list, seed, salt); }, P = [];

  /* opening, honest about the overall picture */
  const open = {
    strong: [
      'Looking across your attendance, your marks and your recitation, one thing is clear: you are taking this seriously, and your record shows it.',
      'I have read your whole record, and it is a good one. What you are doing is not luck. It is steady effort, and it is visible.'],
    steady: [
      'Your record shows a student who is on the right road. There is real progress in it, and there is room to grow, which is exactly where a good student should be.',
      'I have read through your record. You are doing well, and what follows is about turning a good term into a strong one.'],
    building: [
      'Your record shows a student who is still finding their rhythm. That is not a criticism. It is the honest starting point, and it can change quickly with a few steady weeks.',
      'I have read your record carefully. Some parts are working and some need attention, and I would rather tell you plainly than flatter you.'],
    struggling: [
      'I will be direct with you, because you deserve that: your record shows that this term has been hard so far. The good news is that every part of it can be improved, and it can start this week.',
      'Your record tells me this has not been an easy stretch. Please do not read that as failure. Read it as a clear list of where to put your effort next.'],
    'new': [
      'It is still early, so there is not much in your record to read yet. As you attend classes and your teacher marks your work, this note will begin to describe you in detail.']
  };
  P.push(pick(open[S.mood], 'open'));

  /* showing up: attendance and the daily routine */
  const c = [];
  if (S.att) {
    const a = S.att, n = a.present + ' of ' + a.total;
    if (a.pct >= 90) c.push(pick(['You have been in ' + n + ' classes (' + a.pct + '%). Showing up is the one part of learning that nobody can do for you, and you are doing it.', 'Your attendance is ' + a.pct + '% (' + n + ' classes). That is the foundation everything else stands on.'], 'att'));
    else if (a.pct >= 75) c.push('You have attended ' + n + ' classes (' + a.pct + '%). That is a decent base. Each class you add now makes the next lesson easier, because the lessons build on one another.');
    else c.push('You have attended ' + n + ' classes (' + a.pct + '%). I want to be honest: the gaps are beginning to show, and they are the first thing to fix. A missed class is rarely missed once; the gaps pile up quietly.');
  }
  if (S.rt) {
    const r = S.rt;
    if (r.streak >= 7) c.push('Your daily routine has run ' + r.streak + ' days in a row' + (r.best > r.streak ? ', and your best is ' + r.best : ', which is your best so far') + '. This quiet repetition is exactly how hifdh is kept.');
    else if (r.streak >= 3) c.push('Your routine streak stands at ' + r.streak + ' days. Protect it. Three days becomes a habit only if you do not let the fourth slip.');
    else if (r.full > 0) c.push('Your routine streak is at ' + r.streak + ' today, but you have completed ' + r.full + ' full ' + sn_plural_(r.full, 'day', 'days') + ' so far. A streak is rebuilt one day at a time, so begin again today.');
    else c.push('You have not completed a full routine day yet. Do one full day, even a modest one, and let that be the start of the chain.');
  }
  if (c.length) P.push(c.join(' '));

  /* the work: assignments and tests */
  const w = [], A = S.asg, R = S.res;
  if (A.marked) {
    let t = A.marked === 1 ? 'Your marked assignment' + (A.best ? ', "' + A.best.title + '",' : '') + ' ' + (A.avg !== null ? 'scored ' + A.avg + '%' : 'has been marked')
      : 'Your ' + A.marked + ' marked assignments ' + (A.avg !== null ? 'average ' + A.avg + '%' : 'have been marked');
    if (A.best && A.marked > 1) t += ', and your strongest piece was "' + A.best.title + '" (' + A.best.score + '/' + A.best.max + ')';
    w.push(t + '.');
    if (A.late) w.push((A.late === 1 ? 'One of them' : A.late + ' of them') + ' came in after the deadline. Try handing in a day early, so a poor connection can never cost you marks.');
  }
  if (A.overdue.length) {
    const t = A.overdue.slice(0, 2).map(function (a) { return '"' + a.Title + '"'; });
    w.push((A.overdue.length > 2 ? t.join(', ') + ' and ' + (A.overdue.length - 2) + ' more' : sn_list_(t)) + ' ' + sn_plural_(A.overdue.length, 'is', 'are') + ' overdue. Send what you have, even if it is unfinished. Something handed in is always better than nothing.');
  } else if (A.todo.length) {
    const a = A.todo[0];
    w.push('Your next assignment is "' + a.Title + '"' + (a.Due ? ', due ' + sn_niceDate_(a.Due) : '') + '. Starting early is the easiest way to do it well.');
  } else if (A.waiting) w.push(A.waiting + ' ' + sn_plural_(A.waiting, 'piece is', 'pieces are') + ' waiting for your teacher to mark. Nothing more is needed from you there.');
  if (R.n) {
    let t = 'In your tests you are averaging ' + R.avg + '%';
    if (R.best && R.worst && R.best.subject !== R.worst.subject && R.best.pct - R.worst.pct >= 6) t += ', with ' + R.best.subject + ' your strongest subject (' + R.best.pct + '%) and ' + R.worst.subject + ' the one that needs the most care (' + R.worst.pct + '%)';
    t += '.';
    if (R.trend === 'up') t += ' Your more recent results are better than your earlier ones, so the work is paying off.';
    else if (R.trend === 'down') t += ' Your more recent results are lower than your earlier ones. That is worth looking at now, before it grows.';
    w.push(t);
  }
  if (w.length) P.push(w.join(' '));

  /* the Qurʼān: recitation and hifdh */
  const q = [], C = S.rec, H = S.hif;
  if (C.marked) {
    let t = 'Your teacher has marked ' + C.marked + ' of your ' + sn_plural_(C.marked, 'recitation', 'recitations') + (C.avg !== null ? ', and they average ' + C.avg + '%' : '');
    t += '.';
    if (C.weakest) t += ' The part to work on is ' + SN_CRIT[C.weakest.key] + '. It is your lowest area, at about ' + C.weakest.pct + '%.' + (C.strongest && C.strongest.key !== C.weakest.key ? ' Your strongest is ' + SN_CRIT_SHORT[C.strongest.key] + '.' : '');
    q.push(t);
    if (C.feedback) q.push('Your teacher\'s latest advice' + (C.feedback.portion ? ' on ' + C.feedback.portion : '') + ': "' + C.feedback.text + '"');
  } else if (C.waiting) q.push('You have ' + C.waiting + ' ' + sn_plural_(C.waiting, 'recitation', 'recitations') + ' waiting for your teacher. Sending recitations regularly is the fastest way to improve, because it is the only way you can be heard and corrected.');
  else if (C.enabled) q.push('You have not sent a recitation yet. Record a short passage this week. It does not need to be perfect; it needs to be sent.');
  if (H.juz > 0 || H.surah) q.push('You are' + (H.juz > 0 ? ' at Juz ' + H.juz : '') + (H.surah ? (H.juz > 0 ? ', currently in ' : ' currently in ') + H.surah + (H.ayah ? ', āyah ' + H.ayah : '') : '') + '.' + (H.memorised > 0 ? ' ' + H.memorised + ' ' + sn_plural_(H.memorised, 'sūrah is', 'sūrahs are') + ' marked as memorised.' : ''));
  if (q.length) P.push(q.join(' '));

  /* reading the signals together: what the numbers say when put side by side */
  const ins = sn_insight_(S);
  if (ins) P.push(ins);

  /* the one thing for this week */
  let focus = '';
  if (A.overdue.length) focus = 'Hand in "' + A.overdue[0].Title + '" first, even if it is not perfect.';
  else if (S.att && S.att.pct < 75) focus = 'Do not miss a single class this week.';
  else if (C.weakest) focus = 'Record one recitation this week and give extra care to ' + SN_CRIT_SHORT[C.weakest.key] + '.';
  else if (C.enabled && !C.sent) focus = 'Send your first recitation to your teacher.';
  else if (S.rt && S.rt.streak === 0) focus = 'Complete one full routine day today, and start the chain again.';
  else if (R.trend === 'down' && R.worst) focus = 'Give ' + R.worst.subject + ' an extra short session each day this week.';
  else if (A.todo.length) focus = 'Begin "' + A.todo[0].Title + '" early this week.';
  else focus = pick(['Keep doing what you are already doing, and revise yesterday\'s lesson before today\'s.', 'Hold your rhythm. Small, steady effort is what carries a student through the whole year.'], 'focus');

  const close = pick(['May Allah make it easy for you and place barakah in your effort.', 'Jazakallāhu khayran for your effort. May Allah keep you sincere and steady.', 'May Allah open your heart to His Book and make your work a source of reward.'], 'close');
  return { title: 'A note for you', greeting: 'Assalāmu ʻalaykum, ' + first + '.', paragraphs: P, focus: focus, closing: close, mood: S.mood };
}
function sn_insight_(S) {
  const att = S.att ? S.att.pct : null, asg = S.asg.avg, rec = S.rec.avg, res = S.res.avg, written = asg !== null ? asg : res;
  if (att !== null && att < 75 && [asg, rec, res].some(function (v) { return v !== null && v >= 75; }))
    return 'Notice something in your own record: when you are present, you do well. The difficulty is presence, not ability, and presence is entirely in your hands.';
  if (att !== null && att >= 90 && ((S.rec.weakest) || (written !== null && written < 75) || (rec !== null && rec < 75)))
    return 'Your attendance shows real commitment. What remains is precision, not effort, and that is the easier problem to solve.';
  if (S.rt && S.rt.streak >= 7 && S.rec.enabled && !S.rec.sent)
    return 'You keep your routine faithfully, but your teacher has not yet heard you recite. Let the effort you put in privately be heard, so it can be corrected and rewarded.';
  if (written !== null && rec !== null && written >= 80 && rec < 70)
    return 'You are strong in written work and still growing in recitation. Put your next effort where you are weaker; that is where the quickest gains are.';
  if (written !== null && rec !== null && rec >= 80 && written < 65)
    return 'Your recitation is strong, but your written work is behind it. A student who can recite well can also write well; give your assignments the same patience.';
  return '';
}
function sn_niceDate_(iso) {
  const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], d = String(iso).slice(0, 10).split('-');
  return d.length === 3 ? Number(d[2]) + ' ' + m[Number(d[1]) - 1] : String(iso);
}

/* ===== 3. ATTACH TO THE DASHBOARD PAYLOAD ===== */
function sn_build_(p) {
  const today = today_(), st = p.student || {};
  const S = sn_stats_(p, today);
  const note = sn_compose_(S, st.Name, String(st.StudentID) + '|' + Math.floor(sn_days_(today) / 7));
  note.asOf = today;
  return note;
}

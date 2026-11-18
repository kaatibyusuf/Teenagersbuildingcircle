/**
 * ProgrammeNotes.gs - the personal note on the Teenagers Building Circle, Skills School and Academy portals.
 * Same idea as StudentNote.gs (Madrasah): read the student's own record, say what is going well, what needs care, and one thing to do this week.
 * No AI is used. The wording rotates by student and week, and the note is attached to the dashboard payload by the three wrappers at the bottom.
 * pn_build_(kind, payload) returns { title, greeting, paragraphs, focus, closing, mood, asOf }, or null when there is nothing honest to say yet.
 */

/* ----- shared: turn a list of assignments / projects / tasks into the facts a note needs ----- */
function pn_work_(items, o) {
  const T = o.title, st = o.status, sc = o.score, mx = o.max, due = o.due;
  const list = (items || []).map(function (x) {
    const s = sn_num_(sc(x)), m = sn_num_(mx(x)), stt = String(st(x) || '');
    return { title: String(T(x) || ''), status: stt === 'Missed' ? 'Overdue' : stt, due: String(due(x) || ''), pct: s !== null && m ? Math.round(100 * s / m) : null };
  }).filter(function (x) { return x.title; });
  const marked = list.filter(function (x) { return x.status === 'Marked'; }), pc = marked.filter(function (x) { return x.pct !== null; });
  const best = pc.slice().sort(function (a, b) { return b.pct - a.pct; })[0] || null;
  return {
    count: list.length, marked: marked.length,
    avg: pc.length ? Math.round(pc.reduce(function (n, x) { return n + x.pct; }, 0) / pc.length) : null,
    best: pc.length >= 2 ? best : null,
    overdue: list.filter(function (x) { return x.status === 'Overdue'; }),
    waiting: list.filter(function (x) { return x.status === 'Submitted'; }).length,
    todo: list.filter(function (x) { return x.status === 'To do'; }).sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; })
  };
}
function pn_quote_(a) { return a.map(function (x) { return '“' + x.title + '”'; }); }
function pn_overdueText_(W, pick) {
  const n = W.overdue.length; if (!n) return '';
  if (n === 1) return pick(['“' + W.overdue[0].title + '” is overdue. Hand it in even if it is late; late work still teaches you something, and missing work teaches nothing.', 'One piece is overdue: “' + W.overdue[0].title + '”. Do it now, even imperfectly, so it stops weighing on you.'], 'od1');
  const names = pn_quote_(W.overdue.slice(0, 2)), more = n > 2 ? ' and ' + (n - 2) + ' more' : '';
  return n + ' pieces are overdue, ' + sn_list_(names) + more + '. Start with the oldest and finish one a day; it is easier than it looks once the first one is done.';
}
function pn_workText_(W, label, pick) {
  if (!W.count) return 'No ' + label + ' has been set for you yet. When it is, it will be reflected here.';
  const bits = [];
  if (W.avg !== null) bits.push('Your marked ' + label + ' averages ' + W.avg + '% across ' + W.marked + ' ' + sn_plural_(W.marked, 'piece', 'pieces') + (W.best ? ', and “' + W.best.title + '”, at ' + W.best.pct + '%, is your best so far' : '') + '.');
  else if (W.marked) bits.push('Some of your ' + label + ' has been marked, without a score to compare yet.');
  else bits.push('None of your ' + label + ' has been marked yet, so there is no score to speak about.');
  if (W.avg !== null) bits.push(W.avg >= 80 ? pick(['That is strong work.', 'That is a standard to be proud of.'], 'wa') : W.avg >= 60 ? pick(['That is solid, and the next jump comes from reading your feedback closely.', 'That is a good base. Read the feedback on each piece; it tells you exactly where the marks went.'], 'wb') : 'That is below where you can be. Read each piece of feedback and fix one thing at a time.');
  const od = pn_overdueText_(W, pick); if (od) bits.push(od);
  if (W.waiting) bits.push(W.waiting + ' ' + sn_plural_(W.waiting, 'piece is', 'pieces are') + ' with your teacher waiting to be marked.');
  return bits.join(' ');
}
function pn_attText_(present, total, what, pick) {
  if (total < SN_MIN_ATTENDANCE) return '';
  const pct = sn_pct_(present, total);
  if (pct >= 85) return pick(['You have been present for ' + present + ' of ' + total + ' ' + what + ' (' + pct + '%). That steadiness is what carries a person through a whole programme, and it shows.', 'Your attendance stands at ' + pct + '%, ' + present + ' of ' + total + ' ' + what + '. Showing up this faithfully is more than half of success.'], 'at');
  if (pct >= 60) return 'You have made ' + present + ' of ' + total + ' ' + what + ' (' + pct + '%). That is decent, and it can be better. Every ' + what.replace(/s$/, '') + ' you attend is one the others will not have to repeat for you.';
  return 'You have made ' + present + ' of ' + total + ' ' + what + ' (' + pct + '%). We would like to see more of you. If something is in the way, tell your teacher, because it is easier to fix together than to watch it grow.';
}
function pn_nice_(iso) { return sn_niceDate_(iso); }
function pn_close_(pick) { return pick(['May Allah make it easy for you and place barakah in your effort.', 'Jazakallāhu khayran for your effort. May Allah keep you sincere and steady.', 'May Allah reward every honest step you take, however small it feels.'], 'close'); }
function pn_wrap_(first, P, focus, mood, pick, today, signals) {
  P = P.filter(Boolean);
  if (!signals || P.length < 2) return null;   // nothing real to say yet: no note is better than an empty one
  return { title: 'A note for you', greeting: 'Assalāmu ʻalaykum, ' + first + '.', paragraphs: P, focus: focus, closing: pn_close_(pick), mood: mood, asOf: today };
}

/* ----- Teenagers Building Circle ----- */
function pn_tbc_(p, pick, first, today) {
  const s = p.student || {}, P = [], att0 = (Number(s.AttendanceTotal) || 0) >= SN_MIN_ATTENDANCE ? 1 : null;
  P.push(pn_attText_(Number(s.AttendancePresent) || 0, Number(s.AttendanceTotal) || 0, 'sessions', pick));
  const pil = (p.pillars || []).filter(function (x) { return Number(x.Rating) > 0; });
  if (!pil.length) P.push('Your facilitator has not rated your four pillars yet. Once the first check-in is in, this note will tell you where you are strongest and where to put your effort.');
  else {
    const avg = Math.round(10 * pil.reduce(function (n, x) { return n + Number(x.Rating); }, 0) / pil.length) / 10;
    const sorted = pil.slice().sort(function (a, b) { return b.Rating - a.Rating; }), top = sorted[0], low = sorted[sorted.length - 1];
    const bits = ['Your facilitator rates your pillars at ' + avg + ' out of 5 on average.'];
    if (pil.length >= 2 && top.Rating > low.Rating) bits.push(top.Pillar + ' is your strongest at ' + top.Rating + ', and ' + low.Pillar + ' is where the next gain is, at ' + low.Rating + '.');
    const up = pil.filter(function (x) { const h = x.History || []; return h.length >= 2 && h[h.length - 1].Rating - h[0].Rating >= 1; });
    const down = pil.filter(function (x) { const h = x.History || []; return h.length >= 2 && h[h.length - 1].Rating - h[0].Rating <= -1; });
    if (up.length) bits.push(sn_list_(up.map(function (x) { return x.Pillar; })) + ' ' + (up.length === 1 ? 'has' : 'have') + ' moved up since your first check-in, which tells us the effort is real.');
    if (down.length) bits.push(sn_list_(down.map(function (x) { return x.Pillar; })) + ' ' + (down.length === 1 ? 'has' : 'have') + ' slipped a little. That happens to everyone, and it is worth a conversation with your facilitator.');
    P.push(bits.join(' '));
    s._low = pil.length >= 2 && top.Rating > low.Rating ? low.Pillar : '';
  }
  const W = pn_work_(p.assignments, { title: function (x) { return x.Title; }, status: function (x) { return x.Status; }, score: function (x) { return x.Submission && x.Submission.Score; }, max: function (x) { return x.MaxScore; }, due: function (x) { return x.Due; } });
  P.push(pn_workText_(W, 'assignments', pick));
  const sig = (att0 !== null ? 1 : 0) + pil.length + W.count;
  const ns = (p.sessions || []).filter(function (x) { return String(x.Start).slice(0, 10) >= today; }).sort(function (a, b) { return a.Start < b.Start ? -1 : 1; })[0];
  if (ns) P.push('Your next live session is “' + ns.Title + '” on ' + pn_nice_(ns.Start) + '. Come having thought about it, not just ready to listen.');
  let focus;
  if (W.overdue.length) focus = 'Hand in “' + W.overdue[0].title + '” first, even if it is not perfect.';
  else if (s._low) focus = 'Ask your facilitator one question about ' + s._low + ' this week.';
  else if (W.todo.length) focus = 'Begin “' + W.todo[0].title + '” early this week.';
  else if (ns) focus = 'Be on time for “' + ns.Title + '”.';
  else focus = 'Keep showing up. Consistency is the pillar under every other pillar.';
  const att = (Number(s.AttendanceTotal) || 0) >= SN_MIN_ATTENDANCE ? sn_pct_(Number(s.AttendancePresent) || 0, Number(s.AttendanceTotal) || 0) : null;
  const mood = W.overdue.length >= 2 || (att !== null && att < 60) ? 'building' : (W.avg !== null && W.avg >= 80 && (att === null || att >= 85)) ? 'strong' : 'steady';
  return pn_wrap_(first, P, focus, mood, pick, today, sig);
}

/* ----- Skills School ----- */
function pn_skills_(p, pick, first, today) {
  const s = p.student || {}, P = [];
  const wk = Number(s.Week) || 0, wks = Number(s.Weeks) || 0;
  if (wk && wks) P.push(wk >= wks ? 'You have reached the end of ' + (s.Course || 'your course') + '. What matters now is finishing every project properly, because the work you hand in is what you will be able to show people.' : 'You are in week ' + wk + ' of ' + wks + ' of ' + (s.Course || 'your course') + ', about ' + Math.round(100 * wk / wks) + '% of the way through. ' + pick(['The middle of a course is where most people slow down. Keep your pace.', 'Each week builds on the last, so a missed project now costs more later.'], 'wk'));
  const a = p.attendance || {};
  P.push(pn_attText_(Number(a.Present) || 0, Number(a.Total) || 0, 'classes', pick));
  const W = pn_work_(p.projects, { title: function (x) { return x.Title; }, status: function (x) { return x.Status; }, score: function (x) { return x.Submission && x.Submission.Score; }, max: function (x) { return x.MaxScore; }, due: function (x) { return x.Due; } });
  P.push(pn_workText_(W, 'projects', pick));
  const sig = (wk && wks ? 1 : 0) + ((Number(a.Total) || 0) >= SN_MIN_ATTENDANCE ? 1 : 0) + W.count;
  if (String(s.Certificate || '').trim()) P.push('Your certificate is ready. Mā shāʾ Allāh. Keep the work you did, because it is the real proof.');
  let focus;
  if (W.overdue.length) focus = 'Submit “' + W.overdue[0].title + '” first, even as a rough version, and ask your tutor for feedback.';
  else if (W.todo.length) focus = 'Start “' + W.todo[0].title + '” now' + (W.todo[0].due ? ', it is due ' + pn_nice_(W.todo[0].due) : '') + '. A project begun early is half done.';
  else focus = 'Spend an hour this week improving a project you already submitted. Polish is what makes work memorable.';
  const att = (Number(a.Total) || 0) >= SN_MIN_ATTENDANCE ? sn_pct_(Number(a.Present) || 0, Number(a.Total) || 0) : null;
  const mood = W.overdue.length >= 2 || (att !== null && att < 60) ? 'building' : (W.avg !== null && W.avg >= 80) ? 'strong' : 'steady';
  return pn_wrap_(first, P, focus, mood, pick, today, sig);
}

/* ----- Academy (exam preparation) ----- */
function pn_academy_(p, pick, first, today) {
  const s = p.student || {}, P = [], mocks = (p.mocks || []).slice().sort(function (a, b) { return a.Date < b.Date ? 1 : -1; });
  let weak = '';
  if (mocks.length) {
    const avg = Math.round(10 * mocks.reduce(function (n, m) { return n + m.Percent; }, 0) / mocks.length) / 10, last = mocks[0];
    const bits = ['Your latest mock was ' + last.Percent + '% on ' + pn_nice_(last.Date) + '. Across ' + mocks.length + ' ' + sn_plural_(mocks.length, 'mock', 'mocks') + ' you average ' + avg + '%.'];
    if (mocks.length >= 4) {
      const recent = mocks.slice(0, 2), older = mocks.slice(2), m = function (x) { return x.reduce(function (n, y) { return n + y.Percent; }, 0) / x.length; }, d = Math.round(m(recent) - m(older));
      bits.push(d >= 4 ? 'Your last two are ' + d + ' points above the ones before them. The work is paying off.' : d <= -4 ? 'Your last two are ' + (-d) + ' points below the ones before them. One dip is not a verdict, but look at what changed in your preparation.' : 'Your scores are holding steady, so the next gain has to come from a change in how you prepare, not only more of it.');
    }
    const tg = Number(s.TargetPercent) || 0;
    if (tg) bits.push(last.Percent >= tg ? 'You are above your target of ' + tg + '%. Protect that lead.' : 'Your target is ' + tg + '%, so the gap on your latest mock is ' + Math.round(tg - last.Percent) + ' points. That is a gap you can close.');
    P.push(bits.join(' '));
    const by = {};
    mocks.slice(0, 3).forEach(function (m) { (m.Subjects || []).forEach(function (x) { if (x.OutOf) (by[x.Subject] = by[x.Subject] || []).push(100 * x.Score / x.OutOf); }); });
    const subj = Object.keys(by).map(function (k) { return { k: k, v: by[k].reduce(function (n, x) { return n + x; }, 0) / by[k].length }; }).sort(function (a, b) { return a.v - b.v; });
    if (subj.length >= 2 && subj[subj.length - 1].v - subj[0].v >= 8) { weak = subj[0].k; P.push('Across your recent mocks ' + subj[subj.length - 1].k + ' is your strongest subject and ' + weak + ' your weakest. Marks are cheapest to gain where you are weakest.'); }
  } else P.push('You have not sat a mock yet, so there is no score to measure against. Your first one is the most useful, because it shows where you actually stand.');
  if (s.ExamDate) {
    const d = sn_days_(s.ExamDate) - sn_days_(today);
    if (d > 0) P.push('Your exam is ' + d + ' ' + sn_plural_(d, 'day', 'days') + ' away. ' + (d > 90 ? 'There is time, but only for people who use it every week.' : d > 30 ? 'This is the stretch where steady daily work beats last-minute effort.' : 'Now is for revision, past questions and sleep. Stop starting new topics.'));
  }
  const r = p.reading || {};
  if (r.Target > 0) {
    const hist = (r.History || []).slice(0, -1), hit = hist.filter(function (x) { return x.Target > 0 && x.Done >= x.Target; }).length, unit = p.readingUnit || 'pages';
    P.push('This week you have read ' + r.Done + ' of your ' + r.Target + ' ' + unit + (r.Done >= r.Target ? '. Target met. Do not stop there.' : '. ' + (r.Target - r.Done) + ' to go.') + (hist.length >= 3 ? ' You met your reading target in ' + hit + ' of the last ' + hist.length + ' weeks.' : ''));
  }
  const W = pn_work_(p.tasks, { title: function (x) { return x.Title; }, status: function (x) { return x.Status; }, score: function (x) { return x.Score; }, max: function (x) { return x.MaxScore; }, due: function (x) { return x.Due; } });
  if (W.count) P.push(pn_workText_(W, 'daily tasks', pick));
  const att = (p.attendance || []).filter(function (x) { return x.Status && x.Status !== 'Excused'; }), pres = att.filter(function (x) { return x.Status === 'Present' || x.Status === 'Late'; }).length;
  P.push(pn_attText_(pres, att.length, 'classes', pick));
  const sig = mocks.length + (r.Target > 0 ? 1 : 0) + W.count + (att.length >= SN_MIN_ATTENDANCE ? 1 : 0);
  let focus;
  if (W.overdue.length) focus = 'Do “' + W.overdue[0].title + '” today, even if you are not ready for it.';
  else if (weak) focus = 'Give ' + weak + ' an extra hour of past questions this week.';
  else if (r.Target > 0 && r.Done < r.Target) focus = 'Finish your remaining ' + (r.Target - r.Done) + ' ' + (p.readingUnit || 'pages') + ' of reading before the week ends.';
  else if (!mocks.length) focus = 'Sit your first mock as soon as it opens.';
  else focus = 'Redo the questions you got wrong in your last mock. That is where the marks are.';
  const last = mocks[0], tg = Number(s.TargetPercent) || 0;
  const mood = !mocks.length ? 'new' : (tg && last.Percent >= tg) ? 'strong' : W.overdue.length >= 2 ? 'building' : 'steady';
  return pn_wrap_(first, P, focus, mood, pick, today, sig);
}

function pn_build_(kind, p) {
  const today = today_(), st = p.student || {}, first = sn_first_(st.Name), seed = String(st.StudentID) + '|' + Math.floor(sn_days_(today) / 7);
  const pick = function (list, salt) { return sn_pick_(list, seed, salt); };
  if (kind === 'tbc') return pn_tbc_(p, pick, first, today);
  if (kind === 'skills') return pn_skills_(p, pick, first, today);
  if (kind === 'academy') return pn_academy_(p, pick, first, today);
  return null;
}

/* ----- attach to the three dashboard payloads (a failure here never stops a dashboard from loading) ----- */
function pn_attach_(kind, out) { try { const n = pn_build_(kind, out); if (n) out.note = n; } catch (e) { try { errLog_('note:' + kind, e, {}); } catch (e2) {} } return out; }

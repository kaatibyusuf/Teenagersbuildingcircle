/**
 * Term report cards for parents
 *
 * A term report card is the Gradebook (Exams.gs) turned into an email: for every subject the CA 1 (/20), CA 2 (/20) and Exam (/60),
 * the total out of 100, the grade and remark, then the term average, the grade point average (GPA) and the cumulative GPA (CGPA).
 * It uses exactly the same numbers as the student's own report on the exams page, so a parent and a student always see the same marks.
 * Only published exam scores and scores typed by a teacher are counted; a student with no scores for the term gets no card.
 *
 * A card goes to the next-of-kin email on the enrolment form and to the student's own email (up to three addresses), the same way the
 * monthly progress reports (Reports.gs) do.
 *
 * Tabs (created automatically):
 *   Term report cards    one row per student per term: who it went to and whether it was sent
 *   Report card notes    optional: Term (for example 2026/2027 Second Semester), StudentID, Comment, By. A short comment from the
 *                        class teacher or the head, printed on the card. Add them before you send.
 *
 * Menu (Himaayah):
 *   Term report cards: send me a sample      asks for a Student ID and a term, and emails that card to you only
 *   Term report cards: send to parents       asks for a term, queues one card per student and starts sending
 *
 * Cards go out when YOU choose, once the exams for the term have been published and the teachers' typed scores are in.
 * If the daily email quota runs out, the rest stay "Queued" and are sent by the daily job on the following days.
 *
 * SETUP: add this file, add the two menu items in Code.gs (already done in this version), then Deploy > Manage deployments > New version.
 * Needs Exams.gs and Reports.gs (it reuses their helpers).
 */

const RC_TAB = 'Term report cards';
const RC_HEAD = ['Term', 'StudentID', 'Name', 'To', 'Status', 'Sent', 'Summary'];
const RC_NOTES_TAB = 'Report card notes';
const RC_NOTES_HEAD = ['Term', 'StudentID', 'Comment', 'By'];
const RC_RESERVE = 25;           // emails kept back each day for receipts, logins and reminders
function rc_examsUrl_() { return 'https://www.himaayahschools.com/exams.html'; }

/* ===== who gets a card ===== */
function rc_students_() {
  return rp_tryTable_('Students').rows.filter(function (s) { return s.StudentID && s.Name && key_(s.Active) !== 'FALSE'; });
}
function rc_note_(term, id) {
  const n = rp_tryTable_(RC_NOTES_TAB).rows.filter(function (r) {
    return String(r.Term || '').trim() === term && key_(r.StudentID) === key_(id) && String(r.Comment || '').trim();
  })[0];
  return n ? { note: String(n.Comment).trim(), by: String(n.By || '').trim() } : null;
}

/* ===== building one card ===== */
/* Returns null when the student has no scores for the term. */
function rc_build_(s, term) {
  const rep = ex_studentReport_(s, { term: term });
  if (!rep || !rep.ok || !rep.subjects.length) return null;
  const first = String(s.Name || '').trim().split(/\s+/)[0] || 'Your child';
  return { id: String(s.StudentID).trim(), name: String(s.Name || '').trim(), first: first, level: String(s.Level || '').trim(), term: term, rep: rep, note: rc_note_(term, s.StudentID) };
}
function rc_fmt_(v) { return v == null ? '–' : String(v); }

/* ===== the email ===== */
function rc_email_(card) {
  const r = card.rep, subject = SCHOOL_NAME + ': ' + card.first + "'s report card for " + card.term;
  const cell = 'padding:8px 6px;border-bottom:1px solid #E3E9EE;font-size:14px;';
  let text = 'Assalaamu alaykum,\n\nHere is ' + card.first + "'s report card for " + card.term + ' (' + card.name + ', ' + card.id + (card.level ? ', ' + card.level : '') + ').\n\n';
  let html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#0B1F2E;max-width:620px;margin:0 auto;line-height:1.5">' +
    '<p style="margin:0 0 4px;color:#4A6072;font-size:13px">' + rp_e_(SCHOOL_NAME) + ' · Term report card</p>' +
    '<h1 style="font-size:22px;margin:0 0 4px">' + rp_e_(card.name) + '</h1>' +
    '<p style="margin:0 0 16px;color:#4A6072">' + rp_e_(card.term) + (card.level ? ' · ' + rp_e_(card.level) : '') + ' · ' + rp_e_(card.id) + '</p>' +
    '<p style="margin:0 0 14px">Assalaamu alaykum. Here are ' + rp_e_(card.first) + '’s results for the term.</p>' +
    '<table role="presentation" style="width:100%;border-collapse:collapse"><thead><tr style="background:#EEF6FC;text-align:left;font-size:12px;color:#4A6072">' +
    '<th style="padding:8px 6px">Subject</th><th style="padding:8px 6px;text-align:right">CA 1<br>/20</th><th style="padding:8px 6px;text-align:right">CA 2<br>/20</th>' +
    '<th style="padding:8px 6px;text-align:right">Exam<br>/60</th><th style="padding:8px 6px;text-align:right">Total<br>/100</th><th style="padding:8px 6px;text-align:right">Grade</th></tr></thead><tbody>';
  text += 'SUBJECT: CA1/20, CA2/20, EXAM/60, TOTAL/100, GRADE\n';
  r.subjects.forEach(function (x) {
    const grade = x.grade ? x.grade + (x.remark ? ' (' + x.remark + ')' : '') : 'Not complete';
    text += '  ' + x.subject + ': ' + rc_fmt_(x.CA1) + ', ' + rc_fmt_(x.CA2) + ', ' + rc_fmt_(x.Exam) + ', ' + rc_fmt_(x.total) + ', ' + grade + '\n';
    html += '<tr><td style="' + cell + '"><b>' + rp_e_(x.subject) + '</b></td>' +
      '<td style="' + cell + 'text-align:right">' + rp_e_(rc_fmt_(x.CA1)) + '</td><td style="' + cell + 'text-align:right">' + rp_e_(rc_fmt_(x.CA2)) + '</td>' +
      '<td style="' + cell + 'text-align:right">' + rp_e_(rc_fmt_(x.Exam)) + '</td><td style="' + cell + 'text-align:right"><b>' + rp_e_(rc_fmt_(x.total)) + '</b></td>' +
      '<td style="' + cell + 'text-align:right">' + (x.grade ? '<b>' + rp_e_(x.grade) + '</b> <span style="color:#4A6072;font-size:12px">' + rp_e_(x.remark || '') + '</span>' : '<span style="color:#9A5B00;font-size:12px">Not complete</span>') + '</td></tr>';
  });
  html += '</tbody></table>';
  const bits = [];
  if (r.average != null) bits.push(['Term average', r.average + ' / 100' + (r.grade ? ' (grade ' + r.grade + ')' : '')]);
  if (r.gpa != null) bits.push(['GPA this term', Number(r.gpa).toFixed(2) + ' / 5.00']);
  if (r.cgpa != null) bits.push(['CGPA so far', Number(r.cgpa).toFixed(2) + ' / 5.00']);
  if (bits.length) {
    text += '\n' + bits.map(function (b) { return b[0] + ': ' + b[1]; }).join('\n') + '\n';
    html += '<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px">' + bits.map(function (b) {
      return '<tr><td style="padding:7px 0;border-bottom:1px solid #E3E9EE;color:#4A6072">' + rp_e_(b[0]) + '</td><td style="padding:7px 0;border-bottom:1px solid #E3E9EE;text-align:right"><b>' + rp_e_(b[1]) + '</b></td></tr>';
    }).join('') + '</table>';
  }
  if (!r.complete) {
    const note = 'Some subjects above are not complete yet, so the grade is shown once every part (CA 1, CA 2 and the exam) is in.';
    text += '\n' + note + '\n';
    html += '<p style="margin:12px 0 0;font-size:13px;color:#9A5B00">' + rp_e_(note) + '</p>';
  }
  if (card.note) {
    text += '\nFROM ' + (card.note.by ? card.note.by.toUpperCase() : 'THE TEACHER') + '\n  ' + card.note.note + '\n';
    html += '<h2 style="font-size:15px;margin:18px 0 6px">From ' + rp_e_(card.note.by || 'the teacher') + '</h2><p style="margin:0;background:#F6F4EE;border-radius:10px;padding:12px 14px;white-space:pre-line">' + rp_e_(card.note.note) + '</p>';
  }
  const key = 'Grades: A 90-100 · B 79-89 · C 60-78 · D 50-59 · E 49 · F 0-48. Each subject is CA 1 (20) + CA 2 (20) + Exam (60) = 100. GPA is out of 5.00 and weighs each course by its credit units.';
  text += '\n' + key + '\n\nSee every result and the full report any time on the exams page: ' + rc_examsUrl_() + '\nQuestions? Reply to this email or message us on WhatsApp.\n\nJazakumullahu khayran,\n' + SCHOOL_NAME;
  html += '<p style="margin:18px 0 0;font-size:12px;color:#4A6072">' + rp_e_(key) + '</p>' +
    '<p style="margin:18px 0 0;font-size:14px">See every result and the full report any time on the <a href="' + rp_e_(rc_examsUrl_()) + '" style="color:#094570">exams page</a> (your child logs in with their Student ID). Questions? Reply to this email.</p>' +
    '<p style="margin:16px 0 0;font-size:14px">Jazakumullahu khayran,<br>' + rp_e_(SCHOOL_NAME) + '</p></div>';
  return { subject: subject, text: text, html: html };
}

/* ===== queue and send ===== */
function rc_queue_(term) {
  const t = rp_t_(RC_TAB, RC_HEAD), have = {};
  t.rows.forEach(function (r) {
    if (String(r.Term) !== term) return;
    if (String(r.Status) === 'No scores') { put_(t, r._row, 'Status', 'Queued'); return; }   // scores may have come in since last time
    have[key_(r.StudentID)] = true;
  });
  const emails = rp_emailMap_(), add = [];
  rc_students_().forEach(function (s) {
    if (have[key_(s.StudentID)]) return;
    const x = { s: s, id: String(s.StudentID).trim() }, to = rp_to_(x, emails);
    add.push([term, x.id, String(s.Name), to.join(', '), to.length ? 'Queued' : 'No email', '', '']);
  });
  if (add.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, add.length, RC_HEAD.length).setNumberFormat('@').setValues(add);
  return add.length;
}
function rc_send_(term, maxMs) {
  const start = Date.now(), t = rp_t_(RC_TAB, RC_HEAD), all = {};
  rc_students_().forEach(function (s) { all[key_(s.StudentID)] = s; });
  let sent = 0;
  for (let i = 0; i < t.rows.length; i++) {
    const r = t.rows[i];
    if (String(r.Term) !== term || String(r.Status) !== 'Queued') continue;
    if (Date.now() - start > (maxMs || 240000)) break;
    const to = String(r.To || '').split(/\s*,\s*/).filter(validEmail_);
    if (MailApp.getRemainingDailyQuota() < RC_RESERVE + Math.max(1, to.length)) break;
    const s = all[key_(r.StudentID)];
    if (!s) { put_(t, r._row, 'Status', 'Not active'); continue; }
    try {
      const card = rc_build_(s, term);
      if (!card) { put_(t, r._row, 'Status', 'No scores'); continue; }
      const mail = rc_email_(card);
      MailApp.sendEmail({ to: to.join(','), subject: mail.subject, body: mail.text, htmlBody: mail.html, name: SCHOOL_NAME });
      put_(t, r._row, 'Status', 'Sent'); put_(t, r._row, 'Sent', iso_(new Date(), true), true);
      put_(t, r._row, 'Summary', (card.rep.average != null ? 'Average ' + card.rep.average : '') + (card.rep.gpa != null ? ' · GPA ' + Number(card.rep.gpa).toFixed(2) : ''), true);
      sent++;
    } catch (err) { console.error(err); put_(t, r._row, 'Status', 'Error'); put_(t, r._row, 'Summary', String(err.message).slice(0, 200), true); }
  }
  return sent;
}
/* Called from dailyJob in Code.gs: keeps sending cards that were queued but did not fit in the email quota. */
function rc_dailyJob_() {
  const t = rp_tryTable_(RC_TAB), terms = {};
  t.rows.forEach(function (r) { if (String(r.Status) === 'Queued') terms[String(r.Term)] = true; });
  Object.keys(terms).forEach(function (term) { rc_send_(term); });
}
function rc_status_(term) {
  const c = { term: term, queued: 0, sent: 0, noEmail: 0, noScores: 0, errors: 0, total: 0 };
  rp_tryTable_(RC_TAB).rows.forEach(function (r) {
    if (String(r.Term) !== term) return;
    c.total++; const s = String(r.Status);
    if (s === 'Sent') c.sent++; else if (s === 'Queued') c.queued++; else if (s === 'No email') c.noEmail++; else if (s === 'No scores') c.noScores++; else if (s === 'Error') c.errors++;
  });
  return c;
}

/* ===== menu ===== */
function rc_askTerm_(ui, title) {
  const cur = schoolTerm_().Key, terms = ex_gTerms_();
  const a = ui.prompt(title, 'Which term? Type it exactly, for example: ' + cur + '\n\nTerms with scores: ' + (terms.join('; ') || '(none yet)') + '\n\nLeave empty for the current term.', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return '';
  return String(a.getResponseText() || '').trim() || cur;
}
function reportCardSample() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Report card sample', 'Student ID to preview (for example HM-0001). The card is emailed to you only.', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const term = rc_askTerm_(ui, 'Report card sample');
  if (!term) return;
  ui.alert(rc_sample_(a.getResponseText(), term, Session.getEffectiveUser().getEmail()));
}
function rc_sample_(rawId, term, to) {
  const id = key_(rawId), s = rc_students_().filter(function (y) { return key_(y.StudentID) === id; })[0];
  if (!s) return 'No active student with the ID ' + rawId + '.';
  if (!validEmail_(to)) return 'Could not find your email address.';
  const card = rc_build_(s, term);
  if (!card) return s.Name + ' has no published or typed scores for ' + term + ', so there is no card yet.';
  const mail = rc_email_(card);
  MailApp.sendEmail({ to: to, subject: '[Sample] ' + mail.subject, body: mail.text, htmlBody: mail.html, name: SCHOOL_NAME });
  const would = rp_to_({ s: s, id: String(s.StudentID).trim() }, rp_emailMap_());
  return 'Sample sent to ' + to + '. The real card would go to: ' + (would.join(', ') || 'nobody (no email on file)') + '.';
}
function reportCardsSend() {
  const ui = SpreadsheetApp.getUi();
  const term = rc_askTerm_(ui, 'Send term report cards');
  if (!term) return;
  const ok = ui.alert('Send report cards', 'Queue and send a report card for every active student with scores in "' + term + '" to their parents? Make sure the exams are published and the typed CA scores are in. Students without scores are skipped.', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  const added = rc_queue_(term), sent = rc_send_(term), st = rc_status_(term);
  ui.alert('Report cards for ' + term + ': ' + st.sent + ' sent, ' + st.queued + ' waiting for tomorrow\'s email quota, ' + st.noEmail + ' with no email on file, ' + st.noScores + ' with no scores yet.' + (added ? ' (' + added + ' added to the list.)' : ''));
}

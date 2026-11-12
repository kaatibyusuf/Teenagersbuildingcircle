/* "How this works" guide on every portal's sign-in page (portal-help.js).
 *
 * Add  <script src="js/portal-help.js" defer></script>  to a portal page. The script finds the guide for that page from its address
 * (dashboard, academy-tutor, skills-admin, ...) and adds a collapsed "How this works" box under the sign-in form. It changes nothing else
 * on the page and does nothing if there is no sign-in form or no guide for the page.
 *
 * To change the wording, edit GUIDES below. tests/portal-help.test.js fails if a sign-in page has no guide or does not load this script.
 * Keep the times and rules here in step with the school's settings (for example the Sunday mock times in backend/AcademyMocks.gs).
 */
(function () {
  var WA = '2347047226487';
  var LOST_STUDENT = 'Message the school on WhatsApp and we will give you a new code. After you sign in with it you will be asked to choose your own.';
  var LOST_STAFF = 'Ask an admin to give you a new code (Admin pages > Reset code). After you sign in with it you will be asked to choose your own.';
  var COMMON = [
    'Type the ID and code exactly as they were sent to you, including any dash. Codes use small letters and numbers.',
    'After 5 wrong tries the sign-in pauses for 15 minutes. Wait, then try again, rather than guessing.',
    'For your safety this page signs you out when you refresh it or leave it idle for 30 minutes. Just sign in again.'
  ];
  var PARENT_LINK = { href: 'parent', text: 'Are you a parent? Use the parent page.' };

  var GUIDES = {
    'dashboard': {
      title: 'Madrasah student dashboard',
      who: 'For Himaayah Madrasah students. Your Student ID looks like HM-0001 and your access code came in the email the school sent when your place was confirmed.',
      find: [
        'Your hifdh progress, your muraajah plan and your test results.',
        'Assignments: open one, write a note or paste a link to your work, and press send. Your teacher marks it and the feedback appears here.',
        'Your class times and the link to join your class.',
        'Payments: your next due date, your payment history and a button to pay by card.'
      ],
      lost: LOST_STUDENT, parent: true
    },
    'tbc-dashboard': {
      title: 'Teenagers Building Circle dashboard',
      who: 'For students in the Teenagers Building Circle. Your Student ID looks like HM-0001 and your access code came in the email the school sent when your place was confirmed.',
      find: [
        'Your growth pillars, with your facilitator’s ratings and notes.',
        'Your sessions and the session guides for your month of the programme.',
        'Your attendance, assignments and announcements.',
        'Payments: your next due date and payment history.'
      ],
      lost: LOST_STUDENT, parent: true
    },
    'academy-dashboard': {
      title: 'Academy student dashboard',
      who: 'For Himaayah Academy students. Sign in with your Student ID (AC-0001) or your matric number, and the access code the school gave you.',
      find: [
        'Overview: your overall score, attendance and what is due.',
        'Classes and Daily tasks: your class times and the work your mentor sets. Class links are paused while a fee is overdue.',
        'CBT: practice tests and the weekly UTME Sunday mock. The mock opens on Sunday morning and you can start until 9 pm. You have 120 minutes once you begin. Pick ONE subject combination before you start, because sitting one locks the others.',
        'Answers and explanations appear after the mock closes. Your result is emailed to you on Monday morning.',
        'Family and Leaderboard: your mentorship family and how you compare over the last few weeks.'
      ],
      lost: LOST_STUDENT, parent: true
    },
    'skills-dashboard': {
      title: 'Skills School dashboard',
      who: 'For Skills School students. Your Student ID looks like SK-0001 and your access code came in the email the school sent when your place was confirmed.',
      find: [
        'Your course, which week you are on and your next live class.',
        'Projects: open the brief, then send a link to your work or a note. Your tutor marks it and leaves feedback.',
        'Your attendance and announcements.',
        'Payments and, when you finish the course, your certificate.'
      ],
      lost: LOST_STUDENT, parent: true
    },
    'teacher': {
      title: 'Teacher dashboard',
      who: 'For Madrasah teachers. Sign in with the Teacher ID and access code the school gave you.',
      find: [
        'Today: your classes and who needs attention.',
        'Recitations, Students and Results: record progress and scores for your own students.',
        'Assignments: set work for a class or one student, then mark what comes in and leave feedback.'
      ],
      lost: LOST_STAFF
    },
    'tbc-facilitator': {
      title: 'Teenagers Building Circle facilitator',
      who: 'For Teenagers Building Circle facilitators. Sign in with the Teacher ID and access code the school gave you.',
      find: [
        'Check-ins: rate each pillar for each student and add a note.',
        'Attendance and Sessions: record who came and schedule sessions.',
        'Monthly reports: preview, then send each parent’s report. Session guides: the guides for each month.'
      ],
      lost: LOST_STAFF
    },
    'academy-tutor': {
      title: 'Academy mentor dashboard',
      who: 'For Academy mentors. Sign in with the Mentor ID and access code the school gave you.',
      find: [
        'Mentees and Families: the students and mentorship families you look after.',
        'Classes, Attendance and Daily tasks: run your classes, mark who attended and set and mark work.',
        'CBT and Mocks: tests for your mentees and their Sunday mock results.',
        'Goals and class: each student’s target and class details.'
      ],
      lost: LOST_STAFF
    },
    'skills-tutor': {
      title: 'Skills School tutor dashboard',
      who: 'For Skills School tutors. Sign in with the Tutor ID and access code the school gave you.',
      find: [
        'Students: the students on your courses.',
        'Projects: set projects, then mark submissions and leave feedback.',
        'Attendance, and Class and completion: record attendance and mark students as complete.'
      ],
      lost: LOST_STAFF
    },
    'admin': {
      title: 'Madrasah admin',
      who: 'For the Madrasah admin. Sign in with your Admin ID and access code.',
      find: [
        'Payments: check and confirm payments.',
        'Assign: assign students to teachers.',
        'Reset code: give a student, teacher or parent a new code (it is shown once, and you can email it or send it on WhatsApp). Search for a child there to give their parent a code for the parent page.'
      ],
      lost: 'Only the owner can reset an admin’s code. Ask the owner.'
    },
    'tbc-admin': {
      title: 'Teenagers Building Circle admin',
      who: 'For the Teenagers Building Circle admin. Sign in with your Admin ID and access code.',
      find: [
        'Payments: check and confirm payments.',
        'Assign: assign students to facilitators.',
        'Reset code: give a student, facilitator or parent a new code (shown once).'
      ],
      lost: 'Only the owner can reset an admin’s code. Ask the owner.'
    },
    'academy-admin': {
      title: 'Academy admin',
      who: 'For the Academy admin. Sign in with your Admin ID and access code.',
      find: [
        'Reports, Students, Mentors, Families and Class groups: who is enrolled and how they are doing.',
        'Mock analytics: how each Sunday mock went, question by question, and which questions to check.',
        'Payments and Assign: confirm payments and assign students to mentors.',
        'Reset code: give a student, mentor or parent a new code (shown once).'
      ],
      lost: 'Only the owner can reset an admin’s code. Ask the owner.'
    },
    'skills-admin': {
      title: 'Skills School admin',
      who: 'For the Skills School admin. Sign in with your Admin ID and access code.',
      find: [
        'Payments: check and confirm payments.',
        'Assign: assign students to tutors.',
        'Reset code: give a student, tutor or parent a new code (shown once).'
      ],
      lost: 'Only the owner can reset an admin’s code. Ask the owner.'
    },
    'owner': {
      title: 'Owner dashboard',
      who: 'For the school owner. Sign in with your Owner ID and access code.',
      find: [
        'Overview, Fees and Growth: how the school is doing.',
        'Placement tests, Referrals, Staff pay, Sponsors and Stories: the money and community side of the school.',
        'Reset code: give anyone, including an admin, a new code (shown once).'
      ],
      lost: 'Another owner can reset your code. If you are the only owner, it has to be changed in the school sheet.'
    },
    'librarian': {
      title: 'Librarian',
      who: 'For the school librarian. Sign in with your Librarian ID and access code.',
      find: [
        'Items and Add an item: the library catalogue.',
        'Check links: find broken links. Check a card: look up a member’s library card.'
      ],
      lost: LOST_STAFF
    },
    'bootcamp': {
      title: 'Ḥadīth Bootcamp',
      who: 'For Ḥadīth Bootcamp students. Use the Bootcamp ID and access code from your email. Madrasah students can use their usual Student ID and access code.',
      find: ['Your bootcamp lessons and progress once you sign in.'],
      lost: LOST_STUDENT
    },
    'exams': {
      title: 'Madrasah exams',
      who: 'For Madrasah students. Use your usual Student ID and access code, the same as on your dashboard.',
      find: [
        'Your timed exams. Open an exam when it is available, answer the questions and submit before the time runs out.',
        'Your results once your teacher has marked the exam.',
        'If you are already signed in on your dashboard in this browser tab, you go straight in.'
      ],
      lost: LOST_STUDENT
    },
    'exam-teacher': {
      title: 'Madrasah exams for teachers',
      who: 'For Madrasah teachers. Use your usual Teacher ID and access code.',
      find: ['Set an exam for a class, run it, and mark the answers that need a teacher.'],
      lost: LOST_STAFF
    },
    'library': {
      title: 'Madrasah library',
      who: 'For Madrasah students. Use your usual Student ID and access code.',
      find: ['Books, notes and links the school has put together for your level.', 'If you are already signed in on your dashboard in this browser tab, you go straight in.'],
      lost: LOST_STUDENT
    },
    'quiz': {
      title: 'Practice quizzes',
      who: 'For Madrasah students. Use your usual Student ID and access code.',
      find: ['Short quizzes that are marked for you straight away, so you can see what to revise.', 'If you are already signed in on your dashboard in this browser tab, you go straight in.'],
      lost: LOST_STUDENT
    },
    'tracker': {
      title: 'Daily revision',
      who: 'For Madrasah students. Use your usual Student ID and access code.',
      find: ['Tick off each day’s revision and build your streak.', 'The school may send you a gentle reminder by email if you have not ticked for a few days.'],
      lost: LOST_STUDENT
    },
    'parent': {
      title: 'Parent view',
      who: 'For parents and guardians. Sign in with your child’s Student ID (HM-0001, AC-0001 or SK-0001) and the parent code the school gave you. The parent code is different from your child’s own code.',
      find: [
        'Your child’s fees and recent payments, attendance and progress.',
        'Marked work with the teacher’s feedback, and school announcements.',
        'You can only see your own child. The page is read-only, and refreshing it signs you out.'
      ],
      lost: 'Message the school on WhatsApp and we will send you a new parent code.', skipCommon: true
    }
  };
  var ALIAS = { academydashboard: 'academy-dashboard', academyadmin: 'academy-admin', academytutor: 'academy-tutor' };

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function list(a) { return '<ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }
  function slug() { var p = String(location.pathname || '').split('/').pop().replace(/\.html?$/i, ''); return ALIAS[p] || p; }

  function build(g) {
    var wa = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Assalaamu alaykum. I need help with the ' + g.title + ' sign-in.');
    return '<details class="phelp-d"><summary>How this works</summary><div class="phelp-b">' +
      '<h3>' + esc(g.title) + '</h3><p>' + esc(g.who) + '</p>' +
      '<h4>What you will find</h4>' + list(g.find) +
      (g.skipCommon ? '' : '<h4>Signing in</h4>' + list(COMMON)) +
      '<h4>Lost your code?</h4><p>' + esc(g.lost) + '</p>' +
      '<p><a href="' + wa + '" target="_blank" rel="noopener">Message the school on WhatsApp</a>' + (g.parent ? ' · <a href="' + PARENT_LINK.href + '">' + esc(PARENT_LINK.text) + '</a>' : '') + '</p></div></details>';
  }
  var CSS = '.phelp{margin-top:16px}.phelp-d{font-size:14.5px;line-height:1.55}.phelp-d summary{cursor:pointer;font-weight:700;color:var(--ink,#062f4d);padding:4px 0}' +
    '.phelp-b{margin-top:10px;color:var(--muted,#44525a)}.phelp-b h3{margin:0 0 6px;font-size:16px;color:var(--ink,#062f4d)}.phelp-b h4{margin:14px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink,#062f4d)}' +
    '.phelp-b ul{margin:0;padding-left:20px}.phelp-b li{margin:3px 0}.phelp-b p{margin:4px 0}.phelp-b a{font-weight:600;text-decoration:underline}';

  function run() {
    try {
      var form = document.getElementById('lf') || document.getElementById('login');
      var g = GUIDES[slug()];
      if (!form || !g || document.getElementById('phelp')) return;
      if (!document.getElementById('phelp-css')) { var s = document.createElement('style'); s.id = 'phelp-css'; s.textContent = CSS; document.head.appendChild(s); }
      var box = document.createElement('section'); box.id = 'phelp'; box.className = 'lbox phelp'; box.innerHTML = build(g);
      var host = document.getElementById('login') || form.parentNode;
      host.appendChild(box);
    } catch (e) { /* a help box must never break a sign-in page */ }
  }
  if (typeof window !== 'undefined') window.PortalHelp = { GUIDES: GUIDES, ALIAS: ALIAS, slug: slug };
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run(); }
})();

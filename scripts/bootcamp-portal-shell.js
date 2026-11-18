// Gives the Ḥadīth Bootcamp portal the same layout as the student portal (left menu, top bar, welcome row, summary cards, banner).
// Usage: node scripts/bootcamp-portal-shell.js [path/to/bootcamp.html]. Safe to run twice; if a spot is missing it says which and changes nothing.
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'frontend', 'bootcamp.html');
let h = fs.readFileSync(file, 'utf8');
if (h.includes('PORTAL_SHELL')) { console.log('bootcamp.html: already uses the portal layout, NOT changed'); process.exit(0); }
const miss = [];
function swap(a, b, all) {
  const n = h.split(a).length - 1;
  if (!n || (!all && n !== 1)) { miss.push(a.slice(0, 70) + (n ? ' (found ' + n + ' times)' : ' (not found)')); return; }
  h = h.split(a).join(b);
}
const CFG = `<link rel="stylesheet" href="css/portal-shell.css">
<script>
/* Layout settings for js/portal-shell.js (same menu, top bar and cards as the Madrasah student portal). */
window.PORTAL_SHELL = {
  programme: '\\u1E24ad\\u012Bth Bootcamp',
  data: function () { return typeof S === 'undefined' || !S ? null : { student: { Name: S.student.name, StudentID: S.student.id, PaymentStatus: S.student.source === 'Madrasah' ? 'Exempt' : 'Paid' } }; },
  showTop: function () { return typeof L === 'undefined' || !L; },
  nav: [
    { label: 'Dashboard', icon: 'home', tab: 'home' },
    { label: 'Your progress', icon: 'chart', hash: 'progress' },
    { label: 'The 42 \\u1E25ad\\u012Bth', icon: 'book', hash: 'lessons' },
    { label: 'Certificate', icon: 'star', hash: 'cert' },
    { label: 'My cards', icon: 'card', href: 'my-card' }
  ],
  stats: function (d) {
    var s = S, pc = Math.round(100 * s.passed / s.total);
    return [
      { label: 'Quizzes passed', value: s.passed, valueClass: 'good', lab: 'of ' + s.total + ' \\u1E25ad\\u012Bth', alt: { value: pc + '%', label: 'Complete' }, foot: 'Pass mark ' + s.pass + ' out of 5' },
      { label: 'Lessons heard', value: s.listened, lab: 'recordings listened to', alt: { value: s.total, label: 'In all' }, foot: s.listened ? 'Keep going, m\\u0101 sh\\u0101\\u02BE All\\u0101h.' : 'Start with the first recording.' }
    ];
  },
  third: function (d) {   // needs the portal-shell.js change from scripts/teacher-portal-shell.js; without it the payment card shows instead
    var s = S;
    return s.certificate ? { label: 'Certificate', value: 'Ready', foot: 'Completed ' + String(s.certificate.completed).slice(0, 10) }
      : { label: 'Certificate', value: s.total - s.passed + ' to go', lab: 'quizzes left', foot: 'Pass all ' + s.total + ' to unlock it.' };
  },
  hello: function (d) {
    var s = S, next = s.lessons.find(function (x) { return !x.passed; });
    if (!next) return { text: s.certificate ? 'You have passed every quiz. Your certificate is ready any time you want it.' : 'M\\u0101 sh\\u0101\\u02BE All\\u0101h, you have passed every quiz. Get your certificate below.', cta: { label: 'See my certificate', hash: 'cert' } };
    return { text: (s.passed ? 'Your next \\u1E25ad\\u012Bth is ' + next.n + ': ' + next.title + '.' : 'Begin with \\u1E25ad\\u012Bth ' + next.n + ': ' + next.title + '.') + ' Listen to the lesson, read the text, then take the quiz.', cta: { label: (s.passed ? 'Go to' : 'Start with') + ' \\u1E25ad\\u012Bth ' + next.n, hash: 'bcNext' } };
  }
};
</script>
<script src="js/portal-shell.js" defer></script>
`;
swap('<link rel="stylesheet" href="css/dark.css">\n', '<link rel="stylesheet" href="css/dark.css">\n' + CFG);
swap("let S = null, L = null;", "const SH = '<span class=\"greet\" hidden></span><button type=\"button\" data-tab=\"home\" data-home=\"1\" hidden>Dashboard</button>';   // keeps the portal menu on every screen\nlet S = null, L = null;");
swap("$('app').innerHTML = '<p class=\"bc-loading\">", "$('app').innerHTML = SH + '<p class=\"bc-loading\">", true);
swap("$('app').innerHTML = `<p class=\"bc-loading\">", "$('app').innerHTML = SH + `<p class=\"bc-loading\">", true);
swap("$('app').innerHTML = `<nav class=\"bc-crumb\">", "$('app').innerHTML = SH + `<nav class=\"bc-crumb\">", true);
swap("$('app').innerHTML = `\n  <nav class=\"bc-crumb\">", "$('app').innerHTML = SH + `\n  <nav class=\"bc-crumb\">");
swap("<section class=\"greet\"><div>", "<section class=\"greet\"><button type=\"button\" data-tab=\"home\" data-home=\"1\" hidden>Dashboard</button><div>");
swap('<article class="c w8" style="--i:0"><h2>Your progress</h2>', '<article class="c w8" id="progress" style="--i:0"><h2>Your progress</h2>');
swap('<article class="c bc-cert-card" style="--i:1">', '<article class="c bc-cert-card" id="cert" style="--i:1">');
swap('<article class="c w12" style="--i:2"><h2>The 42', '<article class="c w12" id="lessons" style="--i:2"><h2>The 42');
swap('class="bc-tile bc-st-${status(x)}" data-open="${x.n}"', 'class="bc-tile bc-st-${status(x)}"${next && next.n === x.n ? \' id="bcNext"\' : \'\'} data-open="${x.n}"');
if (miss.length) { console.error('bootcamp.html NOT changed. Could not find:\n - ' + miss.join('\n - ')); process.exit(1); }
fs.writeFileSync(file, h);
console.log('bootcamp.html: portal layout added');

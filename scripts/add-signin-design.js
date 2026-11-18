// Gives every portal sign-in page the new split design (photo on the left, form on the right).
// Usage: node scripts/add-signin-design.js [path/to/frontend]. Adds one stylesheet link to each page that has a sign-in form.
// Copy css/signin.css and images/signin-desk.jpg from the zip first. Safe to run twice; pages without a sign-in form are left alone.
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || path.join(__dirname, '..', 'frontend');
['css/signin.css', 'images/signin-desk.jpg'].forEach((f) => { if (!fs.existsSync(path.join(dir, f))) console.error('Missing ' + f + ' in ' + dir + '. Copy it from the zip first.'); });
const LINK = '<link rel="stylesheet" href="css/signin.css">';
let done = 0, skipped = 0, same = 0;
fs.readdirSync(dir).filter((f) => f.endsWith('.html')).forEach((f) => {
  const file = path.join(dir, f); let s = fs.readFileSync(file, 'utf8');
  if (!/<main[^>]*class="login"/.test(s) || !s.includes('class="lbox"')) return;
  if (s.includes('css/signin.css')) { same++; return; }
  if (s.split('</head>').length !== 2) { console.error(f + ' NOT changed: could not find </head> exactly once.'); skipped++; return; }
  s = s.replace('</head>', () => LINK + '\n</head>');
  fs.writeFileSync(file, s); done++; console.log(f + ': new sign-in design added');
});
console.log(done + ' page(s) changed, ' + same + ' already done' + (skipped ? ', ' + skipped + ' skipped' : '') + '.');

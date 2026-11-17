#!/usr/bin/env node
'use strict';
/* Adds the Literary Journal to the site: a menu link and footer link on every page that has the standard menu,
   plus a section, stylesheet and Arabic wording on the homepage.
   Run from the project root:  node scripts/add-journal-to-site.js
   It only adds lines, skips pages that already have the link, and is safe to run twice. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'frontend');

const SECTION = `<!--journal:start-->
<section class="jn-home" id="journal" aria-label="Literary Journal">
  <div class="h-wrap">
    <div class="jh-in">
      <div>
        <p class="jh-eye">Open to every writer</p>
        <h2>The Himaayah Literary Journal</h2>
        <p class="jh-lead">Arabic poems, short stories, essays, reflections, translations and research from our students, alumni and guests. Read the latest, or send in your own work.</p>
        <div class="jh-btns"><a class="jh-b jh-b1" href="journal">Read the journal →</a><a class="jh-b jh-b2" href="journal-submit">Submit your work</a></div>
      </div>
      <div class="jh-ph"><img src="images/journal-masthead.jpg" alt="A fountain pen resting on an open notebook" width="1200" height="900" loading="lazy"></div>
    </div>
  </div>
</section>
<!--journal:end-->
`;
const AR_COMMON = `\n/*journal-link*/\nHS_I18N.add({"Journal": "\u0627\u0644\u0645\u062c\u0644\u0629", "Literary Journal": "المجلة الأدبية"});\n`;
const AR_HOME = `\n/*journal-home*/\nHS_I18N.add({\n"Open to every writer": "مفتوحة لكل كاتب",\n"The Himaayah Literary Journal": "مجلة حماية الأدبية",\n"Arabic poems, short stories, essays, reflections, translations and research from our students, alumni and guests. Read the latest, or send in your own work.": "قصائد وقصص قصيرة ومقالات وخواطر وترجمات وبحوث بالعربية من طلابنا وخريجينا وضيوفنا. اقرأ أحدث الأعمال أو أرسل عملك.",\n"Read the journal →": "اقرأ المجلة ←",\n"Submit your work": "أرسل عملك"\n});\n`;

const report = { menu: [], footer: [], skipped: [] };
function once(html, from) { return html.split(from).length - 1 === 1; }

fs.readdirSync(root).filter((f) => f.endsWith('.html')).forEach((f) => {
  if (f === 'journal.html') return;
  const file = path.join(root, f);
  let html = fs.readFileSync(file, 'utf8'), changed = false;
  if (!/<nav class="h-nav"/.test(html)) return;           // admin and dashboard pages have their own menus
  if (!/<a href="journal">Journal<\/a>\s*<a href="faq">/.test(html)) {
    const m = html.match(/(\n[ \t]*)<a href="faq">FAQ<\/a>(\n[ \t]*<a href="contact">Contact<\/a>)/);
    if (m && once(html, m[0])) { html = html.replace(m[0], () => m[1] + '<a href="journal">Journal</a>' + m[1] + '<a href="faq">FAQ</a>' + m[2]); report.menu.push(f); changed = true; }
    else report.skipped.push(f + ' (menu)');
  }
  if (/<footer class="h-foot"/.test(html) && !/<a href="journal">Literary Journal<\/a>\s*<a href="resources">/.test(html)) {
    const m = html.match(/(\n[ \t]*)<a href="resources">Resources<\/a>/);
    if (m && once(html, m[0])) { html = html.replace(m[0], () => m[1] + '<a href="journal">Literary Journal</a>' + m[0]); report.footer.push(f); changed = true; }
    else report.skipped.push(f + ' (footer)');
  }
  if (f === 'index.html') {
    if (!/<!--journal:start-->/.test(html)) {
      const hadith = '<section class="h-sec h-paper h-hadith" aria-label="Hadith">';
      if (once(html, hadith) && /<link rel="stylesheet" href="css\/home\.css[^"]*">/.test(html)) {
        html = html.replace(hadith, () => SECTION + hadith).replace(/<link rel="stylesheet" href="css\/home\.css[^"]*">/, (s) => s + '\n<link rel="stylesheet" href="css/journal-home.css">');
        report.home = true; changed = true;
      } else report.skipped.push('index.html (homepage section)');
    }
  }
  if (changed) fs.writeFileSync(file, html);
});

[['common.js', '/*journal-link*/', AR_COMMON], ['index.js', '/*journal-home*/', AR_HOME]].forEach(([n, mark, add]) => {
  const p = path.join(root, 'js', 'lang', 'ar', n);
  if (!fs.existsSync(p)) { report.skipped.push('js/lang/ar/' + n + ' (not found, add the Arabic by hand)'); return; }
  const s = fs.readFileSync(p, 'utf8');
  if (s.indexOf(mark) < 0) fs.writeFileSync(p, s.replace(/\s*$/, '\n') + add.replace(/^\n/, '\n'));
});

console.log('Menu link added to: ' + (report.menu.join(', ') || 'none'));
console.log('Footer link added to: ' + (report.footer.join(', ') || 'none'));
console.log('Homepage section: ' + (report.home ? 'added' : 'already there or not placed'));
if (report.skipped.length) console.log('Skipped (different markup, add by hand): ' + report.skipped.join(', '));

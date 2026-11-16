#!/usr/bin/env node
'use strict';
/* Adds the E-Library to the homepage: a nav link, a section before the Hadith strip, a footer link and the stylesheet.
   If the section is already there, it is refreshed in place and nothing else is touched.
   Run from the project root:  node scripts/add-elibrary-to-home.js
   It edits frontend/index.html in place, only adds lines, and is safe to run twice (it does nothing the second time). */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'frontend', 'index.html');
let html = fs.readFileSync(file, 'utf8');
const SECTION = `<!--elibrary:start-->
<section class="el-home" id="elibrary" aria-label="E-Library">
  <div class="h-wrap">
    <div class="el-h-top">
      <div>
        <p class="el-h-eye"><i></i>Free for everyone · No login</p>
        <h2>The Himaayah<br>E\u2011Library</h2>
        <p class="el-h-lead">Checked links to the Qurʼān, tafsīr, ḥadīth, fiqh, sīrah and research, from Sunni sources only. Open to students, parents and visitors.</p>
        <div class="el-h-btns"><a class="el-h-b el-h-b1" href="library">Open the E\u2011Library \u2192</a><a class="el-h-b el-h-b2" href="library#collection">See the sources</a></div>
      </div>
      <div class="el-h-ph">
        <img src="images/elibrary-intro.jpg" alt="Shelves of books in a library" width="1200" height="900" loading="lazy">
        <div class="el-h-chip el-h-c2"><b>8</b>checked sources</div>
        <div class="el-h-chip el-h-c1"><b>100% free</b>no account needed</div>
      </div>
    </div>
    <div class="el-h-tiles">
      <a class="el-h-t" href="library#cat-quran"><strong>Qurʼān</strong><small>3 sources</small><em>Go \u2192</em></a>
      <a class="el-h-t" href="library#cat-tafsir"><strong>Tafsīr</strong><small>1 source</small><em>Go \u2192</em></a>
      <a class="el-h-t" href="library#cat-hadith"><strong>Ḥadīth</strong><small>1 source</small><em>Go \u2192</em></a>
      <a class="el-h-t" href="library#cat-fiqh"><strong>Fiqh</strong><small>Mālikī texts</small><em>Go \u2192</em></a>
      <a class="el-h-t" href="library#ours"><strong>Sīrah</strong><small>Our guides</small><em>Go \u2192</em></a>
      <a class="el-h-t" href="library#cat-journals"><strong>Research</strong><small>2 sources</small><em>Go \u2192</em></a>
    </div>
  </div>
</section>
<!--elibrary:end-->
`;

const HAS = /<!--elibrary:start-->[\s\S]*?<!--elibrary:end-->\n?/;
if (HAS.test(html)) {
  const next = html.replace(HAS, () => SECTION);
  if (next === html) { console.log('The homepage E-Library section is already up to date. Nothing changed.'); process.exit(0); }
  fs.writeFileSync(file, next);
  console.log('Updated the E-Library section on the homepage. Nothing else on the page was touched.');
  process.exit(0);
}

const steps = [
  ['stylesheet', '<link rel="stylesheet" href="css/home.css">', '<link rel="stylesheet" href="css/home.css">\n<link rel="stylesheet" href="css/elibrary.css">'],
  ['menu link', '<a href="articles">Articles</a>\n        <a href="faq">FAQ</a>', '<a href="articles">Articles</a>\n        <a href="library">E-Library</a>\n        <a href="faq">FAQ</a>'],
  ['section', '<section class="h-sec h-paper h-hadith" aria-label="Hadith">', SECTION + '<section class="h-sec h-paper h-hadith" aria-label="Hadith">'],
  ['footer link', '<a href="resources">Resources</a>', '<a href="library">E-Library</a>\n          <a href="resources">Resources</a>']
];
const missing = [];
steps.forEach(([name, from, to]) => {
  const n = html.split(from).length - 1;
  if (n !== 1) { missing.push(name + ' (found ' + n + ' times, expected 1)'); return; }
  html = html.replace(from, () => to);
});
if (missing.length) { console.error('Stopped without changing anything. Could not place: ' + missing.join('; ') + '. Add the E-Library by hand or ask for help.'); process.exit(1); }
fs.writeFileSync(file, html);
console.log('Added the E-Library to the homepage: stylesheet, menu link, section and footer link.');

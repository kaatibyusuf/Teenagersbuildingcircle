#!/usr/bin/env node
'use strict';
/* Adds the E-Library to the homepage: a nav link, a section before the Hadith strip, a footer link and the stylesheet.
   Run from the project root:  node scripts/add-elibrary-to-home.js
   It edits frontend/index.html in place, only adds lines, and is safe to run twice (it does nothing the second time). */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'frontend', 'index.html');
let html = fs.readFileSync(file, 'utf8');
if (html.includes('<!--elibrary:start-->')) { console.log('The homepage already has the E-Library. Nothing changed.'); process.exit(0); }

const SECTION = `<!--elibrary:start-->
<section class="el-home" id="elibrary" aria-label="E-Library">
  <div class="h-wrap">
    <div>
      <p class="h-eye" style="color:rgba(255,255,255,.6)"><i class="h-dot"></i>Free for everyone, no login</p>
      <h2>The Himaayah E\u2011Library</h2>
      <p>Checked links to the Qurʼān, tafsīr, ḥadīth, fiqh, sīrah and research, from Sunni sources only. Open to students, parents and visitors.</p>
      <a href="library" class="h-btn h-btn-light">Open the E-Library<span class="h-go"><svg width="14" height="14" aria-hidden="true"><use href="#go"/></svg></span></a>
    </div>
    <div class="el-home-tiles">
      <a href="library#cat-quran">Qurʼān</a><a href="library#cat-tafsir">Tafsīr</a><a href="library#cat-hadith">Ḥadīth</a>
      <a href="library#cat-fiqh">Fiqh</a><a href="library#ours">Sīrah</a><a href="library#cat-journals">Research</a>
    </div>
  </div>
</section>
<!--elibrary:end-->

`;
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

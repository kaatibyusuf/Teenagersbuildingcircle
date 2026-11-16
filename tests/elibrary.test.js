'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'frontend');
const D = require(path.join(FE, 'js', 'elibrary-data.js'));
const page = fs.readFileSync(path.join(FE, 'library.html'), 'utf8');

test('every outside source is complete, https, and listed once', () => {
  const urls = new Set(), ids = new Set(), cats = new Set(D.CATS.map((c) => c.id));
  assert.ok(D.SOURCES.length >= 9);
  D.SOURCES.forEach((s) => {
    ['id', 'cat', 'name', 'url', 'by', 'about', 'why'].forEach((k) => assert.ok(s[k] && String(s[k]).trim(), s.id + ' has no ' + k));
    assert.ok(/^https:\/\/[^\s]+$/.test(s.url), s.id + ' is not an https link');
    assert.ok(cats.has(s.cat), s.id + ' has an unknown topic');
    assert.ok(!urls.has(s.url) && !ids.has(s.id), s.id + ' is listed twice');
    urls.add(s.url); ids.add(s.id);
  });
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(D.CHECKED));
});

test('the Qurʼān, tafsīr, ḥadīth, fiqh and research topics each have a source', () => {
  ['quran', 'tafsir', 'hadith', 'fiqh', 'journals'].forEach((c) => assert.ok(D.SOURCES.some((s) => s.cat === c), c + ' is empty'));
});

test('our own links point at pages that exist', () => {
  D.OURS.forEach((o) => assert.ok(fs.existsSync(path.join(FE, o.url + '.html')) || ['store', 'dictionary', 'hadith-bootcamp'].includes(o.url), o.url));
});

test('the E-Library is public: no sign-in, no noindex, data written as text only', () => {
  assert.equal(/auth-guard|noindex|id="sid"|action: 'library'/.test(page), false);
  assert.ok(/<link rel="canonical" href="https:\/\/www\.himaayahschools\.com\/library">/.test(page));
  assert.ok(/<footer class="h-foot">/.test(page), 'no footer');
  assert.ok(/<title>E-Library/.test(page));
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(page), false);
  assert.ok(page.indexOf('js/elibrary-data.js') > 0);
});

test('the student shelf moved to its own page and the dashboard links to both', () => {
  const s = fs.readFileSync(path.join(FE, 'student-library.html'), 'utf8');
  assert.ok(/action: 'library'/.test(s));
  const d = fs.readFileSync(path.join(FE, 'dashboard.html'), 'utf8');
  assert.ok(d.includes('href="student-library"') && d.includes('href="library"'));
  assert.ok(/'student-library': \{/.test(fs.readFileSync(path.join(FE, 'js', 'portal-help.js'), 'utf8')));
});

test('the homepage patch adds the E-Library once, only adds lines, and refuses unknown pages', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'el-'));
  fs.mkdirSync(path.join(dir, 'frontend')); fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(path.join(ROOT, 'scripts', 'add-elibrary-to-home.js'), path.join(dir, 'scripts', 'add-elibrary-to-home.js'));
  const base = '<link rel="stylesheet" href="css/home.css">\n<a href="articles">Articles</a>\n        <a href="faq">FAQ</a>\n<section class="h-sec h-paper h-hadith" aria-label="Hadith">x</section>\n<a href="resources">Resources</a>\n';
  const f = path.join(dir, 'frontend', 'index.html');
  fs.writeFileSync(f, base);
  const run = () => execFileSync('node', [path.join(dir, 'scripts', 'add-elibrary-to-home.js')], { encoding: 'utf8' });
  run();
  const once = fs.readFileSync(f, 'utf8');
  assert.ok(once.includes('id="elibrary"') && once.includes('css/elibrary.css') && once.includes('href="library">E-Library</a>'));
  base.split('\n').forEach((line) => assert.ok(once.includes(line), 'removed: ' + line));
  run(); assert.equal(fs.readFileSync(f, 'utf8'), once);
  fs.writeFileSync(f, '<p>different page</p>');
  assert.throws(run);
  assert.equal(fs.readFileSync(f, 'utf8'), '<p>different page</p>');
});

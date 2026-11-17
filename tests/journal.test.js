'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createEnv } = require('./helpers/gas');
const page = require('../frontend/js/journal.js');

const FE = path.join(__dirname, '..', 'frontend');
const POEM = 'يا ليلُ طُلْ أو لا تَطُلْ\nلا بُدَّ للفجرِ أن يُطِلّْ\n\nوالصبحُ يأتي على مهلٍ\nكما تأتي الأمنياتُ';
const pdf = (n) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(n || 3000, 48)]).toString('base64');
const good = (o) => Object.assign({ action: 'jrn_submit', title: 'ليلٌ وفجر', author: 'عائشة يوسف', email: 'a@example.com', programme: 'Madrasah', genre: 'Poem', text: POEM, own: true }, o || {});

function envWithDrive() {
  const env = createEnv(), files = [];
  env.ctx.Utilities.base64Decode = (s) => Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b));
  env.ctx.Utilities.newBlob = (bytes, mime, name) => ({ bytes, mime, name });
  env.ctx.Session.getEffectiveUser = () => ({ getEmail: () => 'owner@example.com' });
  const folder = { getId: () => 'FOLDER1', createFile: (b) => { const f = { id: 'F' + (files.length + 1), blob: b, sharing: null, getId() { return this.id; }, setDescription() {}, setSharing(a, p) { this.sharing = [a, p]; } }; files.push(f); return f; } };
  env.ctx.DriveApp = { getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => folder, getFolderById: () => folder, getFileById: (id) => files.filter((f) => f.id === id)[0],
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' } };
  env.files_ = files;
  return env;
}
const send = (env, p) => env.call('journalFromRequest', p);
const rows = (env) => { const d = env.sheets['Journal'].data, h = d[0]; return d.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const approve = (env, i) => { const sh = env.sheets['Journal'], h = sh.data[0]; sh.data[i + 1][h.indexOf('Status')] = 'Approved'; };

test('an Arabic poem is saved as New with its line breaks, and staff are emailed', () => {
  const env = envWithDrive();
  const r = send(env, good());
  assert.equal(r.ok, true, JSON.stringify(r));
  const row = rows(env)[0];
  assert.equal(row.Status, 'New'); assert.equal(row.Text, POEM); assert.match(row.ID, /^JR-[A-Z0-9]{6}$/);
  assert.equal(env.mail.length, 1); assert.match(env.mail[0].body, /"Journal" tab/);
});

test('nothing is public until approved; then the list shows an excerpt and the reader shows the whole text', () => {
  const env = envWithDrive();
  const id = send(env, good()).id;
  assert.equal(send(env, { action: 'jrn_list' }).works.length, 0);
  assert.equal(send(env, { action: 'jrn_get', id }).ok, false);
  approve(env, 0);
  env.run("CacheService.getScriptCache().remove('jrn_list')");   // the real list refreshes by itself within 10 minutes
  const list = send(env, { action: 'jrn_list' });
  assert.equal(list.works.length, 1); assert.ok(list.works[0].Excerpt.startsWith('يا ليلُ')); assert.ok(!('Text' in list.works[0]));
  const got = send(env, { action: 'jrn_get', id });
  assert.equal(got.ok, true); assert.equal(got.work.Text, POEM);
  assert.ok(!JSON.stringify(list).includes('a@example.com') && !JSON.stringify(got).includes('a@example.com'));
});

test('an attached PDF is private until approval, then shared and linked', () => {
  const env = envWithDrive();
  const id = send(env, good({ file: pdf(), ext: 'pdf' })).id;
  assert.equal(env.files_.length, 1); assert.equal(env.files_[0].sharing, null);
  assert.equal(send(env, { action: 'jrn_get', id }).ok, false);
  approve(env, 0);
  const got = send(env, { action: 'jrn_get', id });
  assert.match(got.work.FileUrl, /^https:\/\/drive\.google\.com\/file\/d\/F1\/view$/);
  assert.deepEqual(env.files_[0].sharing, ['ANYONE_WITH_LINK', 'VIEW']);
});

test('bad input is refused with a clear reason', () => {
  const env = envWithDrive();
  const cases = [[{ title: 'ab' }, /title/], [{ email: 'nope' }, /email/i], [{ programme: 'X' }, /programme/i], [{ genre: '' }, /type of work/], [{ text: 'قصير' }, /at least 40/],
    [{ text: 'This is an English poem that is certainly long enough to pass the length check.' }, /Arabic/], [{ own: false }, /own work/], [{ text: 'ب'.repeat(20001) }, /20,000/], [{ author: '' }, /name/]];
  cases.forEach(([o, re]) => { const r = send(env, good(o)); assert.equal(r.ok, false, JSON.stringify(o).slice(0, 60)); assert.match(r.error, re); });
  assert.equal(env.sheets['Journal'], undefined);
});

test('a translation may be partly English, but a poem must be mostly Arabic', () => {
  const env = envWithDrive();
  const mixed = 'يا ليلُ طُلْ أو لا تَطُلْ\nO night, last long or do not last\nلا بُدَّ للفجرِ أن يُطِلّْ\nThe dawn must surely appear';
  assert.equal(send(env, good({ genre: 'Translation', text: mixed, email: 't@example.com' })).ok, true);
  assert.equal(send(env, good({ genre: 'Poem', text: mixed, email: 'p@example.com' })).ok, false);
});

test('PDF checks: only real PDFs, not empty, not too large', () => {
  const env = envWithDrive();
  assert.match(send(env, good({ file: pdf(), ext: 'docx' })).error, /PDF/);
  assert.match(send(env, good({ file: Buffer.from('MZ' + 'x'.repeat(3000)).toString('base64'), ext: 'pdf' })).error, /not a real PDF/);
  assert.match(send(env, good({ file: pdf(50), ext: 'pdf' })).error, /empty/);
  assert.match(send(env, good({ file: pdf(8 * 1024 * 1024), ext: 'pdf' })).error, /too large/);
  assert.equal(env.files_.length, 0);
});

test('spam protection: honeypot is silent, and one email cannot flood the sheet', () => {
  const env = envWithDrive();
  assert.equal(send(env, good({ website: 'http://spam' })).ok, true);
  assert.equal(env.sheets['Journal'], undefined);
  for (let i = 0; i < 3; i++) assert.equal(send(env, good({ title: 'عنوان ' + i + ' هنا' })).ok, true);
  assert.match(send(env, good({ title: 'عنوان رابع' })).error, /tomorrow/);
});

test('a title or text that starts like a formula is stored as text', () => {
  const env = envWithDrive();
  assert.equal(send(env, good({ title: '=HYPERLINK("http://x","click")' })).ok, true);
  assert.equal(rows(env)[0].Title, '=HYPERLINK("http://x","click")');
});

test('doPost routes jrn_ actions, and the old research route is gone', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8');
  assert.match(code, /\^jrn_\/[\s\S]{0,60}journalFromRequest/); assert.ok(!/researchFromRequest/.test(code));
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'backend', 'Research.gs')));
});

test('the page and the server use the same lists and limits', () => {
  const env = createEnv();
  assert.deepEqual(page.GENRES, env.run('JR_GENRES')); assert.deepEqual(page.PROGRAMMES, env.run('JR_PROGRAMMES'));
  assert.equal(page.MAX_BYTES, env.run('JR_MAX_BYTES')); assert.equal(page.MAX_TEXT, env.run('JR_MAX_TEXT')); assert.equal(page.MIN_TEXT, env.run('JR_MIN_TEXT'));
});

test('search ignores vowel marks and alef forms', () => {
  assert.equal(page.norm('أَحْمَد'), page.norm('احمد'));
  assert.equal(page.norm('مدرسة'), page.norm('مدرسه'));
  assert.ok(page.arabicShare('قصيدة') === 1 && page.arabicShare('poem') === 0);
});

test('the journal page is English first, uses the site language switch, and is safe and flat', () => {
  const html = fs.readFileSync(path.join(FE, 'journal.html'), 'utf8'), js = fs.readFileSync(path.join(FE, 'js', 'journal.js'), 'utf8'), css = fs.readFileSync(path.join(FE, 'css', 'journal.css'), 'utf8');
  assert.match(html, /<html lang="en" class="site page-journal">/); assert.ok(!/<main[^>]*dir="rtl"/.test(html));
  assert.ok(html.includes('js/i18n.js') && html.includes('js/journal.js') && html.includes('css/journal.css') && html.includes('Amiri') && html.includes('Newsreader'));
  assert.ok(html.includes('href="journal-submit"') && !html.includes('id="jnForm"'));
  assert.match(html, /<dialog class="jn-reader"/); assert.match(html, /id="jnRText" dir="rtl" lang="ar"/);
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(js));
  assert.ok(!/gradient/.test(css) && !/gradient|data-theme/.test(html));
  ['masthead', 'submit', 'news', 'standards'].forEach((n) => assert.ok(fs.existsSync(path.join(FE, 'images', 'journal-' + n + '.jpg')), n));
  assert.ok(!fs.existsSync(path.join(FE, 'research.html')));
});

test('every message the page or the server can show has an Arabic translation', () => {
  const dict = {};
  vmRun(fs.readFileSync(path.join(FE, 'js', 'lang', 'ar', 'journal.js'), 'utf8'), dict);
  const js = fs.readFileSync(path.join(FE, 'js', 'journal.js'), 'utf8'), gs = fs.readFileSync(path.join(__dirname, '..', 'backend', 'Journal.gs'), 'utf8');
  const msgs = [...js.matchAll(/^    \w+: '((?:[^'\\]|\\.)*)',?$/gm)].map((m) => m[1].replace(/\\'/g, "'"));
  const server = [...gs.matchAll(/jr_err_\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1].replace(/\\'/g, "'"));
  assert.ok(msgs.length >= 18 && server.length >= 15, msgs.length + ' / ' + server.length);
  msgs.concat(server).forEach((m) => assert.ok(dict[m], 'no Arabic for: ' + m));
  ['Poem', 'Short story', 'Essay', 'Reflection', 'Translation', 'Research paper', 'Alumni', 'Guest', 'Featured'].forEach((m) => assert.ok(dict[m], m));
});
function vmRun(src, out) { new Function('HS_I18N', src)({ add: (o) => Object.assign(out, o) }); }

test('every genre has a cover photo and a matching style rule', () => {
  const fs = require('fs'), path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '../frontend/css/journal.css'), 'utf8');
  ['poem', 'story', 'essay', 'reflection', 'translation', 'research'].forEach((k) => {
    assert.ok(fs.existsSync(path.join(__dirname, '../frontend/images/journal-g-' + k + '.jpg')), k);
    assert.ok(css.indexOf('.jn-g-' + k + ' ') >= 0, k);
  });
});

test('the submission page has the guidelines, the form, and Arabic for all of it', () => {
  const html = fs.readFileSync(path.join(FE, 'journal-submit.html'), 'utf8');
  assert.match(html, /<html lang="en" class="site page-journal-submit page-journal">/);
  ['jnForm', 'fTitle', 'fAuthor', 'fEmail', 'fGenre', 'fProg', 'fSid', 'fText', 'fBio', 'fFile', 'fOwn', 'fWeb', 'jnSend', 'jnMsg', 'fCount'].forEach((id) => assert.ok(html.includes('id="' + id + '"'), id));
  ['glance', 'types', 'how', 'guidelines', 'before', 'form'].forEach((id) => assert.ok(html.includes('id="' + id + '"'), id));
  assert.ok(html.includes('js/journal.js') && html.includes('js/i18n.js') && !/gradient/.test(html));
  const dict = {};
  vmRun(fs.readFileSync(path.join(FE, 'js', 'lang', 'ar', 'journal-submit.js'), 'utf8'), dict);
  const missing = [];
  const strip = (t) => t.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const body = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  [...body.matchAll(/>([^<>]*[A-Za-z][^<>]*)</g)].map((m) => strip(m[1])).filter((t) => t && !/^\d|^Choose$/.test(t)).forEach((t) => { if (!dict[t]) missing.push(t); });
  [...body.matchAll(/(?:placeholder|alt)="([^"]+)"/g)].forEach((m) => { if (!dict[strip(m[1])]) missing.push(m[1]); });
  assert.deepEqual(missing.filter((t) => t !== 'Choose' && t !== '0 / 20000' && t !== 'Leave this empty'), []);
  const jsrc = fs.readFileSync(path.join(FE, 'js', 'journal.js'), 'utf8');
  assert.ok(/on\('jnForm', 'submit', submit\)/.test(jsrc) && /if \(\$\('jnList'\)\) load\(\)/.test(jsrc));
});

test('the spam-trap field is hidden whatever it sits inside', () => {
  const css = fs.readFileSync(path.join(FE, 'css', 'journal.css'), 'utf8');
  assert.match(css, /^\.jn-hp \{[^}]*clip-path/m);
});

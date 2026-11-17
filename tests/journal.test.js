'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createEnv } = require('./helpers/gas');
const page = require('../frontend/js/journal.js');

const FE = path.join(__dirname, '..', 'frontend');
const POEM = 'يا ليلُ طُلْ أو لا تَطُلْ\nلا بُدَّ للفجرِ أن يُطِلّْ\n\nوالصبحُ يأتي على مهلٍ\nكما تأتي الأمنياتُ';
const BIO = 'I am a quiet person who likes to listen before I speak. I enjoy long walks, tea with my grandmother, and fixing small things around the house. I get nervous in crowds but I love one good conversation. I am learning to be more patient every day.';
function crc32(buf) { let c, crc = -1; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ -1) >>> 0; }
/* a minimal real zip with the entries given (stored, not compressed): enough to look like a Word file */
function zip(entries) {
  const parts = [], central = []; let offset = 0;
  entries.forEach(([name, data]) => {
    const n = Buffer.from(name), d = Buffer.from(data), crc = crc32(d), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
    parts.push(h, n, d);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, n); offset += 30 + n.length + d.length;
  });
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat(parts.concat([cd, end]));
}
const docx = (n) => zip([['[Content_Types].xml', '<Types/>'], ['word/document.xml', '<w:document>' + 'x'.repeat(n || 3000) + '</w:document>']]).toString('base64');
const fakeZipNoDoc = () => zip([['readme.txt', 'x'.repeat(3000)]]).toString('base64');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/* a Word file the way a writer fills in the template: the work, then the heading "About the writer", then the bio */
function writerDoc(work, bio, heading) {
  const para = (t) => (t === '' ? '<w:p/>' : '<w:p><w:r><w:t xml:space="preserve">' + esc(t) + '</w:t></w:r></w:p>');
  const body = String(work).split('\n').map(para).join('') + (heading === null ? '' : '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>' + (heading || 'About the writer') + '</w:t></w:r></w:p>') + String(bio).split('\n').map(para).join('');
  return zip([['[Content_Types].xml', '<Types/>'], ['docProps/app.xml', '<Properties>' + ' '.repeat(1500) + '</Properties>'], ['word/document.xml', '<w:document><w:body>' + body + '</w:body></w:document>']]).toString('base64');
}
const good = (o) => {
  const x = Object.assign({ text: POEM, bio: BIO }, o || {}), t = x.text, b = x.bio;
  delete x.text; delete x.bio;
  return Object.assign({ action: 'jrn_submit', title: 'ليلٌ وفجر', author: 'عائشة يوسف', email: 'a@example.com', programme: 'Madrasah', genre: 'Poem', own: true, ext: 'docx', file: writerDoc(t, b, x.heading) }, x, { heading: undefined });
};

function envWithDrive() {
  const env = createEnv(), files = [];
  env.ctx.Utilities.base64Decode = (s) => Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b));
  env.ctx.Utilities.newBlob = (bytes, mime, name) => ({ bytes, mime, name });
  env.ctx.Utilities.unzip = (blob) => {
    const b = Buffer.from(blob.bytes.map((x) => x & 255)), out = [];
    let i = 0;
    while (i + 30 <= b.length && b.readUInt32LE(i) === 0x04034b50) { const size = b.readUInt32LE(i + 18), nl = b.readUInt16LE(i + 26), name = b.slice(i + 30, i + 30 + nl).toString(); const data = b.slice(i + 30 + nl, i + 30 + nl + size).toString('utf8'); out.push({ getName: () => name, getDataAsString: () => data }); i += 30 + nl + size; }
    if (!out.length) throw new Error('not a zip');
    return out;
  };
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

test('an attached Word document is private until approval, then shared and linked', () => {
  const env = envWithDrive();
  const id = send(env, good()).id;
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
    [{ text: 'This is an English poem that is certainly long enough to pass the length check.' }, /Arabic/], [{ own: false }, /own work/], [{ author: '' }, /name/], [{ file: '' }, /Word document/], [{ heading: null }, /About the writer/]];
  cases.forEach(([o, re]) => { const r = send(env, good(o)); assert.equal(r.ok, false, JSON.stringify(o).slice(0, 60)); assert.match(r.error, re); });
  assert.equal(env.sheets['Journal'], undefined);
});

test('a translation may be partly English, but a poem must be mostly Arabic', () => {
  const env = envWithDrive();
  const mixed = 'يا ليلُ طُلْ أو لا تَطُلْ\nO night, last long or do not last\nلا بُدَّ للفجرِ أن يُطِلّْ\nThe dawn must surely appear';
  assert.equal(send(env, good({ genre: 'Translation', text: mixed, email: 't@example.com' })).ok, true);
  assert.equal(send(env, good({ genre: 'Poem', text: mixed, email: 'p@example.com' })).ok, false);
});

test('attachment checks: only real Word documents, not empty, not too large', () => {
  const env = envWithDrive();
  assert.match(send(env, good({ file: docx(), ext: 'pdf' })).error, /Word document/);
  assert.match(send(env, good({ file: Buffer.from('%PDF-1.4' + 'x'.repeat(3000)).toString('base64'), ext: 'docx' })).error, /not a real Word document/);
  assert.match(send(env, good({ file: fakeZipNoDoc(), ext: 'docx' })).error, /not a real Word document/);
  assert.match(send(env, good({ file: docx(50).slice(0, 40), ext: 'docx' })).error, /empty|not a real/);
  assert.match(send(env, good({ file: docx(8 * 1024 * 1024), ext: 'docx' })).error, /too large/);
  assert.equal(env.files_.length, 0);
});

test('the bio is required, 30 to 200 words, and kept as one paragraph', () => {
  const env = envWithDrive();
  assert.match(send(env, good({ bio: '' })).error, /bio/);
  assert.match(send(env, good({ bio: 'I am kind and quiet.' })).error, /at least 30 words/);
  assert.match(send(env, good({ bio: 'word '.repeat(201) })).error, /over 200 words/);
  assert.equal(send(env, good({ bio: 'word '.repeat(200) })).ok, true);
  assert.equal(send(env, good({ email: 'b@example.com', bio: BIO.replace('. ', '.\n\n') })).ok, true);
  assert.ok(!/\n/.test(rows(env)[1].Bio));
  assert.equal(page.wordCount(BIO), BIO.split(' ').length);
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
  assert.equal(page.BIO_MIN, env.run('JR_BIO_MIN')); assert.equal(page.BIO_MAX, env.run('JR_BIO_MAX'));
  assert.equal(page.MAX_BYTES, env.run('JR_MAX_BYTES')); assert.equal(page.MIN_TEXT, env.run('JR_MIN_TEXT'));
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
  ['jnForm', 'fTitle', 'fAuthor', 'fEmail', 'fGenre', 'fProg', 'fSid', 'fFile', 'fOwn', 'fWeb', 'jnSend', 'jnMsg'].forEach((id) => assert.ok(html.includes('id="' + id + '"'), id));
  ['glance', 'prizes', 'types', 'length', 'timelines', 'guidelines', 'seek', 'before', 'form'].forEach((id) => assert.ok(html.includes('id="' + id + '"'), id));
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

test('the prizes and the Word-only rule are on the page', () => {
  const html = fs.readFileSync(path.join(FE, 'journal-submit.html'), 'utf8');
  ['₦50,000', '₦30,000', '₦20,000'].forEach((x) => assert.ok(html.includes(x), x));
  assert.equal((html.match(/jn-cert">and a certificate/g) || []).length, 3);
  assert.ok(html.includes('accept=".docx,') && !/pdf/i.test(html.slice(html.indexOf('<main'), html.indexOf('</main>'))));
});

test('the timelines are real dates in 2027 and in order', () => {
  const html = fs.readFileSync(path.join(FE, 'journal-submit.html'), 'utf8');
  const when = [...html.matchAll(/class="jn-when">([^<]+)</g)].map((m) => m[1]);
  assert.equal(when.length, 6);
  const dates = [];
  when.forEach((w) => { [...w.matchAll(/(January|February|March|April|May|June|July|August|September|October|November|December) (\d+)(?:, (\d{4}))?/g)].forEach((m) => dates.push([m[1], +m[2]])); assert.match(w, /2027$/); });
  const days = { January: 31, February: 28, March: 31, April: 30, May: 31, June: 30, July: 31, August: 31, September: 30, October: 31, November: 30, December: 31 };
  dates.forEach(([mo, d]) => assert.ok(d >= 1 && d <= days[mo], mo + ' ' + d));
  assert.ok(html.includes('₦30,000') && !html.includes('₦300,000'));
});

test('every visible English phrase on the journal page has an Arabic translation', () => {
  const html = fs.readFileSync(path.join(FE, 'journal.html'), 'utf8'), dict = {};
  vmRun(fs.readFileSync(path.join(FE, 'js', 'lang', 'ar', 'journal.js'), 'utf8'), dict);
  const body = html.slice(html.indexOf('<main'), html.indexOf('<footer'));
  const miss = [...body.matchAll(/>([^<>]*[A-Za-z][^<>]*)</g)].map((m) => m[1].replace(/\s+/g, ' ').trim()).filter((t) => t && !dict[t] && t !== 'Search');   // 'Search' comes from the site-wide common.js
  assert.deepEqual(miss, []);
});

test('the guidelines reveal on scroll, safely, and the submission page is styled separately', () => {
  const html = fs.readFileSync(path.join(FE, 'journal-submit.html'), 'utf8'), css = fs.readFileSync(path.join(FE, 'css', 'journal-submit.css'), 'utf8'), js = fs.readFileSync(path.join(FE, 'js', 'journal.js'), 'utf8');
  assert.ok(html.includes('css/journal-submit.css'));
  assert.ok((html.match(/class="jn-rule jn-rv"/g) || []).length === 12 && (html.match(/<li class="jn-rv">/g) || []).length === 6);
  assert.ok(!/<details/.test(html));
  assert.ok(/IntersectionObserver/.test(js) && /prefers-reduced-motion/.test(js) && /prefers-reduced-motion/.test(css));
  assert.ok(/html\.rv \.jn-rv \{[^}]*opacity: 0/.test(css) && !/\.jn-rv \{[^}]*opacity: 0/.test(css.replace(/html\.rv \.jn-rv[^{]*\{[^}]*\}/g, '')));
  assert.ok(!/gradient/.test(css));
  assert.ok(!/border-(top|bottom)\s*:\s*1px/.test(css));
});

test('nothing is pasted: the form has no text boxes, only the Word upload and a template link', () => {
  const html = fs.readFileSync(path.join(FE, 'journal-submit.html'), 'utf8');
  assert.ok(!/<textarea/.test(html)); assert.ok(/id="fFile"[^>]*required/.test(html));
  assert.ok(html.includes('downloads/himaayah-journal-template.docx')); assert.ok(fs.existsSync(path.join(FE, 'downloads', 'himaayah-journal-template.docx')));
  assert.match(send(envWithDrive(), { action: 'jrn_submit', title: 'abc', author: 'abc', email: 'a@example.com', programme: 'Madrasah', genre: 'Poem', own: true, text: POEM, bio: BIO }).error, /Word document/);
});

test('very long work is cut for the sheet but the whole file stays in Drive; headings in Arabic work too', () => {
  const env = envWithDrive();
  assert.equal(send(env, good({ text: 'ب'.repeat(60000) })).ok, true);
  assert.equal(rows(env)[0].Text.length, 45000); assert.equal(env.files_.length, 1);
  assert.equal(send(env, good({ email: 'c@example.com', heading: 'عن الكاتب' })).ok, true);
});

test('the journal page sends writers to the submission page', () => {
  const html = fs.readFileSync(path.join(FE, 'journal.html'), 'utf8');
  assert.ok(!/href="#submit"/.test(html)); assert.ok(/class="jn-btn jn-btn-line" href="journal-submit">Submit your work/.test(html));
});

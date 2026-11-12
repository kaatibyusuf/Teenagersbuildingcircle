'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const SRC = fs.readFileSync(path.join(FRONTEND, 'js', 'portal-help.js'), 'utf8');
// older copies of three pages that are not linked from the site; they do not use the shared look
const LEGACY = ['academydashboard', 'academyadmin', 'academytutor'];
// "my-card" is a different kind of page (a section, not a sign-in card)
const SKIP = LEGACY.concat(['my-card']);

function load(pathname) {
  const win = { location: { pathname: pathname } };
  const ctx = vm.createContext({ window: win, location: win.location, document: { readyState: 'loading', addEventListener: function () {} } });
  vm.runInContext(SRC, ctx);
  return { PH: win.PortalHelp, ctx: ctx };
}
const signInPages = fs.readdirSync(FRONTEND).filter((f) => /\.html$/.test(f)).map((f) => f.replace(/\.html$/, ''))
  .filter((n) => SKIP.indexOf(n) < 0 && /id="login"/.test(fs.readFileSync(path.join(FRONTEND, n + '.html'), 'utf8')) && /id="lf"/.test(fs.readFileSync(path.join(FRONTEND, n + '.html'), 'utf8')));

test('the script is valid and there are sign-in pages to check', () => {
  assert.ok(load('/dashboard').PH.GUIDES);
  assert.ok(signInPages.length >= 15, 'found ' + signInPages.length + ' sign-in pages');
});

test('every sign-in page has a guide and loads the script', () => {
  const { PH } = load('/dashboard');
  signInPages.forEach((n) => {
    assert.ok(PH.GUIDES[n], n + ' has no guide in portal-help.js');
    assert.match(fs.readFileSync(path.join(FRONTEND, n + '.html'), 'utf8'), /<script src="js\/portal-help\.js" defer><\/script>/, n + ' does not load portal-help.js');
  });
});

test('every guide belongs to a real page', () => {
  const { PH } = load('/dashboard');
  Object.keys(PH.GUIDES).forEach((k) => assert.ok(fs.existsSync(path.join(FRONTEND, k + '.html')), 'guide "' + k + '" has no page'));
});

test('every guide is complete and has no stray text', () => {
  const { PH } = load('/dashboard');
  Object.keys(PH.GUIDES).forEach((k) => {
    const g = PH.GUIDES[k];
    assert.ok(typeof g.title === 'string' && g.title.trim().length >= 4, k + '.title');
    ['who', 'lost'].forEach((f) => assert.ok(typeof g[f] === 'string' && g[f].trim().length > 10, k + '.' + f));
    assert.ok(Array.isArray(g.find) && g.find.length >= 1 && g.find.every((x) => typeof x === 'string' && x.trim()), k + '.find');
    assert.equal(/undefined|null|\bTODO\b/.test(JSON.stringify(g)), false, k);
  });
});

test('the address maps to the right guide, including the clean URLs the site uses', () => {
  assert.equal(load('/academy-tutor').PH.slug(), 'academy-tutor');
  assert.equal(load('/academy-tutor.html').PH.slug(), 'academy-tutor');
  assert.equal(load('/academydashboard').PH.slug(), 'academy-dashboard');
});

test('the Academy guide matches the mock settings in the backend', () => {
  const mocks = fs.readFileSync(path.join(__dirname, '..', 'backend', 'AcademyMocks.gs'), 'utf8');
  const close = Number(mocks.match(/ACM_CLOSE_HOUR = (\d+)/)[1]), mins = Number(mocks.match(/ACM_MINUTES = (\d+)/)[1]);
  const text = load('/dashboard').PH.GUIDES['academy-dashboard'].find.join(' ');
  assert.ok(text.indexOf((close - 12) + ' pm') >= 0, 'guide should say ' + (close - 12) + ' pm');
  assert.ok(text.indexOf(mins + ' minutes') >= 0, 'guide should say ' + mins + ' minutes');
});

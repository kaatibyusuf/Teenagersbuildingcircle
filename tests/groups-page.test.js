'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const SRC = fs.readFileSync(path.join(FRONTEND, 'js', 'groups.js'), 'utf8');

function load(pathname) {
  const win = { location: { pathname: pathname } };
  const ctx = vm.createContext({ window: win, document: { readyState: 'loading', addEventListener: function () {} }, sessionStorage: { getItem: function () { return null; } } });
  vm.runInContext(SRC, ctx);
  return win.ClassGroups;
}

test('the script is valid and knows its pages', () => {
  const CG = load('/dashboard');
  assert.equal(Object.keys(CG.PAGES).length, 8);
  assert.equal(CG.pageName(), 'dashboard');
  assert.equal(load('/teacher.html').pageName(), 'teacher');
});

test('every listed page loads the script and keeps credentials under the listed key', () => {
  const CG = load('/dashboard');
  Object.keys(CG.PAGES).forEach((name) => {
    const html = fs.readFileSync(path.join(FRONTEND, name + '.html'), 'utf8');
    assert.ok(/<script src="js\/groups\.js" defer><\/script>/.test(html), name + ' does not load groups.js');
    const key = CG.PAGES[name].key;
    assert.ok(new RegExp("(KEY\\s*=\\s*'" + key + "'|'" + key + "')").test(html), name + ' does not use the session key ' + key);
    assert.ok(/const API_URL\s*=/.test(html), name + ' has no API_URL');
  });
});

test('student pages are student, staff pages are staff, programmes match the page', () => {
  const P = load('/dashboard').PAGES;
  ['dashboard', 'tbc-dashboard', 'academy-dashboard', 'skills-dashboard'].forEach((n) => assert.equal(P[n].staff, false, n));
  ['teacher', 'tbc-facilitator', 'academy-tutor', 'skills-tutor'].forEach((n) => assert.equal(P[n].staff, true, n));
  assert.equal(P['tbc-facilitator'].programme, 'tbc');
  assert.equal(P['academy-tutor'].programme, 'academy');
  assert.equal(P['skills-dashboard'].programme, 'skills');
  assert.equal(P.teacher.programme, 'madrasah');
});

test('server text is never put into the page as HTML', () => {
  assert.equal(/innerHTML|insertAdjacentHTML|document\.write/.test(SRC), false);
});

test('the server and the page agree on the action names', () => {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'backend', 'Groups.gs'), 'utf8');
  (SRC.match(/'grp_[a-z]_[a-z]+'/g) || []).forEach((a) => assert.ok(gs.indexOf(a) >= 0, a + ' is not handled by Groups.gs'));
});

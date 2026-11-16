'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const PAGES = ['dashboard', 'tbc-dashboard', 'academy-dashboard', 'skills-dashboard'];
const read = (rel) => fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
const JS = read('js/portal-shell.js');
const CSS = read('css/portal-shell.css');

/* Run the page's own "window.PORTAL_SHELL = {...}" block so we can call its settings. */
function settings(name) {
  const html = read(name + '.html');
  const m = html.match(/<script>\s*\/\* Layout settings[\s\S]*?<\/script>/);
  assert.ok(m, name + ' has no layout settings block');
  const code = m[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
  const win = {};
  const ctx = vm.createContext({ window: win, LAST: null, D: null, document: { querySelector: () => null }, nextSession: () => null });
  vm.runInContext(code, ctx);
  return { cfg: win.PORTAL_SHELL, html };
}

test('the script and stylesheet are valid and only touch the page once a student is signed in', () => {
  assert.doesNotThrow(() => new vm.Script(JS));
  assert.ok(/html\.ps-on/.test(CSS), 'styles are not scoped to html.ps-on');
  assert.ok(/^\.ps-side, \.ps-bar, \.ps-scrim \{ display: none; \}/m.test(CSS), 'the shell must be hidden until it is switched on');
});

test('nothing from the school data is ever written as HTML', () => {
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(JS), false);
});

test('every student dashboard loads the stylesheet, the settings and the script, in that order', () => {
  PAGES.forEach((name) => {
    const html = read(name + '.html');
    const css = html.indexOf('<link rel="stylesheet" href="css/portal-shell.css">');
    const cfg = html.indexOf('window.PORTAL_SHELL');
    const js = html.indexOf('<script src="js/portal-shell.js" defer></script>');
    assert.ok(css > 0 && cfg > css && js > cfg, name + ' does not load the layout correctly');
    assert.equal(html.split('<script src="js/portal-shell.js"').length, 2, name + ' loads the script more than once');
  });
});

test('menu items point at things that exist on the page', () => {
  PAGES.forEach((name) => {
    const { cfg, html } = settings(name);
    assert.ok(cfg.programme && cfg.nav.length >= 5, name + ': programme or menu missing');
    cfg.nav.forEach((it) => {
      const kinds = ['top', 'hash', 'href', 'tab', 'groups'].filter((k) => it[k]);
      assert.equal(kinds.length, 1, name + ': "' + it.label + '" must have exactly one target');
      if (it.hash) assert.ok(html.indexOf('id="' + it.hash + '"') > 0, name + ': no #' + it.hash + ' on the page');
      if (it.href) assert.ok(fs.existsSync(path.join(FRONTEND, it.href + '.html')), name + ': no page ' + it.href);
      if (it.tab) assert.ok(new RegExp("\\['" + it.tab + "', '").test(html), name + ': no tab ' + it.tab);
    });
  });
});

test('the summary cards read the data the page really has', () => {
  const today = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const data = {
    dashboard: { student: { Name: 'A B', AttendancePresent: 14, AttendanceTotal: 16, Juz: 2, CurrentSurah: 'Al-Baqarah', CurrentAyah: 142, NextClass: today(1) + 'T17:00', ClassLink: 'https://meet.example/x' } },
    'tbc-dashboard': { student: { Name: 'A B', AttendancePresent: 7, AttendanceTotal: 8 }, pillars: [{ Rating: 4 }, { Rating: 2 }, {}, {}] },
    'academy-dashboard': { student: { Name: 'A B', ExamDate: today(30) }, metrics: { overall: 72 }, leaderboard: { days: 30, total: 41, me: { Rank: 7 } } },
    'skills-dashboard': { student: { Name: 'A B', Course: 'Graphic Design', Week: 3, Weeks: 6 }, projects: [{ Status: 'Marked' }, { Status: 'To do' }], attendance: { Present: 5, Total: 6 } }
  };
  const expect = {
    dashboard: ['88%', 2], 'tbc-dashboard': ['88%', '3.0'], 'academy-dashboard': [72, 30], 'skills-dashboard': ['50%', 1]
  };
  PAGES.forEach((name) => {
    const { cfg } = settings(name);
    const cards = cfg.stats(data[name]);
    assert.equal(cards.length, 2, name);
    assert.deepEqual(JSON.parse(JSON.stringify(cards.map((c) => c.value))), expect[name], name + ' shows the wrong figures');
    cards.forEach((c) => assert.ok(c.label && typeof c.label === 'string'));
  });
});

test('the banner only offers http(s) class links, and the cards cope with empty data', () => {
  const { cfg } = settings('dashboard');
  const evil = cfg.hello({ student: { NextClass: '2030-01-01T10:00', ClassLink: 'javascript:alert(1)' } });
  assert.equal(evil.cta.hash, 'timetable');
  assert.equal(cfg.hello({ student: { NextClass: '2030-01-01T10:00', ClassLink: 'https://meet.example/x' } }).cta.href, 'https://meet.example/x');
  PAGES.forEach((name) => {
    const { cfg: c } = settings(name);
    assert.doesNotThrow(() => c.stats({ student: { Name: 'A' } }), name + ' breaks on a brand-new student');
    assert.doesNotThrow(() => c.hello({ student: { Name: 'A' } }), name + ' banner breaks on a brand-new student');
  });
});

test('the Skills page exposes its data to the layout', () => {
  assert.ok(/window\.__lastData = d;/.test(read('skills-dashboard.html')));
});

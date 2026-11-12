'use strict';
/**
 * A tiny fake of Google Apps Script, so the real .gs files in /backend can be tested in plain Node.
 * It supplies an in-memory spreadsheet (tabs are 2-D arrays), Utilities, locks, cache, properties, mail, triggers.
 * Every sent email is recorded in env.mail so tests can check it.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BACKEND = path.join(__dirname, '..', '..', 'backend');
const FIRST = ['Code.gs', 'Academy.gs', 'AcademyMocks.gs'];   // loaded first; the rest follow alphabetically

function fmt(date, pattern, tz) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' })
    .formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
  if (pattern === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1);
  return pattern.replace("'T'", 'T').replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
}

function makeSheet(name, book) {
  const sh = { name: name, data: [], frozen: 0 };
  const grow = function (r, c) {
    while (sh.data.length < r) sh.data.push([]);
    for (let i = 0; i < sh.data.length; i++) while (sh.data[i].length < c) sh.data[i].push('');
  };
  const range = function (r, c, nr, nc) {
    nr = nr || 1; nc = nc || 1;
    const R = {
      getValues: function () { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (sh.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } o.push(row); } return o; },
      setValues: function (v) { grow(r - 1 + v.length, c - 1 + (v[0] || []).length); v.forEach(function (row, i) { row.forEach(function (x, j) { sh.data[r - 1 + i][c - 1 + j] = x; }); }); return R; },
      setValue: function (x) { grow(r, c); sh.data[r - 1][c - 1] = x; return R; },
      getValue: function () { return R.getValues()[0][0]; },
      setNumberFormat: function () { return R; }, setFontWeight: function () { return R; }, setBackground: function () { return R; }, setWrap: function () { return R; },
      setDataValidation: function () { return R; }
    };
    return R;
  };
  sh.getName = function () { return name; };
  sh.getLastRow = function () { let n = 0; sh.data.forEach(function (row, i) { if (row.some(function (x) { return x !== '' && x != null; })) n = i + 1; }); return n; };
  sh.getLastColumn = function () { let n = 0; sh.data.forEach(function (row) { row.forEach(function (x, j) { if (x !== '' && x != null) n = Math.max(n, j + 1); }); }); return n; };
  sh.getMaxRows = function () { return Math.max(1000, sh.data.length); };
  sh.getRange = range;
  sh.getDataRange = function () { return range(1, 1, Math.max(sh.getLastRow(), 1), Math.max(sh.getLastColumn(), 1)); };
  sh.setFrozenRows = function (n) { sh.frozen = n; };
  sh.clearContents = function () { sh.data = []; };
  sh.deleteRows = function (at, n) { sh.data.splice(at - 1, n); };
  sh.autoResizeColumns = function () {};
  sh.setColumnWidth = function () {};
  return sh;
}

function createEnv(opts) {
  opts = opts || {};
  const tz = opts.tz || 'Africa/Lagos';
  const env = { mail: [], props: {}, triggers: [], sheets: {}, tz: tz };
  const book = {
    getSheetByName: function (n) { return env.sheets[n] || null; },
    insertSheet: function (n) { env.sheets[n] = makeSheet(n, book); return env.sheets[n]; },
    getSpreadsheetTimeZone: function () { return tz; },
    getSheets: function () { return Object.keys(env.sheets).map(function (k) { return env.sheets[k]; }); },
    toast: function () {}, setSpreadsheetTimeZone: function () {}, getId: function () { return 'FAKE'; }
  };
  const chain = function () { const t = { timeBased: function () { return t; }, onWeekDay: function () { return t; }, atHour: function () { return t; }, everyDays: function () { return t; }, create: function () { env.triggers.push(1); return t; } }; return t; };
  const sandbox = {
    console: { log: function () {}, error: function () {}, warn: function () {} },
    Logger: { log: function () {} },
    Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, String: String, Number: Number, RegExp: RegExp, Error: Error, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, Intl: Intl,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return book; }, openById: function () { return book; }, getUi: function () { return { createMenu: function () { const m = { addItem: function () { return m; }, addSeparator: function () { return m; }, addSubMenu: function () { return m; }, addToUi: function () {} }; return m; }, alert: function () {} }; } },
    Utilities: { formatDate: fmt.bind(null), getUuid: function () { return require('crypto').randomUUID(); }, sleep: function () {}, base64Encode: function (s) { return Buffer.from(s).toString('base64'); } },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
    CacheService: { getScriptCache: function () { const c = {}; return { get: function (k) { return c[k] || null; }, put: function (k, v) { c[k] = v; }, remove: function (k) { delete c[k]; } }; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return env.props[k] == null ? null : env.props[k]; }, setProperty: function (k, v) { env.props[k] = v; } }; } },
    MailApp: { sendEmail: function (m) { env.mail.push(m); }, getRemainingDailyQuota: function () { return 100; } },
    ScriptApp: { getProjectTriggers: function () { return []; }, newTrigger: function () { return chain(); }, deleteTrigger: function () {}, WeekDay: { MONDAY: 1, THURSDAY: 4 } },
    ContentService: { createTextOutput: function (s) { return { s: s, setMimeType: function () { return this; } }; }, MimeType: { JSON: 'json' } },
    HtmlService: {}, Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; } }
  };
  sandbox.Utilities.formatDate = function (d, z, p) { return fmt(d, p, z); };
  vm.createContext(sandbox);
  const files = fs.readdirSync(BACKEND).filter(function (f) { return /\.gs$/.test(f); });
  const order = FIRST.filter(function (f) { return files.indexOf(f) >= 0; }).concat(files.filter(function (f) { return FIRST.indexOf(f) < 0; }).sort(function (a, b) { return a.localeCompare(b, 'en', { numeric: true }); }));
  order.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(BACKEND, f), 'utf8'), sandbox, { filename: f }); });
  env.ctx = sandbox;
  const plain = function (x) { return x !== null && typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : x; };   // arrays from the sandbox are a different realm, so copy them
  env.run = function (code) { return plain(vm.runInContext(code, sandbox)); };
  env.call = function (fn) { const a = [].slice.call(arguments, 1); sandbox.__a = a; return plain(vm.runInContext(fn + '.apply(null, __a)', sandbox)); };
  env.files = order;
  return env;
}

module.exports = { createEnv: createEnv, BACKEND: BACKEND };

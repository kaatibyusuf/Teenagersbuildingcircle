'use strict';
// Fails if any backend .gs file or inline <script> in an .html page has a syntax error.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let bad = 0, checked = 0;
function check(label, code) {
  checked++;
  try { new Function(code); } catch (e) { bad++; console.error('SYNTAX ERROR in ' + label + ': ' + e.message); }
}
function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
    if (d.name === 'node_modules' || d.name.startsWith('.')) return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out); else out.push(p);
  });
  return out;
}
walk(root, []).forEach(function (f) {
  const rel = path.relative(root, f);
  if (/\.gs$/.test(f)) check(rel, fs.readFileSync(f, 'utf8'));
  else if (/\.html$/.test(f)) {
    const html = fs.readFileSync(f, 'utf8'), re = /<script(?![^>]*\bsrc=)(?![^>]*type=["'](?!text\/javascript|module)[^"']*["'])[^>]*>([\s\S]*?)<\/script>/gi;
    let m, i = 0;
    while ((m = re.exec(html))) { i++; if (m[1].trim()) check(rel + ' (script ' + i + ')', m[1]); }
  }
});
console.log('Checked ' + checked + ' scripts, ' + bad + ' with errors.');
process.exit(bad ? 1 : 0);

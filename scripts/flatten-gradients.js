#!/usr/bin/env node
'use strict';
/* Removes decorative gradients from the whole website, so everything is flat colour.
   Run from the project root:  node scripts/flatten-gradients.js          (changes the files)
                               node scripts/flatten-gradients.js --check  (changes nothing, lists what it would change)
   It reads every .css and .html file under frontend/ (including <style> blocks and style="" attributes).

   Rules, applied to the background, mask and border-image properties:
   - A gradient that fades to transparent (glows, shadows, edge fades) is removed.
   - Any other gradient becomes its first colour, as a flat fill.
   - A gradient with hard stops (progress bars, stripes, pie charts) carries meaning, so it is left alone and listed.
   - Mask and border-image gradients are removed.
   It is safe to run twice. */
const fs = require('fs');
const path = require('path');

const PROPS = /(?<![\w-])(background-image|background|-webkit-mask-image|-webkit-mask|mask-image|mask|border-image-source|border-image)\s*:\s*/g;
const GRAD = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/;

function matchParen(s, open) { // index of the ")" that closes the "(" at open
  let d = 0;
  for (let i = open; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')') { d--; if (!d) return i; } }
  return -1;
}
function splitTop(s) { // split on commas outside brackets
  const out = []; let d = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') d++; if (ch === ')') d--;
    if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
function tokens(s) { // split on whitespace outside brackets
  const out = []; let d = 0, cur = '';
  for (const ch of s.trim()) {
    if (ch === '(') d++; if (ch === ')') d--;
    if (/\s/.test(ch) && d === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur); return out;
}
const SHAPE = /^(to\b|[-+]?[\d.]+(deg|grad|rad|turn)\b|circle|ellipse|closest|farthest|at\b|from\b|in\b|repeating)/i;
function isTransparent(c) {
  c = c.trim().toLowerCase();
  if (c === 'transparent') return true;
  let m = c.match(/^(?:rgba|hsla)\(([^)]*)\)$/);
  if (m) { const p = m[1].split(/[,\/]/); return p.length >= 4 && parseFloat(p[3]) === 0; }
  m = c.match(/^(?:rgb|hsl)\(([^)]*\/\s*)([\d.%]+)\s*\)$/);
  if (m) return parseFloat(m[2]) === 0;
  m = c.match(/^#([0-9a-f]{8}|[0-9a-f]{4})$/);
  if (m) return m[1].length === 8 ? m[1].slice(6) === '00' : m[1][3] === '0';
  return false;
}
/* Looks at one gradient and says what to do with it: {flat: "colour"}, {drop: true} or {keep: true}. */
function judge(fn) {
  const open = fn.indexOf('('), inner = fn.slice(open + 1, fn.length - 1);
  const args = splitTop(inner).map((a) => a.trim()).filter(Boolean);
  if (/^repeating-/.test(fn)) return { drop: true };
  const isShape = (a) => SHAPE.test(a) || /^[-+]?[\d.]/.test(a) || /\bat\b/.test(a.split('(')[0]);
  const stops = args.filter((a, i) => !(i === 0 && isShape(a)));
  if (/^conic-/.test(fn) && stops.length < 1) return { keep: true };
  const parsed = stops.map((a) => { const t = tokens(a); return { colour: t[0], pos: t.slice(1) }; });
  if (parsed.some((p) => p.pos.length > 1)) return { keep: true };           // "colour 0 40%": hard stop
  for (let i = 1; i < parsed.length; i++) {                                      // same position twice in a row: hard stop
    if (parsed[i].pos[0] && parsed[i].pos[0] === parsed[i - 1].pos[0] && parsed[i].pos[0] !== '0%' && parsed[i].pos[0] !== '0') return { keep: true };
  }
  if (/^conic-/.test(fn)) return { keep: true };
  if (parsed.some((p) => isTransparent(p.colour))) return { drop: true };
  if (!parsed.length || !parsed[0].colour) return { keep: true };
  return { flat: parsed[0].colour };
}

function valueEnd(s, from) { // end of a declaration value: ; or } or a quote or a newline-less end, outside brackets
  let d = 0;
  for (let i = from; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') d++; else if (ch === ')') d--;
    else if (d === 0 && (ch === ';' || ch === '}' || ch === '"' || ch === "'" || ch === '<')) return i;
  }
  return s.length;
}

function flatten(text, report) {
  let out = '', last = 0, m;
  PROPS.lastIndex = 0;
  while ((m = PROPS.exec(text))) {
    const start = m.index, vStart = PROPS.lastIndex, vEnd = valueEnd(text, vStart);
    let value = text.slice(vStart, vEnd);
    if (!GRAD.test(value)) continue;
    const prop = m[1].toLowerCase();
    let important = '';
    const im = value.match(/\s*!important\s*$/i); if (im) { important = ' !important'; value = value.slice(0, im.index); }
    const layers = splitTop(value).map((l) => l.trim());
    const kept = []; let colourLayer = null, anyChange = false, anyKept = false, lastWasGradient = false, baseColour = null;
    layers.forEach((layer, idx) => {
      const g = layer.match(GRAD);
      if (!g) { kept.push(layer); lastWasGradient = false; return; }
      const open = layer.indexOf('(', g.index), close = matchParen(layer, open);
      const fn = layer.slice(g.index, close + 1);
      const j = judge(fn);
      if (j.keep) { kept.push(layer); anyKept = true; if (report) report.push(fn.slice(0, 90)); lastWasGradient = false; return; }
      anyChange = true;
      lastWasGradient = idx === layers.length - 1;
      baseColour = j.flat || null;
    });
    if (!anyChange) continue;
    let replacement;
    const isMaskOrBorder = /mask|border-image/.test(prop);
    if (isMaskOrBorder) replacement = anyKept ? null : '';
    else if (anyKept) replacement = null; // mixed: leave alone rather than guess
    else {
      const colour = baseColour && lastWasGradient ? baseColour : null;
      const hasColourLayer = kept.length && !/url\(|gradient\(/.test(kept[kept.length - 1]);
      if (prop === 'background-image') {
        replacement = (kept.length ? 'background-image: ' + kept.join(', ') : 'background-image: none') + (colour ? '; background-color: ' + colour : '') + important;
        if (!kept.length && !colour) replacement = 'background-image: none' + important;
      } else {
        const parts = kept.slice(); if (colour && !hasColourLayer) parts.push(colour);
        replacement = parts.length ? 'background: ' + parts.join(', ') + important : 'background: none' + important;
        if (prop !== 'background') replacement = null;
      }
    }
    if (replacement === null) continue;
    out += text.slice(last, start) + replacement; last = vEnd;
    PROPS.lastIndex = vEnd;
  }
  return out + text.slice(last);
}

function walk(dir, files) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p, files); }
    else if (/\.(css|html)$/i.test(e.name)) files.push(p);
  });
  return files;
}

function main() {
  const check = process.argv.includes('--check');
  const root = path.join(__dirname, '..', 'frontend');
  let changed = 0; const left = [];
  walk(root, []).forEach((f) => {
    const before = fs.readFileSync(f, 'utf8');
    if (!/gradient\(/.test(before)) return;
    const rep = [], after = flatten(before, rep);
    rep.forEach((r) => left.push(path.relative(root, f) + ': ' + r));
    if (after !== before) { changed++; if (!check) fs.writeFileSync(f, after); console.log((check ? 'would change ' : 'changed ') + path.relative(root, f)); }
  });
  console.log('\n' + (check ? 'Would flatten' : 'Flattened') + ' gradients in ' + changed + ' file(s).');
  if (left.length) console.log('Left alone because they carry meaning (progress bars, stripes, charts), please look at these:\n  ' + left.join('\n  '));
}
if (require.main === module) main();
module.exports = { flatten, judge };

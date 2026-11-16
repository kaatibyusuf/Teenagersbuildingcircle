'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { flatten } = require('../scripts/flatten-gradients.js');

test('a two-colour gradient becomes its first colour', () => {
  assert.equal(flatten('.a { background: linear-gradient(180deg, #F3F7FA, #EAF1F6); padding: 1px; }'), '.a { background: #F3F7FA; padding: 1px; }');
  assert.equal(flatten('.a{background:linear-gradient(135deg,var(--hb),#3B88A8)}'), '.a{background: var(--hb)}');
});

test('glows that fade to transparent are removed, and the base colour underneath is kept', () => {
  assert.equal(flatten('.h { background: radial-gradient(60% 40% at 50% 0, #fff 0, rgba(255,255,255,0) 70%), linear-gradient(180deg, #F7F9FB 0%, var(--p) 100%); }'), '.h { background: #F7F9FB; }');
  assert.equal(flatten('.g { background: radial-gradient(70% 60% at 80% 0%, rgba(59,136,168,.28), transparent 70%); }'), '.g { background: none; }');
});

test('an existing colour or image layer is kept', () => {
  assert.equal(flatten('.a { background: linear-gradient(#fff, #eee), url(x.png) center/cover, #123456; }'), '.a { background: url(x.png) center/cover, #123456; }');
});

test('background-image keeps a separate background-color', () => {
  assert.equal(flatten('.a { background-image: linear-gradient(90deg, #111, #222); }'), '.a { background-image: none; background-color: #111; }');
});

test('mask and border-image gradients are removed', () => {
  assert.equal(flatten('.m { -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%); color: red; }'), '.m { ; color: red; }');
});

test('hard-stop gradients (progress rings, bars, stripes) are left alone and reported', () => {
  const css = '.r { background: conic-gradient(var(--c) 40%, #eee 0); } .b { background: linear-gradient(90deg, #0a0 62%, #eee 62%); }';
  const rep = []; assert.equal(flatten(css, rep), css); assert.equal(rep.length, 2);
});

test('inline style attributes and !important work, and running twice changes nothing', () => {
  const once = flatten('<div style="background:linear-gradient(#0F4460,#0A2B40);color:#fff">x</div><p class="z" style="background: linear-gradient(#aaa,#bbb) !important">');
  assert.equal(once, '<div style="background: #0F4460;color:#fff">x</div><p class="z" style="background: #aaa !important">');
  assert.equal(flatten(once), once);
});

test('url() values and other properties are never touched', () => {
  const css = '.a { background: url("a;b.png"); box-shadow: 0 0 0 1px rgba(0,0,0,.1); color: red; }';
  assert.equal(flatten(css), css);
});

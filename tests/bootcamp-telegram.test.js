'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

test('only real Telegram links are accepted', () => {
  const e = createEnv();
  assert.equal(e.run("bc_tgOk_('https://t.me/+AbCdEf123')"), true);
  assert.equal(e.run("bc_tgOk_('https://t.me/c/123456/78')"), true);
  assert.equal(e.run("bc_tgOk_('http://t.me/x')"), false);
  assert.equal(e.run("bc_tgOk_('https://t.me.evil.com/x')"), false);
  assert.equal(e.run("bc_tgOk_('javascript:alert(1)')"), false);
  assert.equal(e.run("bc_tgOk_('')"), false);
});

test('a ḥadīth with its own Telegram post links to it; others get the group link', () => {
  const e = createEnv();
  e.run("append_(bc_rec_(), { Hadith: '3', Part: 1, Title: 'Hadith 3', DriveLink: 'https://t.me/c/123456/78' })");
  e.run("append_(bc_rec_(), { Hadith: '5-6', Part: 1, Title: 'x', DriveLink: 'https://evil.example/x' })");
  assert.deepEqual(e.run("bc_tg_(3)"), { url: 'https://t.me/c/123456/78', post: true });
  assert.deepEqual(e.run("bc_tg_(4)"), { url: 'https://t.me/+j3T0tJcXIgRjN2U0', post: false });
  assert.equal(e.run("bc_tg_(5).post"), false);   // a non-Telegram link is never offered; the group link is used
  assert.equal(e.run("bc_recordings_(3, false).length"), 0);   // a Telegram post is not a Drive recording
});

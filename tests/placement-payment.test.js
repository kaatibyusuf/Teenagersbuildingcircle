'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

const pay = (o) => Object.assign({ ref: 'PTF-ABC', kind: 'placement', donorName: 'Hadiza Mohammed Sani', donorEmail: 'h@example.com', donorPhone: '+233243480385', status: 'SUCCEEDED', amount: 3000, currency: 'NGN',
  eventId: 'evt_' + Math.random().toString(36).slice(2), checkoutId: 'ck_1', chargeId: 'ch_1' }, o || {});
const codes = (env) => { const d = env.sheets['Test passes'] ? env.sheets['Test passes'].data : []; return d.slice(1); };

test('a naira payment of the full fee issues a test code', () => {
  const env = createEnv();
  const r = env.call('placementCardPayment_', pay());
  assert.match(r.result, /Test code .* issued/); assert.equal(codes(env).length, 1);
});

test('a payment the card made in another currency (cedis) still issues a code, and the owner is told', () => {
  const env = createEnv(); env.ctx.Session.getEffectiveUser = () => ({ getEmail: () => 'owner@example.com' });
  const r = env.call('placementCardPayment_', pay({ amount: 25, currency: 'GHS' }));
  assert.match(r.result, /Test code .* issued.*GHS 25/); assert.equal(codes(env).length, 1);
  assert.match(env.mail.map((m) => m.subject + m.body).join('|'), /GHS 25/);
  assert.ok(!env.mail.some((m) => /₦25\b/.test(m.body)));
});

test('failed payments and underpayments in naira are still refused', () => {
  const env = createEnv();
  assert.match(env.call('placementCardPayment_', pay({ status: 'FAILED', amount: 25, currency: 'GHS' })).result, /Not a completed/);
  assert.match(env.call('placementCardPayment_', pay({ amount: 500 })).result, /less than the registration fee/);
  assert.match(env.call('placementCardPayment_', pay({ amount: 0, currency: 'GHS' })).result, /Not a completed/);
  assert.equal(codes(env).length, 0);
});

test('the same event is never processed twice', () => {
  const env = createEnv(), p = pay({ amount: 25, currency: 'GHS', eventId: 'evt_same' });
  env.call('placementCardPayment_', p);
  assert.equal(env.call('placementCardPayment_', p).duplicate, true); assert.equal(codes(env).length, 1);
});

test('staff can issue a code by hand for a payment that was missed', () => {
  const env = createEnv();
  const code = env.call('placementIssueCode', 'Hadiza Mohammed Sani', 'h@example.com', '+233243480385');
  assert.match(code, /^[A-Z0-9-]{4,}$/); assert.equal(codes(env).length, 1);
  assert.ok(env.mail.some((m) => /h@example\.com/.test(JSON.stringify(m))));
  assert.throws(() => env.call('placementIssueCode', 'X', 'nope', ''), /valid email/);
});

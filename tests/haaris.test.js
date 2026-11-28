'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./helpers/gas');

function setup() {
  const env = createEnv();
  env.run("SHEETS.Students && ['Students','Assignments','Submissions','Payments','Hifdh','Murajaah','Results','Announcements','Materials','Reminders'].forEach(function (n) { tchEnsure_(ss_(), n, SHEETS[n] || ['StudentID']); })");
  env.run("append_(table_('Students'), { StudentID: 'HM-0001', Name: 'Amina Yusuf', Level: 'Beginner', Plan: 'Full Madrasah', Active: 'TRUE', AccessCode: 'secret-code-1', NextDue: '2099-01-01', MonthlyFee: 15000, PaymentStatus: 'Paid' }, [])");
  env.run("append_(table_('Students'), { StudentID: 'HM-0002', Name: 'Bilal Musa', Level: 'Beginner', Plan: 'Full Madrasah', Active: 'TRUE', AccessCode: 'other-code-22' }, [])");
  env.run("append_(table_('Assignments'), { AssignmentID: 'A-1', Title: 'Recite Hadith 1', Level: 'All', Audience: 'All', Active: 'TRUE', Due: '2099-01-01' }, [])");
  env.props.CARD_SECRET = 's3cret'; env.props.TELEGRAM_BOT_USERNAME = 'HimaayahBot'; env.props.TELEGRAM_BOT_TOKEN = 'TOK';
  return env;
}
const call = (env, p) => env.call('haarisFromRequest', p);

test('ha_me returns the signed-in student\'s own summary and never the access code', () => {
  const env = setup();
  const r = call(env, { action: 'ha_me', id: 'HM-0001', code: 'secret-code-1' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.summary.name, 'Amina Yusuf');
  assert.equal(r.summary.assignments[0].title, 'Recite Hadith 1');
  assert.ok(!JSON.stringify(r).includes('secret-code-1'));
  assert.ok(!JSON.stringify(r).includes('Bilal'));
});

test('ha_me refuses a wrong code', () => {
  const env = setup();
  assert.equal(call(env, { action: 'ha_me', id: 'HM-0001', code: 'nope' }).ok, false);
});

test('Telegram link: token from the dashboard, bound once from the bot, then Haaris knows who it is', () => {
  const env = setup();
  const t = call(env, { action: 'ha_tgtoken', id: 'HM-0001', code: 'secret-code-1' });
  assert.equal(t.ok, true);
  const token = t.url.split('start=')[1];
  assert.match(t.url, /^https:\/\/t\.me\/HimaayahBot\?start=[a-f0-9]{24}$/);
  assert.equal(call(env, { action: 'ha_tgme', chatId: '555', secret: 's3cret' }).linked, false);
  assert.equal(call(env, { action: 'ha_tgbind', chatId: '555', token, secret: 's3cret' }).name, 'Amina Yusuf');
  assert.equal(call(env, { action: 'ha_tgbind', chatId: '556', token, secret: 's3cret' }).ok, false);   // single use
  const me = call(env, { action: 'ha_tgme', chatId: '555', secret: 's3cret' });
  assert.equal(me.linked, true); assert.equal(me.summary.studentId, 'HM-0001');
  assert.equal(call(env, { action: 'ha_tgme', chatId: '999', secret: 's3cret' }).linked, false);
  assert.equal(call(env, { action: 'ha_tgunlink', chatId: '555', secret: 's3cret' }).removed, 1);
  assert.equal(call(env, { action: 'ha_tgme', chatId: '555', secret: 's3cret' }).linked, false);
});

test('bot-side actions need the shared secret', () => {
  const env = setup();
  assert.equal(call(env, { action: 'ha_tgme', chatId: '555' }).ok, false);
  assert.equal(call(env, { action: 'ha_tgme', chatId: '555', secret: 'wrong' }).ok, false);
});

test('a reminder is also pushed to the linked Telegram chat', () => {
  const env = setup(), sent = [];
  env.ctx.UrlFetchApp = { fetch: (url, o) => { sent.push({ url, body: JSON.parse(o.payload) }); return { getResponseCode: () => 200 }; } };
  const token = call(env, { action: 'ha_tgtoken', id: 'HM-0001', code: 'secret-code-1' }).url.split('start=')[1];
  call(env, { action: 'ha_tgbind', chatId: '555', token, secret: 's3cret' });
  assert.equal(env.call('tg_push_', 'HM-0001', 'Your fee is due tomorrow'), 1);
  assert.equal(sent[0].body.chat_id, '555');
  assert.match(sent[0].url, /botTOK\/sendMessage$/);
  assert.equal(env.call('tg_push_', 'HM-0002', 'x'), 0);
});

test('Telegram history uses its own tg phone key', () => {
  const env = setup(); env.ctx.Session.getScriptTimeZone = () => 'Africa/Lagos';
  const r = env.call('waChatFromRequest', { secret: 's3cret', op: 'start', phone: 'tg555', name: 'A', msgId: 'tg1', text: 'hello' });
  assert.equal(r.ok, true);
  assert.equal(env.sheets['WhatsApp chats'].data[1][1], 'tg555');
});

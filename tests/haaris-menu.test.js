'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const API = path.join(__dirname, '..', 'frontend', 'api');
const load = (f) => import('file://' + path.join(API, f).replace(/\\/g, '/'));

const account = { name: 'Amina Yusuf', studentId: 'HM-0001', fee: { status: 'Due soon', nextDue: '2099-01-01', monthly: 15000 }, nextClass: '2099-01-02T16:00', classLink: 'https://meet.example/x',
  assignments: [{ title: 'Recite Hadith 1', status: 'To do', due: '2099-01-05' }], results: [{ date: '2099-01-01', subject: 'Tajweed', type: 'Test', score: '8/10' }], payments: [], announcements: [{ date: '2099-01-01', title: 'Eid break' }] };

test('topics answer from the school information, by button or by words', async () => {
  const { menuReply } = await load('_wa/menu.mjs');
  assert.match(menuReply('what are the fees?').text, /Muraajah \(Personal\): ₦20,000/);
  assert.match(menuReply('topic:fees').text, /₦3,000 registration fee/);
  assert.match(menuReply('how do I pay by transfer').text, /Wema Bank/);
  assert.match(menuReply('I want a refund').text, /first two weeks/);
  assert.match(menuReply('i want to join').text, /two minutes/);
  assert.match(menuReply('talk to a person').text, /Madrasah line: \+234 702 584 2849/);
  assert.ok(menuReply('hi').chips.length >= 6);
  assert.match(menuReply('qwerty').text, /choose a topic/);
});

test('account topics need a signed-in student and show only that student\'s record', async () => {
  const { menuReply } = await load('_wa/menu.mjs');
  assert.match(menuReply('my fees').text, /sign in/);
  assert.match(menuReply('my fees', account).text, /Next due: 1 January 2099/);
  assert.match(menuReply('when is my next class', account).text, /2 January 2099 at 16:00/);
  assert.match(menuReply('assignments', account).text, /Recite Hadith 1: To do, due 5 January 2099/);
  assert.match(menuReply('results', account).text, /Tajweed/);
  assert.match(menuReply('hello', account).text, /Amina/);
  assert.ok(menuReply('hello', account).chips.some((c) => c.label === 'My fees'));
});

test('the website chat falls back to topics when there is no AI key', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { POST } = await load('chat.mjs');
  const r = await POST(new Request('https://www.himaayahschools.com/api/chat', { method: 'POST', headers: { origin: 'https://www.himaayahschools.com', 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', text: 'topic:fees' }] }) }));
  const j = await r.json();
  assert.equal(j.mode, 'menu'); assert.match(j.reply, /Fees/); assert.ok(j.chips.length);
});

test('the Telegram bot answers a button tap from topics and rejects calls without the secret', async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'wh'; process.env.TELEGRAM_BOT_TOKEN = 'TOK'; delete process.env.ANTHROPIC_API_KEY;
  const sent = [], realFetch = global.fetch;
  global.fetch = async (url, o) => {
    const u = String(url), body = o && o.body ? JSON.parse(o.body) : {};
    if (u.includes('api.telegram.org')) { sent.push({ u, body }); return { ok: true, text: async () => '' }; }
    if (body.action === 'ha_tgme') return { json: async () => ({ ok: true, linked: true, summary: account }) };
    return { json: async () => ({ ok: true, history: [] }) };
  };
  try {
    const { POST } = await load('telegram.mjs');
    const bad = await POST(new Request('https://x/api/telegram', { method: 'POST', body: '{}' }));
    assert.equal(bad.status, 403);
    const hdr = { 'x-telegram-bot-api-secret-token': 'wh' };
    await POST(new Request('https://x/api/telegram', { method: 'POST', headers: hdr, body: JSON.stringify({ update_id: 1, callback_query: { id: 'cb1', data: 'topic:myfees', from: { first_name: 'Amina' }, message: { chat: { id: 555, type: 'private' } } } }) }));
    const msg = sent.find((s) => s.u.includes('/sendMessage'));
    assert.match(msg.body.text, /Your fees, Amina Yusuf/);
    assert.ok(msg.body.reply_markup.inline_keyboard.length >= 3);
    assert.ok(sent.some((s) => s.u.includes('answerCallbackQuery')));
  } finally { global.fetch = realFetch; }
});

test('the 100+ question bank: unique ids, every question answers itself, common rewordings land on the right answer', async () => {
  const { FAQ } = await load('_wa/faq.mjs'), { menuReply } = await load('_wa/menu.mjs');
  assert.ok(FAQ.length >= 100, 'at least 100 questions, got ' + FAQ.length);
  assert.equal(new Set(FAQ.map((e) => e[0])).size, FAQ.length);
  for (const e of FAQ) { assert.ok(e[3] && e[3].length > 20, e[0] + ' has an answer'); assert.equal(menuReply(e[1]).text, e[3], 'question "' + e[1] + '" answers itself'); assert.equal(menuReply('faq:' + e[0]).text, e[3]); }
  const ans = (id) => FAQ.find((e) => e[0] === id)[3];
  const cases = { 'how much is utme prep': 'a_fees', 'what do i pay for jamb': 'a_fees', 'do you accept transfer': 'e_bank', 'can my 8 year old join': 'm_who', 'what if i miss a class': 'a_recorded',
    'how do i reset my password': 'p_lost', 'i want my money back': 'e_refund', 'is my child safe online': 'x_gender', 'when is jamb': 'a_dates', 'how do i stop the subscription': 'e_cancel', 'is there a hadith course': 'p_bootcamp' };
  for (const [q, id] of Object.entries(cases)) assert.equal(menuReply(q).text, ans(id), q);
});

test('when it is unsure it offers choices, and a question it has no answer for goes to staff', async () => {
  const { menuReply } = await load('_wa/menu.mjs');
  const r = menuReply('is there a discount for siblings');
  assert.match(r.text, /could not match/); assert.match(r.text, /General line: \+234 704 722 6487/);
  const s = menuReply('timetable');
  assert.match(s.text, /one of these/); assert.ok(s.chips.every((c) => /^faq:/.test(c.text)));
});

test('a signed-in student asking about their own record still gets it before the general answers', async () => {
  const { menuReply } = await load('_wa/menu.mjs');
  assert.match(menuReply('what is my fee status', account).text, /Your fees, Amina Yusuf/);
  assert.match(menuReply('when is my next class', account).text, /2 January 2099/);
  assert.match(menuReply('what happens if my fee is overdue').text, /class links stay paused/);
});

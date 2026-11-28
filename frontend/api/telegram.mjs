// Himaayah Schools Telegram assistant (Telegram bot webhook → Claude → reply). Works without WhatsApp or Meta.
//
// Vercel → Settings → Environment Variables:
//   TELEGRAM_BOT_TOKEN        from @BotFather when you create the bot
//   TELEGRAM_WEBHOOK_SECRET   any long random text you choose (sent back by Telegram on every call, so strangers cannot post here)
//   ANTHROPIC_API_KEY         from console.anthropic.com
//   APPS_SCRIPT_SECRET        the same long text as CARD_SECRET in Apps Script
//   APPS_SCRIPT_URL           optional; defaults to the web app URL the portals already use
// One-time: open https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://www.himaayahschools.com/api/telegram&secret_token=<WEBHOOK_SECRET>
import crypto from 'node:crypto';
import { LINES, converse } from './_wa/core.mjs';

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby0AsifBuB_Ad7g1SjDXCipaDU27-BrzYWf67muw5jeY_C0_0uz8AhQYYXdiNRQhvqX/exec';
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const script = async (action, body) => {
  const r = await fetch(process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, secret: process.env.APPS_SCRIPT_SECRET || '', ...body }) });
  return r.json().catch(() => null);
};
const sheet = (body) => script('waChat', body);
const tg = async (chat, text) => {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: String(text).slice(0, 3900), disable_web_page_preview: true }) });
  if (!r.ok) console.error('Telegram send failed', r.status, await r.text());
  return r.ok;
};
const WELCOME = 'Assalaamu alaykum. I am Haaris, the Himaayah Schools assistant (an AI, not a person). Ask me about programmes, fees and enrolment. Students: open your dashboard, tap Connect Telegram, and I can also tell you about your own classes, fees and assignments, and send your reminders here.';

export async function POST(request) {
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || !same(request.headers.get('x-telegram-bot-api-secret-token') || '', process.env.TELEGRAM_WEBHOOK_SECRET)) return new Response('Forbidden', { status: 403 });
  let u; try { u = await request.json(); } catch { return new Response('OK'); }
  const m = u.message;
  if (!m || !m.chat || m.chat.type !== 'private') return new Response('OK');      // private chats only
  const chat = String(m.chat.id), name = [m.from && m.from.first_name, m.from && m.from.last_name].filter(Boolean).join(' ');
  const text = typeof m.text === 'string' ? m.text.trim() : '';
  try {
    if (!text) { await tg(chat, 'I can only read text messages. Please type your question.'); return new Response('OK'); }
    const cmd = text.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/);
    if (cmd && cmd[1] === 'start') {
      if (cmd[2]) {                                                                // a student tapped Connect Telegram
        const r = await script('ha_tgbind', { chatId: chat, token: cmd[2].trim() });
        await tg(chat, r && r.ok ? `Assalaamu alaykum ${String(r.name || '').split(' ')[0]}. Your Telegram is now connected. Ask me about your classes, fees or assignments, and I will send your reminders here. Send /unlink any time to disconnect.` : (r && r.error) || 'Sorry, I could not connect your account. Please try again from your dashboard.');
      } else await tg(chat, WELCOME);
      return new Response('OK');
    }
    if (cmd && cmd[1] === 'unlink') { await script('ha_tgunlink', { chatId: chat }); await tg(chat, 'Done. This Telegram is no longer connected to a student account.'); return new Response('OK'); }
    if (cmd && cmd[1] === 'help') { await tg(chat, WELCOME); return new Response('OK'); }
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

    const phone = 'tg' + chat;
    const st = await sheet({ op: 'start', phone, name, msgId: 'tg' + u.update_id, text: text.slice(0, 2000) });
    if (st && st.dup) return new Response('OK');                                   // Telegram resent an update we already handled
    const me = await script('ha_tgme', { chatId: chat });
    const reply = await converse({ channel: 'telegram', history: (st && st.history) || [], text: text.slice(0, 2000), account: me && me.linked ? me.summary : null, onTool: async (tool, input) => {
      if (tool === 'save_enquiry') {
        const r = await sheet({ op: 'weblead', name: input.name || name, programme: input.programme || '', contact: input.contact || 'Telegram (chat ' + chat + ')', detail: (input.detail || '') + ' (Telegram)' });
        return r && r.ok ? 'Saved. Staff will follow up.' : 'Could not save; tell the person to use himaayahschools.com/enroll.html or message the General line.';
      }
      if (tool === 'handover') {
        const line = LINES[input.line] || LINES.general;
        await sheet({ op: 'webhandover', line: line.name, reason: (input.reason || '') + ' (from Telegram, ' + (name || 'chat ' + chat) + ')' });
        return `Staff alerted. Tell the person to message the ${line.name} on WhatsApp: https://wa.me/${line.phone} . Give the link as plain text.`;
      }
      return 'Done.';
    } });
    const out = reply || 'Sorry, I could not answer that. Please message the team: https://wa.me/' + LINES.general.phone;
    await tg(chat, out);
    await sheet({ op: 'reply', phone, text: out });
  } catch (e) {
    console.error('Telegram handler error', e);
    try { await tg(chat, 'Sorry, something went wrong on our side. Please message the team: https://wa.me/' + LINES.general.phone); } catch {}
  }
  return new Response('OK');
}

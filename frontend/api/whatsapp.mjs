// Himaayah Schools WhatsApp assistant (WhatsApp Cloud API webhook → Claude → reply).
//
// Vercel → Settings → Environment Variables:
//   WHATSAPP_VERIFY_TOKEN    any text you choose; the same text goes in Meta's webhook setup
//   WHATSAPP_APP_SECRET      Meta app → Settings → Basic → App secret (checks that calls really come from Meta)
//   WHATSAPP_TOKEN           permanent access token of the system user (WhatsApp Business Management + Messaging)
//   WHATSAPP_PHONE_ID        the Phone number ID shown in WhatsApp → API setup
//   ANTHROPIC_API_KEY        from console.anthropic.com
//   APPS_SCRIPT_SECRET       the same long text already used for card payments (CARD_SECRET in Apps Script)
//   APPS_SCRIPT_URL          optional; defaults to the web app URL the portals already use
//   WHATSAPP_MODEL           optional; defaults to claude-sonnet-5-5
import crypto from 'node:crypto';
import { LINES, converse } from './_wa/core.mjs';

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby0AsifBuB_Ad7g1SjDXCipaDU27-BrzYWf67muw5jeY_C0_0uz8AhQYYXdiNRQhvqX/exec';
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sheet = async (body) => {
  const r = await fetch(process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'waChat', secret: process.env.APPS_SCRIPT_SECRET || '', ...body }) });
  return r.json().catch(() => null);
};
const sendWa = async (to, text) => {
  const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 3800), preview_url: false } }),
  });
  if (!r.ok) console.error('WhatsApp send failed', r.status, await r.text());
  return r.ok;
};

async function answer(from, name, history, text) {
  return converse({ channel: 'whatsapp', history, text, onTool: async (tool, input) => {
    if (tool === 'save_enquiry') {
      const r = await sheet({ op: 'lead', phone: from, name: input.name || name, programme: input.programme || '', detail: input.detail || '' });
      return r && r.ok ? 'Saved. Staff will follow up.' : 'Could not save; tell the person to use himaayahschools.com/enroll.html or message the General line.';
    }
    if (tool === 'handover') {
      const line = LINES[input.line] || LINES.general;
      await sheet({ op: 'handover', phone: from, name, line: line.name, reason: input.reason || '' });
      return `Staff alerted. Tell the person to message the ${line.name} on WhatsApp: https://wa.me/${line.phone} . Give the link as plain text.`;
    }
    return 'Done.';
  } });
}

export async function GET(request) {                      // Meta checks the webhook once with this
  const q = new URL(request.url).searchParams;
  if (q.get('hub.mode') === 'subscribe' && process.env.WHATSAPP_VERIFY_TOKEN && q.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN)
    return new Response(q.get('hub.challenge') || '', { status: 200 });
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return new Response('App secret not set', { status: 500 });
  const raw = await request.text();
  const sig = (request.headers.get('x-hub-signature-256') || '').replace(/^sha256=/, '');
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (!sig || !same(sig, expected)) return new Response('Bad signature', { status: 401 });

  let evt; try { evt = JSON.parse(raw); } catch { return new Response('Bad body', { status: 400 }); }
  const jobs = [];
  for (const entry of evt.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {};
    const names = {}; for (const c of v.contacts || []) names[c.wa_id] = (c.profile && c.profile.name) || '';
    for (const m of v.messages || []) jobs.push({ m, name: names[m.from] || '' });
  }
  for (const { m, name } of jobs) {
    const from = m.from;
    try {
      const text = m.type === 'text' ? (m.text && m.text.body) || '' : m.type === 'button' ? (m.button && m.button.text) || '' : m.type === 'interactive' ? ((m.interactive && ((m.interactive.button_reply || {}).title || (m.interactive.list_reply || {}).title)) || '') : '';
      const st = await sheet({ op: 'start', phone: from, name, msgId: m.id, text: text || '[' + m.type + ']' });
      if (st && st.dup) continue;                                         // Meta resent a message we already handled
      if (!text.trim()) { await sendWa(from, 'Assalaamu alaykum. I can only read text messages. Please type your question, or message us directly: https://wa.me/' + LINES.general.phone); continue; }
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
      const reply = await answer(from, name, (st && st.history) || [], text.slice(0, 2000));
      const out = reply || 'Sorry, I could not answer that. Please message the team: https://wa.me/' + LINES.general.phone;
      await sendWa(from, out);
      await sheet({ op: 'reply', phone: from, text: out });
    } catch (e) {
      console.error('WhatsApp handler error', e);
      try { await sendWa(from, 'Sorry, something went wrong on our side. Please message the team directly: https://wa.me/' + LINES.general.phone); } catch {}
    }
  }
  return new Response('OK', { status: 200 });
}

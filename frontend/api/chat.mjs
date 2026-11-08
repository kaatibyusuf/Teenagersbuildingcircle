// Website chat assistant ("Ask our assistant" in the green Chat with us menu).
// Same brain as the WhatsApp bot (api/_wa/core.mjs). Needs ANTHROPIC_API_KEY and APPS_SCRIPT_SECRET in Vercel.
import { LINES, converse } from './_wa/core.mjs';

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby0AsifBuB_Ad7g1SjDXCipaDU27-BrzYWf67muw5jeY_C0_0uz8AhQYYXdiNRQhvqX/exec';
const hits = new Map();                                  // very small per-instance rate limit: 20 messages per 10 minutes per visitor
const limited = (ip) => {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 600000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 20;
};
const sheet = async (body) => {
  const r = await fetch(process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'waChat', secret: process.env.APPS_SCRIPT_SECRET || '', ...body }) });
  return r.json().catch(() => null);
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const origin = request.headers.get('origin') || '';
  if (origin && !/^https:\/\/(www\.)?himaayahschools\.com$|^http:\/\/localhost(:\d+)?$/.test(origin)) return json({ error: 'Not allowed' }, 403);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'The assistant is not switched on yet.' }, 503);
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon';
  if (limited(ip)) return json({ error: 'You have sent a lot of messages. Please wait a few minutes, or message us on WhatsApp.' }, 429);

  let b; try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const all = (Array.isArray(b.messages) ? b.messages : []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .map((m) => ({ role: m.role, text: m.text.slice(0, 1200) })).slice(-10);
  const last = all.pop();
  if (!last || last.role !== 'user' || !last.text.trim()) return json({ error: 'Type a question first.' }, 400);

  let handover = null;
  try {
    const reply = await converse({ channel: 'web', history: all, text: last.text, onTool: async (tool, input) => {
      if (tool === 'save_enquiry') {
        const r = await sheet({ op: 'weblead', name: input.name || '', programme: input.programme || '', contact: input.contact || '', detail: input.detail || '' });
        return r && r.ok ? 'Saved. Staff will follow up.' : 'Could not save; tell the person to use himaayahschools.com/enroll.html or message the General line.';
      }
      if (tool === 'handover') {
        const line = LINES[input.line] || LINES.general;
        handover = { name: line.name, url: 'https://wa.me/' + line.phone };
        await sheet({ op: 'webhandover', line: line.name, reason: input.reason || '' });
        return `Staff alerted. Tell the person a button to message the ${line.name} on WhatsApp is shown under your reply. Do not write the link yourself.`;
      }
      return 'Done.';
    } });
    return json({ reply: reply || 'Sorry, I could not answer that. Please message the General line on WhatsApp.', handover });
  } catch (e) {
    console.error('chat error', e);
    return json({ error: 'Sorry, something went wrong. Please message us on WhatsApp.' }, 500);
  }
}

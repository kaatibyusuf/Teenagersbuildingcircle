// Shared brain of the Himaayah assistant (used by api/whatsapp.mjs and api/chat.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LINES = {
  madrasah: { name: 'Madrasah line', phone: '2347025842849' },
  academy: { name: 'Academy line', phone: '2348066043320' },
  general: { name: 'General line', phone: '2347047226487' },
};
const here = path.dirname(fileURLToPath(import.meta.url));
let KB = '';
try { KB = fs.readFileSync(path.join(here, 'knowledge.md'), 'utf8'); } catch (e) { console.error('knowledge.md missing', e.message); }

const SYSTEM_TEXT = (who) => `You are the ${who} of Himaayah Schools (Ado-Ekiti, Nigeria; all classes online). You talk to parents, students and people thinking of enrolling.

How to answer
- Use ONLY the school information below. If it does not contain the answer, say you are not sure and offer to pass them to the team. Never guess fees, dates, names, results or availability.
- Reply in the language the person writes in (English, Arabic, Yoruba or Pidgin are all fine). Keep replies short, warm and clear: usually 2 to 5 short lines. Plain text only: no tables, no headings, no markdown links, no asterisks. Start a first reply with "Assalaamu alaykum" and answer salaam if greeted.
- Plans marked Waitlist cannot be joined yet; say so and point to the waitlist on himaayahschools.com. Mention the one-time ₦3,000 registration fee when someone asks what it costs to start.
- Enrolment, fee payment and placement tests are done on the website: himaayahschools.com/enroll.html, himaayahschools.com/pay.html and himaayahschools.com/placement.html. Say the plain address; do not use markdown.
- You cannot see any student's account, payments or results. If someone asks about their own account, payment status, login or code, do not guess: use the handover tool and point them to the right line.
- Refunds, complaints, plan changes, scholarship or sponsorship decisions, anything about a specific child's progress, and any religious ruling (fatwa) are for staff or teachers. Use the handover tool. You may explain the published policy.
- Never promise results, discounts or exceptions. Never ask for card numbers or passwords.
- When someone wants to enrol or join, ask for what is missing (their name, which programme, and the child's age or level if relevant), then use save_enquiry once you have at least a name and programme${who.startsWith('website') ? ' and a WhatsApp number or email so staff can reach them' : ''}. Then tell them the next step (the enrolment page, or a placement test for Madrasah).

Which line to hand over to
- Madrasah (Qur'an, hifdh, tajweed, Islamic studies, Student Affairs): Madrasah line.
- Academy (UTME, Post-UTME, WAEC, NECO, A-Levels): Academy line.
- Skills School, Teenagers Building Circle, fees, payments and anything else: General line.

School information
${KB}`;




const TOOLS = [
  { name: 'save_enquiry', description: 'Save an enrolment enquiry for staff to follow up. Use once you know at least the name and programme.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Full name of the student (or parent)' }, programme: { type: 'string', description: 'Madrasah, Academy, Skills School or Teenagers Building Circle' }, detail: { type: 'string', description: 'Plan, track, level, age and anything else they said' } }, required: ['name', 'programme'] } },
  { name: 'handover', description: 'Alert staff that a human must take over this chat, and get the right line to send the person to.',
    input_schema: { type: 'object', properties: { line: { type: 'string', enum: ['madrasah', 'academy', 'general'] }, reason: { type: 'string', description: 'One sentence: what the person needs' } }, required: ['line', 'reason'] } },
];

export const systemFor = (channel) => SYSTEM_TEXT(channel === 'web' ? 'website chat assistant' : 'WhatsApp assistant');
export const toolsFor = (channel) => TOOLS.map((t) => t.name === 'save_enquiry' && channel === 'web'
  ? { ...t, input_schema: { ...t.input_schema, properties: { ...t.input_schema.properties, contact: { type: 'string', description: 'WhatsApp number or email of the person' } }, required: ['name', 'programme', 'contact'] } } : t);

/** One conversation turn. history = [{role,text}], onTool(name,input) -> string. */
export async function converse({ channel, history, text, onTool }) {
  const system = [{ type: 'text', text: systemFor(channel), cache_control: { type: 'ephemeral' } }];
  const msgs = [...history.map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: text }];
  const clean = [];                                                  // Anthropic needs alternating roles starting with "user"
  for (const m of msgs) { const last = clean[clean.length - 1]; if (last && last.role === m.role) last.content += '\n' + m.content; else clean.push({ ...m }); }
  while (clean.length && clean[0].role !== 'user') clean.shift();
  const call = async () => {
    const j = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.WHATSAPP_MODEL || 'claude-sonnet-5-5', max_tokens: 600, system, tools: toolsFor(channel), messages: clean }),
    }).then((r) => r.json());
    if (j.error) throw new Error('Claude: ' + (j.error.message || JSON.stringify(j.error)));
    return j;
  };
  let j = await call();
  for (let round = 0; round < 3 && j.stop_reason === 'tool_use'; round++) {
    const results = [];
    for (const b of j.content.filter((c) => c.type === 'tool_use')) {
      let out = 'Done.';
      try { out = await onTool(b.name, b.input || {}); } catch (e) { console.error('tool failed', b.name, e); out = 'Failed.'; }
      results.push({ type: 'tool_result', tool_use_id: b.id, content: out });
    }
    clean.push({ role: 'assistant', content: j.content }, { role: 'user', content: results });
    j = await call();
  }
  return (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
}

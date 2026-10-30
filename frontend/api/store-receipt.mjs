// Checks a signed receipt link from the purchase email and returns the receipt for receipt.html to show.
// Link: /receipt?d=<payload>&t=<signature>. Apps Script (Guides.gs) makes both with the shared secret.
import crypto from 'node:crypto';
import { GUIDES, sign } from './_guides.mjs';

const same = (a, b) => {
  const x = Buffer.from(a, 'utf8'), y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });

export async function GET(request) {
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!secret) return json({ ok: false, error: 'Receipts are not set up yet.' }, 503);
  const q = new URL(request.url).searchParams;
  const d = String(q.get('d') || ''), t = String(q.get('t') || '');
  if (!d || d.length > 4000 || !same(sign(secret, d), t)) return json({ ok: false, error: 'This receipt link is not valid.' }, 403);
  let p;
  try { p = JSON.parse(Buffer.from(d, 'base64url').toString('utf8')); } catch { return json({ ok: false, error: 'This receipt link is not valid.' }, 400); }
  const items = (Array.isArray(p.i) ? p.i : []).filter((s) => Object.prototype.hasOwnProperty.call(GUIDES, s)).map((s) => ({ title: GUIDES[s].title, price: GUIDES[s].price }));
  return json({ ok: true, receipt: { no: String(p.r || ''), date: Number(p.t) || 0, name: String(p.n || ''), email: String(p.e || ''), items, total: Number(p.a) || items.reduce((n, x) => n + x.price, 0), method: 'Online payment through Bachs (card or bank transfer)' } });
}

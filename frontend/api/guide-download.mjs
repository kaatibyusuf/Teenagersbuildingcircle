// Sends a paid book's PDF, but only to a link signed by Apps Script after a confirmed payment.
// Link: /api/guide-download?g=<slug>&r=<payment reference>&t=<token>
// Uses APPS_SCRIPT_SECRET (the same text as CARD_SECRET in Apps Script).
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GUIDES, token } from './_guides.mjs';

const same = (a, b) => {
  const x = Buffer.from(a, 'utf8'), y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const page = (msg, status) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Download</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#0b2a3f"><h1 style="font-size:1.4rem">${msg}</h1><p>Please use the link in your email. If it does not work, message the school on WhatsApp: <a href="https://wa.me/2347047226487">+234 704 722 6487</a>.</p>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!secret) return page('Downloads are not set up yet.', 503);
  const q = new URL(request.url).searchParams;
  const slug = String(q.get('g') || ''), ref = String(q.get('r') || ''), t = String(q.get('t') || '');
  const g = Object.prototype.hasOwnProperty.call(GUIDES, slug) ? GUIDES[slug] : null;
  if (!g || !ref || ref.length > 60 || !same(token(secret, slug, ref), t)) return page('This download link is not valid.', 403);
  let buf;
  try { buf = await readFile(path.join(process.cwd(), 'api', '_paid', g.file)); }
  catch (e) { console.error('Paid PDF missing', slug, e); return page('The file could not be found.', 500); }
  const name = g.title.replace(/[^A-Za-z0-9 ]+/g, '').trim().replace(/ +/g, '-') + '-Himaayah-Schools.pdf';
  return new Response(buf, { status: 200, headers: {
    'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"`,
    'Content-Length': String(buf.length), 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex',
  } });
}

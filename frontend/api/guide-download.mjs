// Sends a paid book's PDF, but only to a link signed by Apps Script after a confirmed payment.
// Link: /api/guide-download?g=<slug>&r=<payment reference>&t=<token>
// Uses APPS_SCRIPT_SECRET (the same text as CARD_SECRET in Apps Script).
import crypto from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GUIDES, token } from './_guides.mjs';
import { PAID } from './_paidfiles.mjs';

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
  // Where the private PDFs may be on the server. Vercel normally runs from /var/task with api/_paid inside it;
  // the other places are fallbacks in case the project root differs.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dirs = [path.join(process.cwd(), 'api', '_paid'), path.join(here, '_paid'), path.join(process.cwd(), 'frontend', 'api', '_paid'), '/var/task/api/_paid', '/var/task/frontend/api/_paid'];
  let buf = null; const tried = [];
  try { if (PAID[slug]) buf = await PAID[slug](); } catch (e) { tried.push({ dir: 'bundle', error: e && e.code }); }
  for (const d of buf ? [] : [...new Set(dirs)]) {
    try { buf = await readFile(path.join(d, g.file)); break; }
    catch (e) { tried.push({ dir: d, error: e && e.code }); }
  }
  if (q.get('debug') === '1') {   // only reachable with a valid signed link; shows paths and counts, never file names
    const seen = [];
    for (const d of [...new Set(dirs)]) { try { seen.push({ dir: d, pdfs: (await readdir(d)).filter((n) => n.endsWith('.pdf')).length }); } catch (e) { seen.push({ dir: d, error: e && e.code }); } }
    return new Response(JSON.stringify({ found: !!buf, cwd: process.cwd(), here, tried, seen }, null, 1), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  if (!buf) { console.error('Paid PDF missing', slug, JSON.stringify(tried)); return page('The file could not be found.', 500); }
  const name = g.title.replace(/[^A-Za-z0-9 ]+/g, '').trim().replace(/ +/g, '-') + '-Himaayah-Schools.pdf';
  return new Response(buf, { status: 200, headers: {
    'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"`,
    'Content-Length': String(buf.length), 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex',
  } });
}

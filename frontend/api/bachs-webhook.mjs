// Receives Bachs payment events, checks they really came from Bachs, and records
// successful card payments in the Google Sheet through the Apps Script web app.
//
// Vercel → Settings → Environment Variables:
//   BACHS_WEBHOOK_SECRET   the signing secret from Bachs → Developers → Webhooks → your endpoint
//   APPS_SCRIPT_SECRET     any long random text; the same text goes in the Apps Script (CARD_SECRET)
//   APPS_SCRIPT_URL        optional; defaults to the web app URL the portals already use
import crypto from 'node:crypto';

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby0AsifBuB_Ad7g1SjDXCipaDU27-BrzYWf67muw5jeY_C0_0uz8AhQYYXdiNRQhvqX/exec';
const TOLERANCE = 300; // seconds

const same = (a, b) => {
  const x = Buffer.from(a, 'utf8'), y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Accepts the V2 header (t=…,v1=…[,v1=…]) or the older timestamp + signature pair
function verified(headers, raw, secret) {
  let t, sigs = [];
  const v2 = headers.get('x-bachs-signature-v2');
  if (v2) {
    for (const part of v2.split(',')) {
      const i = part.indexOf('='); if (i < 0) continue;
      const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
      if (k === 't') t = v; else if (k === 'v1') sigs.push(v);
    }
  } else {
    t = headers.get('x-bachs-timestamp');
    const s = headers.get('x-bachs-signature'); if (s) sigs.push(s);
  }
  if (!t || !sigs.length || !/^\d+$/.test(t)) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE) return false;
  const expected = crypto.createHmac('sha256', secret).update(t + '.' + raw).digest('hex');
  return sigs.some((s) => same(expected, s));
}

export async function POST(request) {
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret) return new Response('Webhook secret not set', { status: 500 });

  const raw = await request.text();            // raw body: the signature is over these exact bytes
  if (!verified(request.headers, raw, secret)) return new Response('Bad signature', { status: 400 });

  let evt;
  try { evt = JSON.parse(raw); } catch { return new Response('Bad body', { status: 400 }); }
  if (evt.type !== 'collection.succeeded') return new Response('Ignored', { status: 200 });

  const d = evt.data || {};
  const meta = d.metadata || {};
  const ref = meta.ref || String(d.reference || '').replace(/-[a-z0-9]+$/, '');
  const record = {
    action: 'cardPayment',
    secret: process.env.APPS_SCRIPT_SECRET || '',
    eventId: evt.id || '',
    ref,
    plan: meta.plan || '',
    student: meta.student || '',
    kind: meta.kind || '',            // 'fee' for the Pay fees page (api/fees-checkout)
    studentId: meta.studentId || '',
    periods: meta.periods || '',
    type: meta.type || '',            // sponsorships (api/sponsor-checkout): 'fund' or 'student'
    requestId: meta.requestId || '',
    free: meta.free || '',           // free store items that were in the cart (listed on the receipt)
    guide: meta.guide || '',          // paid children's books (api/guide-checkout): comma-separated slugs
    months: meta.months || '',
    donorName: meta.donorName || '',
    donorEmail: meta.donorEmail || '',
    donorPhone: meta.donorPhone || '',
    showName: meta.showName || '',
    message: meta.message || '',
    status: d.status || '',
    amount: d.amount || '',
    currency: d.currency || '',
    checkoutId: d.checkout_id || '',
    chargeId: d.charge_id || '',
    email: (d.customer && d.customer.email) || '',
    paidAt: evt.created_at || new Date().toISOString(),
  };
  console.log('Bachs payment', record.ref, record.amount, record.currency, record.status, record.eventId);

  if (!process.env.APPS_SCRIPT_SECRET) return new Response('OK (not recorded: APPS_SCRIPT_SECRET not set)', { status: 200 });

  try {
    const r = await fetch(process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(record),
    });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) {
      console.error('Apps Script did not record the payment', r.status, j && j.error);
      return new Response('Could not record payment', { status: 500 }); // Bachs retries
    }
  } catch (e) {
    console.error('Apps Script unreachable', e);
    return new Response('Could not record payment', { status: 500 });
  }
  return new Response('OK', { status: 200 });
}

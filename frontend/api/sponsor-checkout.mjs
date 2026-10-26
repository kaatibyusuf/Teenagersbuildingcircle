// Starts a Bachs card payment for a sponsorship (the Sponsor a student page, sponsor.html).
//   type "fund"     a gift of any amount to the Sponsorship Fund
//   type "student"  N months of fees for a student listed on the page
// The amount is checked by Apps Script (action "sp_quote", protected by APPS_SCRIPT_SECRET),
// so it can't be changed in the browser. When Bachs confirms the payment, api/bachs-webhook
// passes it to Apps Script (Sponsors.gs), which records the gift and thanks the donor.
//
// Uses the same Vercel environment variables as the other card payments:
//   BACHS_SECRET_KEY, APPS_SCRIPT_SECRET, and optionally APPS_SCRIPT_URL and SITE_URL

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby0AsifBuB_Ad7g1SjDXCipaDU27-BrzYWf67muw5jeY_C0_0uz8AhQYYXdiNRQhvqX/exec';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

function phone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (/^0\d{10}$/.test(d)) return '+234' + d.slice(1);
  if (/^234\d{10}$/.test(d)) return '+' + d;
  return undefined;
}

export async function POST(request) {
  const key = process.env.BACHS_SECRET_KEY, secret = process.env.APPS_SCRIPT_SECRET;
  if (!key || !secret) return json({ ok: false, error: 'Card payments are not set up yet.' }, 503);

  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  const type = b.type === 'student' ? 'student' : 'fund';
  const email = clean(b.email, 120);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ ok: false, error: 'Enter your email for the receipt.' }, 400);
  const name = clean(b.name, 100);

  // 1. the trusted amount
  let q;
  try {
    const r = await fetch(process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'sp_quote', secret, type, requestId: clean(b.requestId, 20), months: Number(b.months) || 1, amount: Number(b.amount) || 0 }),
    });
    q = await r.json().catch(() => null);
  } catch (e) {
    console.error('Apps Script unreachable', e);
  }
  if (!q) return json({ ok: false, error: 'The school records could not be reached. Please try again.' }, 502);
  if (!q.ok) return json({ ok: false, error: q.error || 'This gift cannot be made online right now.' }, 400);
  const amount = Number(q.amount);
  if (!(amount > 0)) return json({ ok: false, error: 'Enter an amount.' }, 400);

  // 2. the Bachs payment page
  const live = key.startsWith('sk_live_');
  const api = live ? 'https://api.bachs.io' : 'https://sandbox-api.bachs.io';
  const site = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const ref = 'SPN-' + Date.now().toString(36).toUpperCase();
  const customer = { email };
  if (name) customer.name = name;
  const ph = phone(b.phone);
  if (ph) customer.phone_number = ph;

  const session = {
    pricing: { currency: 'NGN', amount: amount.toFixed(2) },
    customer,
    success_url: site + '/sponsor?thanks=' + type,
    cancel_url: site + '/sponsor?cancelled=1',
    reference: ref + '-' + Math.random().toString(36).slice(2, 7),
    metadata: {
      kind: 'sponsor', ref, type, requestId: String(q.requestId || ''), months: String(q.months || ''),
      donorName: name, donorEmail: email, donorPhone: clean(b.phone, 30), showName: b.showName ? 'Yes' : 'No', message: clean(b.message, 200),
      student: clean(q.name || '', 60), plan: clean(q.label || '', 100),
    },
    expires_in_minutes: 60,
  };

  try {
    const r = await fetch(api + '/v1/checkout-sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    const j = await r.json().catch(() => ({}));
    const url = j.checkout_url || (j.checkout && j.checkout.checkout_url) || (j.data && j.data.checkout_url);
    if (!r.ok || !url) {
      console.error('Bachs sponsor checkout failed', r.status, JSON.stringify(j).slice(0, 500));
      return json({ ok: false, error: 'The card payment page could not be opened.' }, 502);
    }
    console.log('Sponsor checkout', type, amount, ref);
    return json({ ok: true, url });
  } catch (e) {
    console.error('Bachs sponsor checkout error', e);
    return json({ ok: false, error: 'The card payment page could not be opened.' }, 502);
  }
}

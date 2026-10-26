// Starts a Bachs payment for the Ḥadīth Bootcamp (the hadith-bootcamp page).
// The price comes from Apps Script (action "bc_quote", protected by APPS_SCRIPT_SECRET), so it can't be
// changed in the browser. When Bachs confirms the payment, api/bachs-webhook passes it to Apps Script
// (CardPayments.gs → Bootcamp.gs), which creates the student's Bootcamp ID and access code and emails them.
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
  if (!key || !secret) return json({ ok: false, error: 'Online payment is not set up yet.' }, 503);

  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  const email = clean(b.email, 120);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ ok: false, error: 'Enter a valid email address. Your login is sent there.' }, 400);
  const name = clean(b.name, 100);
  if (name.length < 3) return json({ ok: false, error: 'Enter your full name for the certificate.' }, 400);

  // 1. the trusted price
  let q;
  try {
    const r = await fetch(process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'bc_quote', secret }),
    });
    q = await r.json().catch(() => null);
  } catch (e) {
    console.error('Apps Script unreachable', e);
  }
  if (!q) return json({ ok: false, error: 'The school records could not be reached. Please try again.' }, 502);
  if (!q.ok) return json({ ok: false, error: q.error || 'The bootcamp cannot be bought online right now.' }, 400);
  const amount = Number(q.amount);
  if (!(amount > 0)) return json({ ok: false, error: 'The bootcamp price is not set.' }, 400);

  // 2. the Bachs payment page
  const live = key.startsWith('sk_live_');
  const api = live ? 'https://api.bachs.io' : 'https://sandbox-api.bachs.io';
  const site = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const ref = 'HBP-' + Date.now().toString(36).toUpperCase();
  const customer = { email, name };
  const ph = phone(b.phone);
  if (ph) customer.phone_number = ph;

  const session = {
    pricing: { currency: 'NGN', amount: amount.toFixed(2) },
    customer,
    success_url: site + '/hadith-bootcamp?paid=1',
    cancel_url: site + '/hadith-bootcamp?cancelled=1#join',
    reference: ref + '-' + Math.random().toString(36).slice(2, 7),
    metadata: {
      kind: 'bootcamp', ref, plan: clean(q.label || 'Hadith Bootcamp', 100),
      donorName: name, donorEmail: email, donorPhone: clean(b.phone, 30), student: name,
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
      console.error('Bachs bootcamp checkout failed', r.status, JSON.stringify(j).slice(0, 500));
      return json({ ok: false, error: 'The payment page could not be opened.' }, 502);
    }
    console.log('Bootcamp checkout', amount, ref);
    return json({ ok: true, url });
  } catch (e) {
    console.error('Bachs bootcamp checkout error', e);
    return json({ ok: false, error: 'The payment page could not be opened.' }, 502);
  }
}

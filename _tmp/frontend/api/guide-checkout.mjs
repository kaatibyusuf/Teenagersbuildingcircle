// Starts a Bachs payment for one or more paid children's books (buy-guide page).
// The price is fixed in api/_guides.mjs. When Bachs confirms the payment, api/bachs-webhook passes it to
// Apps Script (CardPayments.gs → Guides.gs), which emails the buyer a signed download link.
// Uses BACHS_SECRET_KEY and optionally SITE_URL.
import { GUIDES } from './_guides.mjs';

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
  const key = process.env.BACHS_SECRET_KEY;
  if (!key) return json({ ok: false, error: 'Online payment is not set up yet.' }, 503);

  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  const email = clean(b.email, 120);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ ok: false, error: 'Enter a valid email address. The PDF link is sent there.' }, 400);
  const name = clean(b.name, 100);
  if (name.length < 2) return json({ ok: false, error: 'Enter your name.' }, 400);
  const slugs = [...new Set((Array.isArray(b.slugs) ? b.slugs : []).map(String))];
  if (!slugs.length || slugs.length > Object.keys(GUIDES).length || slugs.some((s) => !GUIDES[s])) return json({ ok: false, error: 'Choose at least one book.' }, 400);
  const amount = slugs.reduce((n, s) => n + GUIDES[s].price, 0);
  const store = b.ret === 'store';

  const live = key.startsWith('sk_live_');
  const api = live ? 'https://api.bachs.io' : 'https://sandbox-api.bachs.io';
  const site = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const ref = 'GDE-' + Date.now().toString(36).toUpperCase();
  const customer = { email, name };
  const ph = phone(b.phone);
  if (ph) customer.phone_number = ph;

  const session = {
    pricing: { currency: 'NGN', amount: amount.toFixed(2) },
    customer,
    success_url: site + (store ? '/store?paid=1' : '/guide-success'),
    cancel_url: site + (store ? '/store?cancelled=1' : '/buy-guide?cancelled=1&g=' + encodeURIComponent(slugs.join(','))),
    reference: ref + '-' + Math.random().toString(36).slice(2, 7),
    metadata: {
      kind: 'guide', ref, plan: clean(slugs.map((s) => GUIDES[s].title).join(', '), 100), guide: slugs.join(','),
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
      console.error('Bachs guide checkout failed', r.status, JSON.stringify(j).slice(0, 500));
      return json({ ok: false, error: 'The payment page could not be opened.' }, 502);
    }
    console.log('Guide checkout', amount, ref);
    return json({ ok: true, url });
  } catch (e) {
    console.error('Bachs guide checkout error', e);
    return json({ ok: false, error: 'The payment page could not be opened.' }, 502);
  }
}

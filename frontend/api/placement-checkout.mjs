// Starts a Bachs payment for the registration fee that unlocks the placement tests (placement page).
// The amount is fixed here (and checked again in Apps Script: PT_FEE in PlacementTests.gs). When Bachs confirms the
// payment, api/bachs-webhook passes it to Apps Script (CardPayments.gs → PlacementTests.gs), which creates a test code
// and emails it with the registration form link. The code is tied to the email address the candidate pays with.
// Uses BACHS_SECRET_KEY and optionally SITE_URL.
const FEE = 3000;   // keep in step with PT_FEE (PlacementTests.gs), EN_REG_FEE (Enrol.gs), api/checkout.mjs and enroll.html

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
  const email = clean(b.email, 120).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ ok: false, error: 'Enter a valid email address. Your test code is sent there.' }, 400);
  const name = clean(b.name, 100);
  if (name.length < 3) return json({ ok: false, error: 'Enter the candidate’s full name.' }, 400);
  const ph = phone(b.phone);
  if (!ph) return json({ ok: false, error: 'Enter a Nigerian phone number, for example 08012345678.' }, 400);

  const live = key.startsWith('sk_live_');
  const api = live ? 'https://api.bachs.io' : 'https://sandbox-api.bachs.io';
  const site = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const ref = 'PTF-' + Date.now().toString(36).toUpperCase();

  const session = {
    pricing: { currency: 'NGN', amount: FEE.toFixed(2) },
    customer: { email, name, phone_number: ph },
    success_url: site + '/placement?paid=1',
    cancel_url: site + '/placement?cancelled=1',
    reference: ref + '-' + Math.random().toString(36).slice(2, 7),
    metadata: { kind: 'placement', ref, plan: 'Registration form (placement tests)', donorName: name, donorEmail: email, donorPhone: clean(b.phone, 30), student: name },
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
      console.error('Bachs placement checkout failed', r.status, JSON.stringify(j).slice(0, 500));
      return json({ ok: false, error: 'The payment page could not be opened.' }, 502);
    }
    console.log('Placement checkout', FEE, ref);
    return json({ ok: true, url });
  } catch (e) {
    console.error('Bachs placement checkout error', e);
    return json({ ok: false, error: 'The payment page could not be opened.' }, 502);
  }
}

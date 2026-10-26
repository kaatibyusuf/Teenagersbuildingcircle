// Starts a Bachs card payment for a current student's fee (the Pay fees page, pay.html).
// The page sends only the Student ID and how many periods to pay. The amount comes from
// the Google Sheet through Apps Script (action "feeQuote", protected by APPS_SCRIPT_SECRET),
// so it can't be changed in the browser. When Bachs confirms the payment, api/bachs-webhook
// passes it to Apps Script, which moves the student's next due date forward automatically.
//
// Uses the same Vercel environment variables as enrolment card payments:
//   BACHS_SECRET_KEY, APPS_SCRIPT_SECRET, and optionally APPS_SCRIPT_URL and SITE_URL

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby0AsifBuB_Ad7g1SjDXCipaDU27-BrzYWf67muw5jeY_C0_0uz8AhQYYXdiNRQhvqX/exec';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const key = process.env.BACHS_SECRET_KEY, secret = process.env.APPS_SCRIPT_SECRET;
  if (!key || !secret) return json({ ok: false, error: 'Card payments are not set up yet.' }, 503);

  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  const id = String(b.id || '').trim().toUpperCase();
  if (!/^[A-Z]{1,4}-?\d{1,6}$/.test(id)) return json({ ok: false, error: 'Enter a valid Student ID.' }, 400);
  const periods = Math.max(1, Math.min(3, Math.round(Number(b.periods) || 1)));

  // 1. the trusted amount from the sheet
  let q;
  try {
    const r = await fetch(process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'feeQuote', secret, id, periods }),
    });
    q = await r.json().catch(() => null);
  } catch (e) {
    console.error('Apps Script unreachable', e);
  }
  if (!q) return json({ ok: false, error: 'The school records could not be reached. Please try again.' }, 502);
  if (!q.ok) return json({ ok: false, error: q.error || 'This fee cannot be paid online.' }, 400);
  const amount = Number(q.amount);
  if (!(amount > 0)) return json({ ok: false, error: 'There is no fee to pay.' }, 400);

  // 2. the Bachs payment page
  const live = key.startsWith('sk_live_');
  const api = live ? 'https://api.bachs.io' : 'https://sandbox-api.bachs.io';
  const site = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const back = site + '/pay?id=' + encodeURIComponent(q.studentId || id);
  const customer = {};
  const typed = String(b.email || '').trim().slice(0, 200);
  if (/^\S+@\S+\.\S+$/.test(typed)) customer.email = typed;   // the parent's email, if typed on the page
  else if (/^\S+@\S+\.\S+$/.test(String(q.email || '').trim())) customer.email = String(q.email).trim();
  if (q.name) customer.name = String(q.name).slice(0, 100);

  const session = {
    pricing: { currency: 'NGN', amount: amount.toFixed(2) },
    success_url: back + '&paid=1',
    cancel_url: back + '&cancelled=1',
    reference: 'FEE-' + id + '-' + Date.now().toString(36),
    metadata: { kind: 'fee', ref: 'FEE-' + id, studentId: q.studentId || id, periods: String(q.periods || periods),
                months: String(q.months || ''), plan: String(q.plan || ''), programme: String(q.programme || ''), student: String(q.name || '').slice(0, 100) },
    expires_in_minutes: 60,
  };
  if (customer.email) session.customer = customer;

  try {
    const r = await fetch(api + '/v1/checkout-sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    const j = await r.json().catch(() => ({}));
    const url = j.checkout_url || (j.checkout && j.checkout.checkout_url) || (j.data && j.data.checkout_url);
    if (!r.ok || !url) {
      console.error('Bachs fee checkout failed', r.status, JSON.stringify(j).slice(0, 500));
      return json({ ok: false, error: 'The card payment page could not be opened.' }, 502);
    }
    console.log('Fee checkout', id, amount, 'x' + periods);
    return json({ ok: true, url });
  } catch (e) {
    console.error('Bachs fee checkout error', e);
    return json({ ok: false, error: 'The card payment page could not be opened.' }, 502);
  }
}

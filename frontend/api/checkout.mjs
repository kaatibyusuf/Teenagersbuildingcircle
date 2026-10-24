// Starts a Bachs card payment for one enrolment.
// The enrolment page sends the reference, plan and contact details here; this
// function picks the plan's Bachs product on the server (so the price can't be
// changed in the browser) and returns the Bachs payment page to send the parent to.
//
// Vercel → Settings → Environment Variables:
//   BACHS_SECRET_KEY   sk_sandbox_… while testing, sk_live_… when going live
//   SITE_URL           optional, e.g. https://www.himaayahschools.com

// Plan name (exactly as on the enrolment page) → price in naira and Bachs product IDs.
// Monthly and two-monthly plans are charged as a one-time payment of one period's fee
// (Bachs NGN subscriptions are not enabled, and the school's own reminders handle renewals).
// Keep the amounts in step with enroll.html and Enrol.gs.
const PLANS = {
  'Teenagers Building Circle — Full Programme': { amount: 40000, recurring: true, live: 'prod_cbd46cdefa0e4d75a31c', sandbox: 'prod_4be17e80bcc74b9f8e3a' },
  'Madrasah — Hifdh Only (Group)':              { amount: 12000, recurring: true, live: 'prod_1518dd1ab1ba4cfea0e8', sandbox: 'prod_f6d40928f10a42c8a5fe', closed: true },
  'Madrasah — Full Madrasah (Group)':           { amount: 20000, recurring: true, live: 'prod_88d2bf8aefd145569c32', sandbox: 'prod_2adf6149f52b4e85a427', closed: true },
  'Madrasah — Hifdh Only (Personal)':           { amount: 20000, recurring: true, live: 'prod_1debd07326f34dd2bc53', sandbox: 'prod_d2a0efd2bed64f96aa61' },
  'Madrasah — Full Madrasah (Personal)':        { amount: 35000, recurring: true, live: 'prod_fe2428f2c1f647118abc', sandbox: 'prod_84b3e07142ee45b1801d' },
  'Madrasah — One-Year Hifdh':                  { amount: 19000, recurring: true, live: 'prod_330d0eede3bf4a4bb39a', sandbox: 'prod_f9d8a4e440074dca896b', closed: true },
  'Madrasah — Muraajah (Group)':                { amount: 14000, recurring: true, live: 'prod_1e019c42c4234c56a24e', sandbox: '' },
  'Madrasah — Muraajah (Personal)':             { amount: 20000, recurring: true, live: 'prod_1209bb063bd94741b579', sandbox: '' },
  'Academy — UTME':                             { amount: 10000, recurring: true, live: 'prod_6de197ce78fe4f049970', sandbox: 'prod_9f7f11caa6ae4375a03f' },
  'Academy — Post-UTME':                        { amount: 10000, recurring: true, live: 'prod_5273f7bb1f1249f6b164', sandbox: 'prod_e2a70d3ed18d4b8ba203' },
  'Academy — A-Levels':                         { amount: 10000, recurring: true, live: 'prod_eea22ca104b6496aace8', sandbox: 'prod_b80ca29cd9a741038fbc' },
  'Academy — O-Levels':                         { amount: 10000, recurring: true, live: 'prod_16d184d1f3f64de98c98', sandbox: 'prod_4a954043f4f14a1abb87' },
  'Skills School — Public Speaking':            { amount: 25000, recurring: false, live: 'prod_f6fa17539a43498782c0', sandbox: 'prod_0db88a060ba7464cb18e' },
  'Skills School — Graphic Design':             { amount: 35000, recurring: false, live: 'prod_bad801192e5c47ffae03', sandbox: 'prod_0fcee9e3af2e4d5797f8' },
  'Skills School — Data Analysis':              { amount: 80000, recurring: true, live: 'prod_0a4ba5e2488546b4aa8c', sandbox: 'prod_0161d06903fb4680a671' },
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Nigerian numbers to +234…; anything unclear is left out rather than rejected
function phone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (/^0\d{10}$/.test(d)) return '+234' + d.slice(1);
  if (/^234\d{10}$/.test(d)) return '+' + d;
  return undefined;
}

export async function POST(request) {
  const key = process.env.BACHS_SECRET_KEY;
  if (!key) return json({ ok: false, error: 'Card payments are not set up yet.' }, 503);

  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }

  const plan = PLANS[b.plan];
  if (!plan) return json({ ok: false, error: 'Unknown plan.' }, 400);
  if (plan.closed) return json({ ok: false, error: 'This plan is closed for now.' }, 400);
  const ref = String(b.ref || '');
  if (!/^ENR-[A-Z0-9]{6}$/.test(ref)) return json({ ok: false, error: 'Bad reference.' }, 400);
  const email = String(b.email || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ ok: false, error: 'A valid email is needed for the receipt.' }, 400);
  const name = String(b.name || '').trim().slice(0, 100);
  const student = String(b.studentName || '').trim().slice(0, 100);

  const live = key.startsWith('sk_live_');
  const api = live ? 'https://api.bachs.io' : 'https://sandbox-api.bachs.io';
  const site = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');

  const customer = { email };
  if (name) customer.name = name;
  const ph = phone(b.phone);
  if (ph) customer.phone_number = ph;

  const session = {
    // Every plan is charged as a plain naira amount set here, so it works the same in
    // sandbox and live without matching product IDs (the IDs below are kept for reference).
    pricing: { currency: 'NGN', amount: plan.amount.toFixed(2) },
    customer,
    success_url: site + '/payment-success.html?ref=' + ref,
    cancel_url: site + '/enroll.html?card=cancelled',
    // Bachs needs a new reference per attempt; the enrolment reference stays in metadata
    reference: ref + '-' + Date.now().toString(36),
    metadata: { ref, plan: b.plan, student },
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
      console.error('Bachs checkout failed', r.status, JSON.stringify(j).slice(0, 500));
      return json({ ok: false, error: 'The card payment page could not be opened.' }, 502);
    }
    return json({ ok: true, url });
  } catch (e) {
    console.error('Bachs checkout error', e);
    return json({ ok: false, error: 'The card payment page could not be opened.' }, 502);
  }
}

// api/create-checkout.js
//
// Vercel serverless function. Runs server-side only — this is the one
// place your Bachs secret key is allowed to exist. The enroll.html page
// calls this endpoint with the plan the person picked, and gets back a
// hosted checkout URL to redirect to.
//
// IMPORTANT: this calls Bachs' REST API directly with fetch, not the
// "@bachs/sdk" npm package. That package (as of writing) is an empty
// placeholder that just reserves the name on npm — `module.exports = {}` —
// so `new Bachs(...)` can never work. The code sample on bachs.io's
// homepage is ahead of what's actually published. This version is built
// from Bachs' real, published OpenAPI spec at
// https://docs.bachs.io/api-reference/payments/create-checkout-session
// which I fetched and confirmed directly.
//
// If you've already run `npm install @bachs/sdk`, it's safe to remove:
//   npm uninstall @bachs/sdk
// This file has no dependency on it anymore.
//
// SETUP (one-time):
//   1. In the Vercel project settings, add an environment variable:
//        BACHS_KEY = sk_sandbox_...   (swap for sk_live_... when you go live)
//      The base URL below is picked automatically from the key prefix, so
//      going live really is just swapping this one value.
//   2. All 13 product IDs are already wired into enroll.html's
//      data-product-id attributes.
//   3. Per Bachs' docs, sandbox works fully even while your account is
//      still under verification review — no need to wait for that to test.

const REGISTRATION_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfAeWdbBg1oYPyFIAmxOvJaXQm6Q43lbYUuQFirXBZMaPuCyw/viewform?usp=header';

// Bachs docs: production is api.bachs.io with sk_live_ keys, sandbox is
// sandbox-api.bachs.io with sk_sandbox_ keys. Pick the base URL from
// whichever key you've set as BACHS_KEY, so no separate "mode" toggle to
// remember — one env var controls everything.
function bachsBaseUrl() {
  const key = process.env.BACHS_KEY || '';
  return key.startsWith('sk_live_')
    ? 'https://api.bachs.io'
    : 'https://sandbox-api.bachs.io';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId, planName, amount, currency, email, name } = req.body || {};

  if (!productId || !email) {
    return res.status(400).json({ error: 'Missing productId or email' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (!process.env.BACHS_KEY) {
    console.error('BACHS_KEY is not set');
    return res.status(500).json({ error: 'Payments are not configured yet' });
  }

  try {
    const response = await fetch(`${bachsBaseUrl()}/v1/checkout-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.BACHS_KEY}`,
      },
      body: JSON.stringify({
        // Bachs requires name + email for a new customer (see
        // NewCustomerRequest in their spec). We only collect email on the
        // page today, so name falls back to the email if not supplied.
        customer: { email, name: name || email },
        product_cart: [{ product_id: productId, quantity: 1 }],
        success_url: REGISTRATION_FORM_URL,
        cancel_url: 'https://himaayahschools.com/enroll.html', // TODO: replace with your real domain once it's live
        reference: `himaayah-${productId}-${Date.now()}`,
        metadata: {
          plan_name: planName,
          amount,
          currency,
          source: 'himaayah-schools-enroll-page',
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Bachs checkout error:', data);
      return res.status(502).json({ error: data.detail || 'Could not create checkout session' });
    }

    return res.status(200).json({ url: data.checkout_url });
  } catch (err) {
    console.error('Bachs checkout error:', err);
    return res.status(500).json({ error: 'Could not create checkout session' });
  }
}
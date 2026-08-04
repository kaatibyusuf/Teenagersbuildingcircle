// api/create-checkout.js
//
// Vercel serverless function. Runs server-side only — this is the one
// place your Bachs secret key is allowed to exist. The enroll.html page
// calls this endpoint with the plan the person picked, and gets back a
// hosted checkout URL to redirect to.
//
// SETUP (one-time):
//   1. npm install @bachs/sdk   (run this in the project root, next to /api)
//   2. In the Vercel project settings, add an environment variable:
//        BACHS_KEY = sk_live_...   (or sk_sandbox_... while testing)
//   3. Product IDs for all 13 plans are already wired into enroll.html's
//      data-product-id attributes, and each button's data-billing
//      ("recurring" or "one_time") flows through into the `billing` field
//      below via billingMode.
//   4. Double-check the field names below (`product`, `billing`, `tax`,
//      `settlement`, `customer_email`, `success_url`, `metadata`) against
//      docs.bachs.io/api-reference — I've built this from the checkout
//      example Bachs shows on their homepage plus standard hosted-checkout
//      conventions, but I could not load their full API reference to
//      confirm every field name or the exact enum values 'billing' expects
//      ('subscription' vs 'one_time' is my best guess — verify against
//      the dashboard products you created). Test one real transaction in
//      sandbox mode before going live.
//
// SUCCESS FLOW:
//   After payment, Bachs should redirect the customer to SUCCESS_URL
//   below. Point that at your registration form (or a small "thank you,
//   now register" page) so the two steps stay connected.

import Bachs from '@bachs/sdk';

const bachs = new Bachs({ key: process.env.BACHS_KEY });

const REGISTRATION_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfAeWdbBg1oYPyFIAmxOvJaXQm6Q43lbYUuQFirXBZMaPuCyw/viewform?usp=header';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId, planName, amount, currency, billing, email } = req.body || {};

  if (!productId || !email) {
    return res.status(400).json({ error: 'Missing productId or email' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  // billing comes from the button's data-billing attribute on the page:
  // 'recurring' for the monthly/every-2-month plans, 'one_time' for
  // Public Speaking and Graphic Design. Falls back to 'one_time' only if
  // something upstream forgot to set it.
  const billingMode = billing === 'recurring' ? 'subscription' : 'one_time'; // TODO verify Bachs' actual enum values for this field

  try {
    const session = await bachs.checkout.create({
      product: productId,           // the Bachs product ID for this plan
      billing: billingMode,
      customer_email: email,        // TODO verify field name in Bachs docs
      tax: 'auto',
      settlement: 'NGN',
      success_url: REGISTRATION_FORM_URL,  // TODO verify field name; confirm Bachs supports a redirect on success
      metadata: {
        plan_name: planName,
        amount,
        currency,
        source: 'himaayah-schools-enroll-page',
      },
    });

    return res.status(200).json({ url: session.url || session.checkout_url });
  } catch (err) {
    console.error('Bachs checkout error:', err);
    return res.status(500).json({ error: 'Could not create checkout session' });
  }
}
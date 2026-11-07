# Placement tests: paid access (test code)

Nobody can start a placement test without a **test code**. The code comes from paying the ₦3,000 registration fee.

## How it works
1. On `placement`, the candidate pays ₦3,000 by card (`api/placement-checkout`). The amount is fixed in that file and checked again in Apps Script (`PT_FEE` in `PlacementTests.gs`).
2. When Bachs confirms the payment, `api/bachs-webhook` sends it to Apps Script. A code like `HPT-AB12-CD34` is created in the **Test passes** tab and emailed with the registration form link (`enroll?pass=CODE`).
3. The candidate enters the code, with the **same email address they paid with**, on the placement page. The server checks both before any question is sent. A code can start up to 6 tests (`PT_CODE_MAX_STARTS`), and the usual limits still apply.
4. On the enroll page the code is filled in from the email link, or typed in. A valid, unused code removes the ₦3,000 registration fee from that enrolment (the card total and the Enrolments row both follow). Each code waives the fee once.

No new Vercel environment variables are needed.

## Bank transfer or gifts
Add a row in **Test passes** with Name, Email (and WhatsApp), then run **Himaayah → Send test codes (placement tests)**. It creates the code and emails it.

## To turn someone's code off
Set **Active** to FALSE in the Test passes row.

## Deploy
1. Replace `Code.gs`, `CardPayments.gs`, `Enrol.gs`, `PlacementTests.gs` and (if changed) `Ambassadors.gs` in Apps Script.
2. Run **Himaayah → Set up placement tests** once. It creates the Test passes tab and adds a **Code** column to Placement tests.
3. Deploy → Manage deployments → Edit → New version.
4. Push the frontend. Make a test payment in Bachs sandbox first.

If you ever change the fee, change it in five places: `PT_FEE`, `EN_REG_FEE`, `api/placement-checkout.mjs`, `api/checkout.mjs` and `enroll.html`.

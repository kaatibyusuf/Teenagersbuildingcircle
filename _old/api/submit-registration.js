// api/submit-registration.js
//
// Vercel serverless function. Takes the enrollment wizard's step 1 + 2
// data (student info + chosen plan) and forwards it to a Google Sheet.
//
// HOW THIS WORKS: rather than a Google Cloud service account (heavier
// to set up — IAM, credentials JSON, sharing permissions), this uses a
// Google Apps Script bound to your Sheet, deployed as a Web App. Your
// Sheet gets a plain URL that accepts a POST with JSON and appends a
// row. This function just forwards to that URL.
//
// SETUP (one-time):
//   1. Create a new Google Sheet (or use an existing one). Add this
//      header row as the first row, exactly in this order:
//        Timestamp | Student Name | Date of Birth | Grade Level |
//        Next of Kin Name | Relationship | Phone | Email |
//        Programme | Plan | Amount | Currency | Payment Method | Status
//   2. In the Sheet, go to Extensions → Apps Script.
//   3. Delete any starter code and paste this instead:
//
//        function doPost(e) {
//          const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
//          const data = JSON.parse(e.postData.contents);
//          sheet.appendRow([
//            new Date(),
//            data.studentName, data.dob, data.gradeLevel,
//            data.kinName, data.kinRelationship, data.kinPhone, data.kinEmail,
//            data.programme, data.planName, data.amount, data.currency,
//            data.paymentMethod, data.status,
//          ]);
//          return ContentService.createTextOutput(
//            JSON.stringify({ ok: true })
//          ).setMimeType(ContentService.MimeType.JSON);
//        }
//
//   4. Click Deploy → New deployment → type "Web app".
//        - Execute as: Me
//        - Who has access: Anyone
//      Click Deploy, authorize when prompted, then copy the Web App URL
//      it gives you (ends in /exec).
//   5. In Vercel → your project → Settings → Environment Variables, add:
//        GOOGLE_SHEETS_WEBHOOK_URL = <that /exec URL>
//
// The Web App URL acts like a bearer secret (unguessable, not indexed),
// same trust model as a webhook — don't publish it anywhere public.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('GOOGLE_SHEETS_WEBHOOK_URL is not set');
    return res.status(500).json({ error: 'Registration storage is not configured yet' });
  }

  const {
    studentName, dob, gradeLevel,
    kinName, kinRelationship, kinPhone, kinEmail,
    programme, planName, amount, currency,
    paymentMethod, status,
  } = req.body || {};

  if (!studentName || !kinName || !kinEmail || !planName) {
    return res.status(400).json({ error: 'Missing required registration fields' });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName, dob, gradeLevel,
        kinName, kinRelationship, kinPhone, kinEmail,
        programme, planName, amount, currency,
        paymentMethod, status,
      }),
      redirect: 'follow', // Apps Script Web Apps respond via a redirect
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Google Sheets webhook error:', text);
      return res.status(502).json({ error: 'Could not save registration' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Google Sheets webhook error:', err);
    return res.status(500).json({ error: 'Could not save registration' });
  }
}
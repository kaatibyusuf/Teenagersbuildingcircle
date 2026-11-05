# Resetting a forgotten access code

An admin can now give anyone a new access code from their own admin portal. Open the **Reset code** tab, find the person, press **Reset code**, and send them the new code.

## Who can reset whom

| Signed in as | Can reset |
|---|---|
| Owner (`owner`) | Everyone, including every kind of admin |
| Madrasah admin (`admin`) and TBC admin (`tbc-admin`) | Madrasah/TBC students, teachers and facilitators, librarians, Hadith Bootcamp students, referral partners |
| Academy admin (`academy-admin`) | Academy students and tutors |
| Skills admin (`skills-admin`) | Skills School students and tutors |

Only the owner can reset an admin or another owner. Nobody can reset their own code here; use Account.

## What happens when you press Reset

1. A random code like `k7m2q-xw9pd` is made (small letters and digits, no look-alike characters).
2. It is stored protected, like every other code, and shown to you once on screen.
3. Any "too many attempts" lockout on that account is cleared, so they can sign in straight away.
4. A line goes into the **CodeResets** tab: when, who reset, whom. The code itself is never logged.
5. If you leave "Also email it" ticked and they have a valid email on file, it is emailed too. If there is a phone number, a WhatsApp button is offered.

Each admin can make up to 30 resets an hour.

## Install

1. Add `Resets.gs` as a new file in Apps Script. Replace `Code.gs` (one new line routes `rs_` requests).
2. Deploy a new version of the web app.
3. Upload the frontend folder (new `js/reset-panel.js`, and the five admin pages).

There is nothing to set up in the sheet; **CodeResets** is created the first time someone is reset.

## Good to know

- The person is not forced to change the code on first sign-in. Tell them to change it under Account.
- Share the new code privately (WhatsApp, a call, in person), not in a group.
- A reset cannot be undone, but the person's old code stops working immediately, so check you have the right person (the ID is shown) before confirming.

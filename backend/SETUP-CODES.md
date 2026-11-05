# Protecting access codes

Access codes used to be stored as plain text in the sheet. They are now stored as salted, keyed hashes, so a copy of
the sheet (or anyone with view access) cannot read anyone's login.

## One-time setup (about 3 minutes)
1. In the Apps Script project, add **Codes.gs** and replace **Code.gs, Academy.gs, Admin.gs, Ambassadors.gs, Bootcamp.gs,
   Cards.gs, Credentials.gs, Enrol.gs, Librarian.gs, Referrals.gs, Teacher.gs** with the versions in the zip.
2. Deploy a new version (Deploy, Manage deployments, Edit, New version, Deploy). Everyone can still sign in as before.
3. Open the spreadsheet, reload it, then **Himaayah, Protect access codes (one time)**. It reports how many codes it protected
   in each tab. Running it again is harmless.

## After that
- New and changed codes are protected automatically. The person still receives their code by email or WhatsApp as before.
- A protected code **cannot be read back**, in the sheet or anywhere else. To help someone who forgot their code, use the reset
  feature in the admin portal; it creates a new code and shows it once. Do not type codes into the sheet by hand and expect to
  see them later; a code typed by hand still works, and is protected the next time you run the menu item.
- "Send my details again" for referrers and ambassadors now sends a new code instead of the old one.
- The key that makes the hashes is stored in Script Properties (CODE_PEPPER). Do not delete it, or every code stops working.
  If that ever happens, reset the codes in the admin portal.

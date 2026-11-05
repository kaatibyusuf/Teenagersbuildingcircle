# Himaayah Schools website

The website, the student and staff portals, and the school's backend. The site is plain HTML, CSS and JavaScript (no build
step) hosted on Vercel. The backend is a Google Apps Script web app that uses a Google Sheet as its database.

- **Setup and deployment:** see [SETUP.md](SETUP.md).
- **Backend setup guides:** `backend/SETUP-*.md`, one per feature.

## Repository layout

| Folder | What it is |
| --- | --- |
| `frontend/` | Everything Vercel serves (Vercel Root Directory is `frontend`). Pages, `css/`, `js/`, `api/`, `media/`, `resources/`. |
| `frontend/api/` | Vercel serverless functions: card checkout, the Bachs webhook, guides and sponsorship payments, receipts. |
| `frontend/js/lang/ar/` | Generated Arabic translations (do not edit by hand, see "Arabic" below). |
| `backend/` | The Apps Script files (`.gs`). Copy them into the Apps Script project; Apps Script does not read this folder. |

## The pieces

**Public pages:** home, programmes (Madrasah, Academy, Skills School, Teenagers Building Circle), admissions, about,
administrators, mission, success stories, FAQ, contact, policies, articles, store, placement tests, timetable, waitlist.

**Enrolment and payment:** `enroll` (three steps) saves a row in the Enrolments tab, then the parent pays by card
(`api/checkout.mjs` opens Bachs) or by bank transfer (WhatsApp receipt). A one-time ₦3,000 registration fee is added to the
first payment. `pay` handles later fees. Staff set a row to Confirmed and the student account is created and emailed.

**Portals** (each signs in with an ID and access code):

| Page | For | Backend file |
| --- | --- | --- |
| `dashboard`, `tracker`, `quiz`, `library` | Madrasah students | `Code.gs`, `Tracker.gs`, `Quiz.gs`, `Library.gs` |
| `teacher` | Madrasah teachers | `Teacher.gs` |
| `academy-dashboard`, `academy-tutor`, `academy-admin` | Academy | `Academy.gs` |
| `skills-dashboard`, `skills-tutor`, `skills-admin` | Skills School | `Skills.gs` |
| `tbc-dashboard`, `tbc-facilitator`, `tbc-admin` | Teenagers Building Circle | `TBC.gs` |
| `librarian` | Librarian | `Librarian.gs` |
| `admin`, `owner` | Administrators and owner | `Admin.gs`, `Owner.gs` |
| `my-card`, `verify` | Library and ID cards (everyone) | `Cards.gs` |

**Other backend files:** `Enrol.gs` (enrolments), `CardPayments.gs` (Bachs payments), `Fees.gs` (later fees), `Credentials.gs`
(login emails), `Codes.gs` (access-code protection), `Referrals.gs` and `Ambassadors.gs`, `Sponsors.gs`, `Bootcamp.gs`,
`Trials.gs`, `PlacementTests.gs`, `Timetable.gs`, `Reports.gs`, `Nudges.gs`, `Newsletter.gs`, `Waitlist.gs`, `Comments.gs`,
`Testimonials.gs`, `Recordings.gs`, `Routine.gs`, `Guides.gs`.

## Things to know before changing anything

- **Prices are set in three places and must match:** the plan list in `frontend/enroll.html`, `PLANS` in
  `frontend/api/checkout.mjs`, and `EN_PLANS` in `backend/Enrol.gs`. The registration fee is also in three places
  (`REG_FEE` in `enroll.html` and `checkout.mjs`, `EN_REG_FEE` in `Enrol.gs`). Closed plans are listed in `enroll.html`,
  `checkout.mjs` and `EN_CLOSED_PLANS` in `Enrol.gs`. A programme that has not opened yet gets an opening date in the same three places
  (`opens` in `enroll.html` and `checkout.mjs`, `EN_OPENS` in `Enrol.gs`); it is refused everywhere until that day.
- **Access codes are stored as hashes** and cannot be read back. Reset a code in the admin portal instead (see
  `backend/SETUP-CODES.md`).
- **The Apps Script web app URL is public** (it is in the page code). Every backend action must check the person's access
  code or the shared secret on the server. Never rely on a page being hidden.
- **Arabic:** the site has an Arabic mode. Every visible English text needs an Arabic entry in the translation source, or it
  stays in English. The source is `i18n/ar/*.txt` (English line, then `= Arabic` line) and is built into
  `frontend/js/lang/ar/` by `python3 i18n/build_ar.py`. Keep that `i18n` folder in your repo if you want to add pages in Arabic.
- **Staff portals are not indexed** by search engines and are served uncached (see `frontend/vercel.json`).

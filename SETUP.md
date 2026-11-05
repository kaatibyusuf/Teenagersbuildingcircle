# Setup and deployment

Two things run the school: **Vercel** (the website and payment functions) and **Google Apps Script** (the backend, using a
Google Sheet as the database). You deploy them separately, and a change that touches both must go live in both.

## 1. Website (Vercel)

1. Push the repository to GitHub and import it in Vercel.
2. Set **Root Directory** to `frontend`. There is no build command and no output directory.
3. Add these **Environment Variables** (Settings, Environment Variables):

   | Name | Value |
   | --- | --- |
   | `BACHS_SECRET_KEY` | `sk_sandbox_...` while testing, `sk_live_...` when live |
   | `BACHS_WEBHOOK_SECRET` | the signing secret from the Bachs dashboard webhook |
   | `APPS_SCRIPT_URL` | the Apps Script web app URL (ends in `/exec`) |
   | `APPS_SCRIPT_SECRET` | the same value as the `CARD_SECRET` script property (section 2) |
   | `SITE_URL` | `https://www.himaayahschools.com` (optional) |

4. In Bachs, create a webhook pointing to `https://www.himaayahschools.com/api/bachs-webhook` for payment events.
5. In Vercel, turn on **Analytics** and, under Firewall, **bot protection** and rate limits.
6. Every `git push` to the main branch deploys. Test on localhost first (any static server in `frontend/`, for example
   `npx serve frontend`), then push.

## 2. Backend (Google Apps Script)

1. Create the Google Sheet. Open **Extensions, Apps Script** (or create a standalone project and set `SHEET_ID` at the top of
   `Code.gs`).
2. Add every file from `backend/` as its own script file (the `.gs` files; **not** the `.md` files). When a file changes in
   the repo, paste its new contents over the old.
3. **Deploy, New deployment, Web app.** Execute as **Me**, access **Anyone**. Copy the `/exec` URL. Put it in
   `APPS_SCRIPT_URL` (Vercel) and in the `API_URL` constant near the top of each portal page that has one
   (`dashboard`, `librarian`, `my-card`, `verify`, and the other portal pages). After any backend change, use
   **Deploy, Manage deployments, Edit, New version, Deploy**; the URL stays the same.
4. **Project Settings, Script Properties:** add `CARD_SECRET` (a long random string; use the same value for
   `APPS_SCRIPT_SECRET` in Vercel). The properties `CODE_PEPPER` (access-code protection) and, if you use recordings,
   `REC_FOLDER_ID` are created or set by their own setup steps.
5. Reload the sheet. A **Himaayah** menu appears. Run these once, in order:
   1. **Set up or upgrade tabs**: creates the main tabs.
   2. **Install automatic jobs**: the daily reminder job and the edit trigger.
   3. Then the setup item for each feature you use: Admins tab, Teenagers Circle tabs, Academy tabs, Skills School tabs,
      Library, Tracker and Quiz tabs, Librarians tab, exam portal, owner dashboard, sponsorship tabs, timetable, trial classes,
      placement tests, Hadith Bootcamp, newsletter tabs. Each creates its tabs and tells you what to fill in.
   4. **Protect access codes (one time)**, after everything else is working. See `backend/SETUP-CODES.md`.
6. Add the first admin in the Admins tab (ID, name, a strong access code, `TRUE`), the first librarian in the Librarians tab,
   and so on, then sign in on the matching page and change the code.

Feature guides: `backend/SETUP-STUDENT-TOOLS.md` (library, tracker, quizzes), `backend/SETUP-EXAMS.md` (Madrasah exams), `backend/SETUP-LIBRARIAN.md`,
`backend/SETUP-RECORDINGS.md`, `backend/SETUP-CODES.md`.

## 3. How a new student is created

1. The parent completes `enroll` and pays. The enrolment row appears in the Enrolments tab.
2. Card payments are matched by `CardPayments.gs` (the amount must cover the plan price plus the registration fee).
   Bank transfers wait for staff to check the receipt.
3. Staff set the row's **Status** to **Confirmed**. The account is created in the right tab (Students, AcademyStudents or
   SkillsStudents), a login is emailed, and the student can sign in. Their library number is `LIB-` plus their ID.

## 4. Changing things

- **A price or plan:** change it in all three places listed in `README.md`, then deploy the frontend and the backend.
- **Closing or opening a plan:** the closed-plan lists in `enroll.html`, `api/checkout.mjs` and `EN_CLOSED_PLANS` in `Enrol.gs`.
- **A programme that is not open yet:** add `opens: 'YYYY-MM-DD'` to the plan in `enroll.html` and `api/checkout.mjs`, and `'Plan name': 'YYYY-MM-DD'` to `EN_OPENS` in `Enrol.gs`. Until that day the plan shows "Opens <date>", and the form, card checkout and the sheet all refuse it. It opens by itself on the date; later you can delete the date.
- **Arabic text:** edit `i18n/ar/<page>.txt`, run `python3 i18n/build_ar.py`, then deploy `frontend/js/lang/ar/`.
- **Someone forgot their code:** an admin opens the **Reset code** tab in their portal, finds the person and presses Reset. A new code is shown once (and can be emailed or sent on WhatsApp). The owner can reset anyone; see `backend/SETUP-RESETS.md` for who can reset whom.

## 5. Checklist before going live

- Bachs live key and live webhook secret set in Vercel; one real test payment (card and transfer) completes and the sheet
  row is matched.
- Daily job installed; a test email sends (**Himaayah, Send me a test email**).
- Access codes protected, and every portal tested with a protected code.
- `frontend/vercel.json` headers appear on the live site (browser DevTools, Network).
- Policies and refund wording reviewed by a lawyer.

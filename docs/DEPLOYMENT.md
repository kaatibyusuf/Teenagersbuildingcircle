# Deployment checklist

Tick each line when it is live. Keep this file up to date: add a line whenever a change needs a step by hand.
Last updated: 18 November 2026.

## How a release works

1. **Website and `api/` files:** extract the zip, run any script named below, test on localhost, `git push` (Vercel deploys).
2. **Apps Script files:** paste each new or changed `.gs` file into the Apps Script project (new files with the **+** button), save, then
   **Deploy > Manage deployments > pencil > New version > Deploy**. Pasting alone changes nothing for the live site.
3. **Check it:** use the "Check it" line next to each item.

## Apps Script (backend)

| Done | File | New or changed | Check it |
|---|---|---|---|
| [ ] | `Journal.gs` | changed (Word-only, public form, bio is exactly 200 words) | Send one real .docx on the journal page |
| [ ] | `Code.gs` | changed (journal route, assignment files, student note, error log) | Log in as a student; submit a note |
| [ ] | `AssignmentFiles.gs` | **new** | Student uploads a PDF; teacher opens the link |
| [ ] | `Recordings.gs` | changed (60-minute recordings) | Record and send a 30-minute recitation |
| [ ] | `PlacementTests.gs` | changed (foreign-currency cards, `placementIssueCode`) | See "Payments" below |
| [ ] | `CardPayments.gs`, `Fees.gs`, `Guides.gs`, `Sponsors.gs`, `Bootcamp.gs` | changed (foreign-currency cards, alert email) | See "Payments" below |
| [ ] | `StudentNote.gs` | **new** | A student's portal shows "A note for you" |
| [ ] | `FeeLock.gs` | **new** (also replace `Code.gs`, `Library.gs`, `Exams.gs`, `Quiz.gs`, `Tracker.gs`, `TBC.gs`, `Skills.gs`, `Academy.gs`) | An overdue student signs in and sees "Fee due, Pay now" only |
| [ ] | `ProgrammeNotes.gs` | **new** (also replace `TBC.gs`, `Skills.gs`, `Academy.gs`, `Parents.gs`, `Notices.gs`) | TBC, Skills and Academy portals show "A note for you" |
| [ ] | `ErrorLog.gs` | **new** | Menu **Himaayah > Errors: email me a daily summary**, run it once |
| [ ] | `Scratch.gs` (the one-off Hadiza script) | delete it | It is no longer in the file list |

## Website (frontend, then `git push`)

| Done | What | How | Check it |
|---|---|---|---|
| [ ] | Journal pages | extract the zip over the project | `/journal` and `/journal-submit` load; the template downloads |
| [ ] | Homepage link to the journal form | change `journal#submit` to `journal-submit` in `index.html` | The homepage button opens the submission page |
| [ ] | Assignment uploads | `node scripts/add-assignment-files.js` | Madrasah and TBC portals show the file field |
| [ ] | Recorder pause | `node scripts/add-recorder-pause.js` | Pause and Resume appear while recording |
| [ ] | Exam notices | `node scripts/add-teacher-notices.js`; run `postExamNotice` once | Teachers see a Notices card |
| [ ] | Fee lock screen | copy `js/fee-lock.js`, then `node scripts/add-fee-lock.js` | An overdue test student sees "Fee due" and a Pay now button |
| [ ] | Notes on TBC, Skills, Academy | `node scripts/add-programme-notes.js` | The note card shows at the top of each portal |
| [ ] | Teacher "Needs attention" | `node scripts/add-teacher-attention.js` | Today tab lists students who need a word |
| [ ] | Student note | `node scripts/add-student-note.js` | The note card shows at the top of the Madrasah portal |
| [ ] | Foreign-currency metadata | `node scripts/add-ngn-metadata.js` | Each checkout's metadata carries `ngn` (see below) |
| [ ] | New sign-in design on every portal | copy `css/signin.css` and `images/signin-desk.jpg`, then `node scripts/add-signin-design.js` | Every sign-in page shows the photo card |
| [ ] | Admin and owner dashboard layout | `node scripts/staff-portal-shell.js` (after the teacher script) | Both dashboards show the left menu and summary cards |
| [ ] | Teacher portal layout | `node scripts/teacher-portal-shell.js` (run this first) | The teacher portal shows the left menu and summary cards |
| [ ] | Bootcamp lessons link to Telegram | Group link is already set in `Bootcamp.gs`; redeploy, then `node scripts/bootcamp-telegram.js` | A lesson shows "Open Telegram" |
| [ ] | Bootcamp portal layout | `node scripts/bootcamp-portal-shell.js` | The bootcamp portal shows the left menu and summary cards |
| [ ] | Placement phone numbers | extract `api/placement-checkout.mjs` | A +233 number is accepted |

Each script says "NOT changed" and names the spot if it cannot find what it needs. It never half-edits a page. Send me the file if that happens.

## Payments (foreign cards)

A card from abroad can be billed in its own currency. The system now credits the **naira price** that the checkout recorded, and logs
the real amount ("paid GHS 25, credited as ₦3,000: confirm in Bachs"). Order matters:

1. Deploy the Apps Script files first.
2. Then run `node scripts/add-ngn-metadata.js`, test, and push.
3. Make one small test payment from a foreign card if you can, or ask a friend abroad. Check the **Card payments** tab and the owner email.

Any payment that cannot be matched now sends you an **ATTENTION** email with the buyer's details, so nothing waits silently.

## Himaayah Skills Schools page

`frontend/skills-school.html` is the **Himaayah Skills Schools** page (himaayahschools.com/skills-school). It has a text-only hero with a row of course pictures that runs by itself,
a Featured tracks card grid, a sideways-scrolling phases section, the track matcher, fees, FAQ and the homepage footer. The eight tracks are
Cybersecurity, Web Development, Software Engineering, Product Management, Product Design, Graphic Design, UI/UX and Video Creation. Each is eighteen months and **$400** (US dollars), payable in full, yearly ($267, then $133), quarterly ($67 five times, then $65) or monthly ($23 seventeen times, then $9), plus a one-time **$5 application fee**. The pages no longer mention the ₦3,000 registration fee. A plan picker on the fee section and on every course page switches the amount. The amounts are in the `PLANS` object in each page script.

Each card's **Learn more** opens its own course page: `frontend/skills-school/<track>.html`, shown at `himaayahschools.com/skills-school/<track>`
(for example `/skills-school/cybersecurity`). The course pages share `frontend/css/skills.css` and the pictures in `frontend/images/skills/`.
To change a picture, replace the file with the same name (3:2, under 150 KB). To change a course's text, edit its page.

Drop the files in and push. Then run `node scripts/add-skills-to-sitemap.js` from the project root to list the eight course pages in `frontend/sitemap.xml` (safe to run twice).

**Enrolment is not switched on yet.** We are not taking students, so the payment buttons are locked: a padlock and "Enrolment closed", with a "Join the waitlist" link that opens WhatsApp (+234 704 722 6487) with the track name filled in. The enrolment page, `api/checkout.mjs`
and `Skills.gs` still only know the old Public Speaking, Graphic Design and Data Analysis plans, and card payment needs a Bachs product for each new track, plus the yearly, quarterly and monthly plans for the $400 fee and the $5 application fee, all in US dollars.
When those are set up, change `const ENROL_OPEN = false;` to `true` near the top of the script in `skills-school.html` and in each of the eight course pages. The buttons then unlock, lose the padlock, read "Enrol now", the lock line becomes "Payment is taken on a secure page", and they go to `enroll?programme=skills&plan=<track>`
with the plan slugs `cybersecurity`, `web-development`, `software-engineering`, `product-management`, `product-design`, `graphic-design`, `ui-ux` and `video-creation`.

Review the track outlines (what each track teaches, the tools and the final project) before launch. They are written to be sensible, not taken from a syllabus of yours.

## Projection tab (owner portal)

A new **Projection** tab shows income, costs, profit now, the gap to your profit target, the number of new students needed, a six month forecast,
"if we add students", flat-salary comparisons and a ranked **What to work on** list. It reads the live sheets, so it needs no data entry.
You set the profit target, other monthly costs (for example Vercel Pro), planned new students a month, the payment charge percentage and your plan notes on the page.
They are saved in a **Projection** tab that the script creates on first save.

1. In Apps Script, add `Projection.gs` and replace `Owner.gs` (it now has the `ow_projsave` route and passes the projection to the page). `Salaries.gs` from the minimum-pay update must already be deployed.
2. Deploy → Manage deployments → New version.
3. Run `node scripts/add-projection-tab.js`, open the owner portal on localhost, check the Projection tab, and push.
4. If you have not applied the new portal layout to the owner page yet, run `node scripts/staff-portal-shell.js` (it already includes the Projection menu entry).

Income is the monthly fee on record for each active, non-exempt student. A student with no fee on record is listed in the work list until you set it.

## Minimum teacher pay

Teachers and tutors with at least one student are now paid at least **₦10,000 a month** (`SAL_FLOOR` in `Salaries.gs`), otherwise students times rate
(₦5,000 by default; a person's own **Rate** column still overrides it, for example ₦6,000 for Hifdh teachers). Admins stay on the fixed ₦30,000. A teacher with no
students is not listed for payment. Change the minimum by editing `SAL_FLOOR`, and set it to `0` to switch it off.

1. Replace `Salaries.gs` in Apps Script and deploy a new version.
2. Run `node scripts/add-pay-floor.js`, test the owner portal's **Staff pay** tab on localhost, and push.

## Still pending from earlier work

- [ ] Phone and Enrol Apps Script updates (from earlier sessions)
- [ ] A native Arabic speaker reads the journal, submission, upload and recorder strings
- [ ] A scholar reviews the E-Library vetting
- [ ] Decide whether the journal form is locked to 1 January to 30 March 2027
- [ ] Decide the judging and announcement process, and add a copyright line, to the submission page

## When something fails

- Open the **Errors** tab in the sheet: time, where, what, which action and student. Access codes are never stored there.
- A failed card payment emails you straight away. Bachs retries the notification by itself, so check again in an hour before fixing by hand.
- To issue a placement test code by hand, see the comment above `placementIssueCode` in `PlacementTests.gs`.

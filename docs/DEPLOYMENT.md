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
| [ ] | Student note | `node scripts/add-student-note.js` | The note card shows at the top of the Madrasah portal |
| [ ] | Foreign-currency metadata | `node scripts/add-ngn-metadata.js` | Each checkout's metadata carries `ngn` (see below) |
| [ ] | Teacher portal layout | `node scripts/teacher-portal-shell.js` (run this first) | The teacher portal shows the left menu and summary cards |
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

## Still pending from earlier work

- [ ] Phone and Enrol Apps Script updates (from earlier sessions)
- [ ] A native Arabic speaker reads the journal, submission, upload and recorder strings
- [ ] A scholar reviews the E-Library vetting
- [ ] Decide whether the journal form is locked to 1 January to 30 March 2027
- [ ] Decide the judging and announcement process, and add a copyright line, to the submission page
- [ ] Student note for the TBC, Academy and Skills portals (only the Madrasah portal has it)

## When something fails

- Open the **Errors** tab in the sheet: time, where, what, which action and student. Access codes are never stored there.
- A failed card payment emails you straight away. Bachs retries the notification by itself, so check again in an hour before fixing by hand.
- To issue a placement test code by hand, see the comment above `placementIssueCode` in `PlacementTests.gs`.

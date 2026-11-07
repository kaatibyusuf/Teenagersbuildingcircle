# Term report cards for parents

1. Add `ReportCards.gs` to the Apps Script project (next to `Exams.gs` and `Reports.gs`) and replace `Code.gs` (it now has two menu items and one line in the daily job).
2. Deploy > Manage deployments > New version. Reload the sheet: the **Himaayah** menu now has
   - **Term report cards: send me a sample** (asks for a Student ID and a term; emails you only)
   - **Term report cards: send to parents** (asks for a term, queues one card per student, sends what the email quota allows)
3. Optional: add a tab **Report card notes** with the columns `Term`, `StudentID`, `Comment`, `By` for a short teacher's comment on a student's card. It is created automatically the first time a card is sent.

When to send: after the exams for the term are published and the typed CA scores are in. The card uses the same marks as the student's own report on the exams page (CA 1 /20 + CA 2 /20 + Exam /60 = 100, grade, term average, GPA and CGPA). A student with no scores for the term is skipped, and is picked up on the next run once scores exist.

Each card goes to the next-of-kin email on the enrolment form and the student's own email (up to three addresses). The tab **Term report cards** records every card: Queued, Sent, No email, No scores or Error.

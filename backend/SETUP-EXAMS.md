# Madrasah exam portal

Fixed-time exams for Madrasah students. Teachers set and mark them on **exam-teacher**; students sit them on **exams**.

## One-time setup

1. In the Apps Script project, add `Exams.gs` as a new file. Replace `Code.gs` with the new version (it routes `exams` and `examt`
   requests and adds a menu item). `Teacher.gs` is needed too; it is already in your project.
2. Reload the sheet and run **Himaayah, Set up the exam portal**. It creates four tabs: Exams, ExamQuestions, ExamSittings, ExamOral.
3. **Deploy, Manage deployments, Edit, New version, Deploy.** The web app URL does not change.
4. Teachers sign in on `exam-teacher` with the same Teacher ID and access code they use on the teacher dashboard.
   Students sign in on `exams` (or from the new **Exams** card on their dashboard) with their usual ID and code.

## How a teacher runs an exam

1. **New exam:** title, subject, level (the same names as the Level column in the Students tab; several levels can be separated
   by commas), start date and time, length, pass mark, and oral marks if there is a recitation part.
2. Add questions: multiple choice (pick the correct option) and written answers (add a model answer to help marking).
3. **Save and make live.** Students in that level now see the exam with a countdown.
4. At the start time everyone can begin. A student can still begin for 15 minutes after the start, but the exam always ends at
   start time plus its length. Unfinished exams are submitted automatically at the end.
5. After the end, open the exam: **Mark** each student's written answers, and use **Oral** to record each student's slot, score and
   comment. Multiple choice marks itself.
6. **Publish results.** Only then do students see their marks, grades and answers.

## Rules and grades

- One attempt per student. The server keeps the time, not the student's phone.
- The answer key never reaches a student's browser before results are published.
- Grades use the rounded percentage: **A** 90-100, **B** 79-89, **C** 60-78, **D** 50-59, **E** 49, **F** 0-48.
  They are set in `ex_grade_` in `Exams.gs` if you ever change them.
- A student who does not sit the written paper shows as **Absent** (grade F, 0%). Their oral score can still be entered.
- The teacher who creates an exam can edit it and see the whole level. Other teachers see only the students assigned to them.
  Admins (Role = Admin in the Teachers tab) see everything.
- Once any student has started, the time, length, level, questions and oral marks are locked. Title, subject, instructions and pass mark
  can still be changed.

## Settings at the top of Exams.gs

| Setting | Default | Meaning |
| --- | --- | --- |
| `EX_LATE_MINUTES` | 15 | How long after the start a student may still begin |
| `EX_GRACE_SECONDS` | 45 | Extra seconds for answers to arrive over a slow connection |
| `EX_DEFAULT_PASS` | 50 | Pass mark when an exam has none |
| `EX_BLOCK_OVERDUE` | false | Set to true to stop students with overdue fees from sitting exams |

## Not included yet

- A resit or "reopen" button for a student who had a network problem. For now, enter their oral score and ask a teacher to mark manually, or create a short make-up exam for them.
- Arabic translation of the two new pages.

## Term report: CA 1, CA 2 and Exam (the Gradebook)

Every subject is marked out of 100: **CA 1 out of 20, CA 2 out of 20 (so CA is out of 40) and the Exam out of 60.**

1. When a teacher creates an exam, they choose **Counts as** (CA 1, CA 2 or Exam) and type the **Term** (for example `2026/27 Term 2`). Use exactly the same wording for the whole term. An exam set to "Not in the term report" works as before.
2. On `exam-teacher`, press **Gradebook**, choose the term and the level, and press **Show scores**.
   - Each subject shows CA 1, CA 2, CA /40, Exam /60, Total /100 and the grade (A to F).
   - Scores from portal exams fill in by themselves once the exam has ended and is fully marked. A student who did not sit counts as 0 and is marked "absent".
   - For a test taken on paper, type the score in the box. A typed score replaces the portal score; clear the box to go back to the portal score.
   - A total and grade appear once all three parts are in. "All subjects" shows each student's total per subject, the average and the overall grade.
   - **Download CSV** and **Print** are at the bottom.
3. Teachers see their own students; admins see the whole level. If one subject has two exams of the same kind in a term, their percentages are averaged.
4. The Exams tab gets two new columns (**Kind**, **Term**) and a **Gradebook** tab is created automatically the first time the new script runs. Nothing to do by hand.

## Final exams start on 20 January 2027, fees must be up to date

- `EX_EXAMS_FROM` (top of `Exams.gs`) is `2027-01-20`. An exam whose kind is **Exam** cannot be saved with an earlier start, and a student cannot start one earlier even if the sheet is edited by hand. CA 1 and CA 2 are not affected. Change the date in one place if the plan moves.
- `EX_BLOCK_OVERDUE` is now `true`: a student whose fees are **Overdue** (their NextDue date has passed) cannot start any exam. They still see the exam, with a message to pay first. Once the office confirms a payment and the due date moves forward, they can start straight away. Set it to `false` to switch this off.

## The current term

The term is set once, in `Code.gs` (`SCHOOL_TERM`: `Second Term`, `2026/2027`, `1448/1449 AH`). Exams and the Gradebook use "2026/2027 Second Term" automatically, so teachers no longer type it. When the next term begins, change those three values and redeploy.

## Student term report card

Students press **Term report card** on the exams page. It shows each subject with CA 1 /20, CA 2 /20, CA /40, Exam /60, Total /100 and the grade, then the average and overall grade, with the school name, the student's level and the term. They can print it or save it as a PDF, and switch to an earlier term if they have scores in one.

- A part appears only when it is final: a score a teacher has typed in the Gradebook, or a portal exam whose results have been **published**. Draft and live (unpublished) exams are never counted, so nothing leaks early.
- A subject's total and grade appear only when all three parts are in; the average counts completed subjects; the overall grade appears once every subject is complete.

## GPA and CGPA (out of 5.0)

Each finished subject earns grade points: **A = 5, B = 4, C = 3, D = 2, E = 1, F = 0** (`EX_POINTS` in `Exams.gs`).

- **Term GPA** = the average points of that term's finished subjects.
- **CGPA** = the average points of every finished subject across all the student's terms. Every subject counts equally (there are no credit units).
- Both show on the student's Arabic report card, with each subject's points. The teacher's Gradebook "All subjects" view shows each student's term GPA, and the CSV includes it.
- A subject counts only once CA 1, CA 2 and the Exam are all in. While some subjects are still waiting, the term GPA is marked provisional.

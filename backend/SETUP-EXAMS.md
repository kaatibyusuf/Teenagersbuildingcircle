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

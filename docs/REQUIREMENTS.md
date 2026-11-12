# Requirements: weekly UTME Sunday mock

Each line is something the system must do. The tests in `tests/` check the ones marked **[tested]**.

## Papers
- R1 Four combinations are offered: Sciences and Medicine, Engineering and Technology, Arts/Law/Humanities, Social Sciences and Management. Commercial is not offered. **[tested]**
- R2 Every paper has 180 questions: English 60 and three other subjects of 40. **[tested]**
- R3 Scores are out of 400: each subject is scaled to 100. No negative marking. **[tested]**
- R4 A mock opens Sunday 09:00, the last time to start is 21:00 (school time), and a student has 120 minutes. **[tested]**
- R5 All students get the same paper in a given week, and building the same week twice changes nothing. **[tested]**

## Bank
- R6 Questions come from the bank and the least-used are picked first, so no question repeats within the bank's life. **[tested: 8 weeks, no repeats]**
- R7 Inactive questions are never picked. **[tested]**
- R8 If a subject has too few questions, nothing is built and the failure is reported. **[tested]**
- R9 Seeding a pack twice adds nothing. **[tested]**
- R10 Every question has four distinct options and an explanation (packs 7 onward). **[tested]**
- R11 New questions are reviewed by a teacher before students sit them. *(manual, not testable)*

## Students
- R12 A student sits one combination per week. Sitting one locks the others.
- R13 After the mock closes, students see answers and explanations.
- R14 On Monday 07:00 every UTME student gets an emailed report (total, subjects, rank, change, weakest subject).
- R15 The leaderboard shows one result per student.

## Operations
- R16 If the Thursday job fails, the admin is emailed (`ACM_ADMIN_EMAIL`).

# Scholarship exam: setup

1. In Apps Script add two new files: `ScholarshipExam.gs` and `ScholarshipExamData.gs` (paste each file's full contents). Replace `Code.gs` and `Scholarship.gs` with the new versions.
2. Open `ScholarshipExam.gs` and set the real times at the top:
   - `SCX_OPENS` (when the exam opens) and `SCX_LATEST_START` (nobody can start after this). They are PLACEHOLDERS: 30 Dec 2026, 09:00 and 11:00 West Africa time.
   - `SCX_MINUTES` is 120. Change it if you want a different length.
3. Deploy > Manage deployments > edit > New version > Deploy.
4. Upload `scholarship.html` and `scholarship-exam.html` to the site and push.
5. After you verify an applicant's result, set Status to Verified. Run **Scholarship: email verified applicants the exam date** (it now includes the link and the sign-in steps and sets Status to Invited). Only Verified or Invited applicants can sign in.
6. On exam day applicants sign in with their reference and the email on their application, choose a track, and start. The timer is kept by Apps Script.
7. Scores appear in the ScholarshipExam tab and in the ExamScore column of the Scholarship tab. After the exam run **Scholarship exam: mark unsubmitted attempts**, then **Scholarship: rank the exam (top 20)**.

Before the exam: a subject teacher must check the questions (use the Teacher Copy PDF). Test the whole flow once with a dummy applicant (set Status to Verified, change `SCX_OPENS` to a time in the past, then set it back).

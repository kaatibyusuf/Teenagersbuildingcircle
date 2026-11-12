# Runbook: when something breaks

| Symptom | Likely cause | What to do |
|---|---|---|
| No Sunday mock appears | Thursday trigger did not run, or a subject ran short | Apps Script, Executions: look for `academyMockWeeklyJob`. Menu "Academy mock: question bank status". Add questions or run "build next Sunday's mock now". |
| Alert email: "Could not build the mock" | A subject has fewer questions than a week needs | Seed another pack, or set questions back to Active. |
| Alert email: "so some questions are repeats" | Unused questions are running out | Seed a new pack. |
| Student cannot sign in | Wrong code, or locked out for 15 minutes | Reset the code in the admin portal. |
| Students got no Monday report | Daily email quota used up, or the trigger did not run | Check the Executions log and `MailApp.getRemainingDailyQuota()`. Run `academyMockReportAgain` the next day. |
| A question has a wrong answer key | Content error | Fix the cell in `AcademyMockBank` (or set Active to FALSE). Tests already built keep the old text: fix that row in `AcademyQuestions` too. |
| Site shows old content after a backend change | Forgot to deploy a new version | Deploy, Manage deployments, New version. |

Check first: Apps Script project time zone must be `Africa/Lagos`.

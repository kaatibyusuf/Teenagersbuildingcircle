# Weekly UTME Sunday mock: setup

1. Apps Script: replace `Academy.gs` and `Code.gs`; add `AcademyMocks.gs` and `AcademyMockBankPack1.gs`.
2. Project Settings: time zone must be `Africa/Lagos`.
3. Run `academyMockSeedPack1` once (editor Run button). It loads 380 questions. Check with menu "Academy mock: question bank status".
4. Menu "Academy mock: set up the weekly schedule". This creates two triggers: Thursday 18:00 builds Sunday's mock; Monday 07:00 emails each UTME student a report.
5. Optional test: menu "Academy mock: build next Sunday's mock now".
6. Deploy > Manage deployments > New version. Upload `academy-dashboard.html` to the site.

Settings are at the top of `AcademyMocks.gs` (combinations, hours, minutes, `ACM_ADMIN_EMAIL` for low-bank alerts).

The bank has 380 questions and each Sunday uses 180 per combination, so the same questions repeat within a few weeks. Add more with `acm_bankAdd_` (rows: subject, passage, question, right, wrong1, wrong2, wrong3, explanation). The job warns when a subject runs low.
Not reviewed by a teacher.

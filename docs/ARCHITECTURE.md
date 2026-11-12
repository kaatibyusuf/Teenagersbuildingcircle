# Architecture

```
 Student / mentor / admin browser
        │  HTML pages on Vercel (static)
        │  fetch(POST JSON)
        ▼
 Apps Script web app  ── doPost in Code.gs routes by action name
        │                  Academy.gs   acd_*, acdt_*, acda_*   (Academy portals)
        │                  AcademyMocks.gs  weekly mock, reports, leaderboard
        ▼
 Google Sheet (one tab per table)  +  MailApp (emails)  +  time triggers
```

## Frontend
Plain static pages. No build step. Each portal page holds its own script. Pages talk to the one Apps Script web-app URL.

## Backend (Apps Script)
- `Code.gs`: settings, sheet helpers (`table_`, `append_`, `put_`), the Madrasah dashboard API, the daily job and reminders.
- `Academy.gs`: three portals (student `acd_`, mentor `acdt_`, admin `acda_`). Login, lockout, tasks, CBT tests, scoring (`acd_breakdown_`), leaderboard.
- `AcademyMocks.gs`: the weekly Sunday mock.
- `AcademyMockBankPack*.gs`: question data. Each pack is a list of rows plus a `academyMockSeedPackN` function.

All files share one global scope in one Apps Script project, so they call each other's functions directly.

## Data (Google Sheet tabs used by the mock)
| Tab | Purpose |
|---|---|
| `AcademyMockBank` | every question: `BankID, Subject, Passage, Question, Right, Wrong1-3, Explanation, Uses, LastUsed, Active` |
| `AcademyTests` | one row per test; the mock writes four per week with `Series = MOCK-<sunday>` |
| `AcademyQuestions` | the questions built into each test (copied from the bank, options shuffled) |
| `AcademyAttempts` | each student's sitting and score |

## The weekly mock, step by step
1. **Thursday 18:00** `academyMockWeeklyJob` runs `academyMockWeekly()`.
2. For each subject it ranks active bank questions by least used, then longest ago, with a seeded random tie-break, and takes the first 60 (English) or 40.
3. It shuffles option positions per question using a seed made from the week and the question id, so the paper is the same for every student and repeatable.
4. It writes four tests (one per combination) and their questions, then bumps `Uses` and `LastUsed` on the picked bank rows.
5. **Sunday** students open one combination in the CBT tab; sitting one locks the others.
6. **Monday 07:00** `academyMockReportJob` emails each UTME student a report, using the saved scores.

## Constraints to know
- A Google Sheet is the database. Fine for hundreds of students. Many students submitting in the same minute, or tabs with tens of thousands of rows, will slow it down. See `DECISIONS.md` for when to move.
- Apps Script limits: 6 minutes per run, daily email quota (the code checks `MailApp.getRemainingDailyQuota()`).
- Questions already built into a week's tests keep their old text. Fix the bank and the tests separately.

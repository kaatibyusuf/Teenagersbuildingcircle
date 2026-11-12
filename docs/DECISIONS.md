# Decisions

Short notes on why things are the way they are. Add a new entry whenever you make a choice that someone might later question.

## 001 Google Sheets and Apps Script as the backend
**Why:** free, no servers to run, staff can read and fix data directly, and email and triggers come built in. Fits a solo builder and a school-sized load.
**Cost:** slow under heavy simultaneous use, weak at joins, hard to test, 6-minute run limit.
**Revisit when:** more than about 500 students, or many people submit in the same minute. Then move to a real database (for example Postgres on Supabase) and keep the same API shape so the pages do not change.

## 002 Static pages on Vercel, no framework
**Why:** simple, fast, deploys on every push, nothing to build.
**Revisit when:** pages share a lot of repeated code that becomes hard to keep in sync.

## 003 Question bank as seeded code files, edited in the Sheet afterwards
**Why:** packs are reviewable in git and loadable in one click.
**Rule:** after seeding, corrections are made in the `AcademyMockBank` tab (edit a cell or set Active to FALSE). Re-seeding never overwrites existing rows.

## 004 Tests run the real `.gs` files in Node with a fake spreadsheet
**Why:** Apps Script has no native test runner. The fake lives in `tests/helpers/gas.js`. It covers the sheet, mail, locks and dates the code uses.
**Limit:** it is a model of Apps Script, not Apps Script. Always do a quick manual run after deploying.

## 005 Seeded randomness for paper building
**Why:** the same week always gives the same paper, so rebuilding is safe and debugging is possible.

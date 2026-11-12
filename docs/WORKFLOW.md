# Workflow

## Branches
`main` is what the world sees. Work happens on short-lived branches named for the job, for example `fix-leaderboard-ties` or `add-pack-13`.

```powershell
git checkout main
git pull
git checkout -b add-pack-13
```

## Before you push
```powershell
npm run lint
npm test
```
Then try the page on localhost.

## Commits
One-line summary, then bullets:
```
Add Academy mock question bank pack 13

- 360 new UTME questions with explanations
- Seed function academyMockSeedPack13
```

## Pull requests
Push the branch, open a pull request on GitHub and fill in the template. Wait for the green CI tick. Open the Vercel preview link and check the page. Then merge.

## Releasing the backend
GitHub does not deploy Apps Script. After merging:
1. Paste changed `.gs` files into the Apps Script project.
2. Run any one-time setup function the change needs (for example `academyMockSeedPack13`).
3. Deploy, Manage deployments, **New version**.
4. Add a line to `CHANGELOG.md`.

## Adding a question pack
1. Add `backend/AcademyMockBankPackN.gs` with `ACM_PACKN` and `academyMockSeedPackN`.
2. `npm test`: the bank tests check shape, distinct options, subjects and explanations.
3. A teacher reviews the new questions.
4. Merge, paste into Apps Script, run the seed function once, deploy.

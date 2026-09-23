# Tests

Automated checks for `index.html` (the pool builder) and `api/setup.js` (the sync route).
Each test opens the real page in a simulated browser and clicks through it, with a fake
sync server standing in for Redis, so nothing touches your live data.

## Run them

1. Install Node.js 20 or newer (nodejs.org) if you don't have it.
2. Open a terminal in this `tests` folder.
3. First time only: `npm install`
4. `npm test`

Takes about 30 seconds. Every line should show a check mark; the summary at the end
shows `fail 0`. Any failure prints which check broke and why.

## What's covered

| File | Covers |
|---|---|
| `solver.test.js` | Valid builds, exact overlap, locks, exposure limits, tier priority and rotation |
| `candidates.test.js` | Tier groups and dividers, arrow/drag reordering rules, spread parsing |
| `entries.test.js` | Shared-first ordering, Move to, Copy entry, dog/fav mix |
| `history.test.js` | Save this week, grading, season and by-tier records, Start new week |
| `undo.test.js` | Undo button and Ctrl+Z |
| `sync.test.js` | Laptop/phone sync, merging saved weeks and grades, offline handling, sync pill |
| `transfer.test.js` | Copy / Load setup codes |
| `api.test.js` | `/api/setup` GET/POST, validation, missing-Redis error |

## Notes

- This folder has its own `package.json` so Vercel never installs anything for it, and the
  project's `.vercelignore` keeps it out of deployments.
- Run the tests after any change to `index.html` or `api/setup.js`.

# Tests

Automated checks for `index.html` (the pool builder and Bet Tracker), `api/setup.js` (pool sync), and `api/bets.js` (bet sync).
Each test opens the real page in a simulated browser and clicks through it, with a fake
sync server standing in for Redis and a fake ESPN scoreboard standing in for live scores, so nothing touches your live data.

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
| `accessibility.test.js` | Compact phone rows (Edit / Expand all), screen-reader names and states, pop-up focus handling, and color-contrast checks against the real CSS |
| `guidance.test.js` | Overlap fix button, the Benched list, and the Help guide (including a check that Help only names buttons that exist) |
| `past-weeks.test.js` | Adding past weeks by hand, the add-up check, 2/2 and 1/2 picks records, season totals, sync, and bad-data cleanup |
| `undo.test.js` | Undo button and Ctrl+Z |
| `sync.test.js` | Laptop/phone sync, merging saved weeks and grades, offline handling, sync pill |
| `transfer.test.js` | Copy / Load setup codes |
| `api.test.js` | `/api/setup` GET/POST, validation, missing-Redis error |
| `bets.test.js` | Bet Tracker: page tabs and `#bets` links, odds/risk/win/units, paste import, auto-grading (W/L/Push, not final, not found, no connection), hand results kept, delete + Undo, Ctrl+Z isolation, laptop/phone bet sync incl. deletes and typing during a sync, standalone backup import, Help buttons |
| `autograde.test.js` | Saved weeks > Auto-grade from scores: grades spread picks, keeps hand grades, skips hand-entered weeks, no-connection message |
| `api-bets.test.js` | `/api/bets` GET/POST, separate Redis key, validation and size limit, missing-Redis error |

## Notes

- This folder has its own `package.json` so Vercel never installs anything for it, and the
  project's `.vercelignore` keeps it out of deployments.
- Run the tests after any change to `index.html`, `api/setup.js`, or `api/bets.js`.

# AGENTS.md — rules for every coding agent (and human) on FroCast

Several people are pushing to this repo at once, each with their own coding agent.
Read this file before you start, and follow it on every task.

## What we're building
**FroCast**: a prep-planning dashboard for a froyo & boba shop on Nassau St (HackPrinceton, fall 2026).
It forecasts customers from weather + the Princeton calendar (breaks, exams, athletics, town and student events)
and tells staff how much boba to cook, how much fruit to cut, and how many froyo machines to run, to cut food waste.
Staff fill in a 30-second closing log each night, and the forecast learns from it.

## Git workflow: commit early, commit often
1. **Start every task from fresh `main`:**
   `git checkout main && git pull --rebase`
2. **Work on a short-lived branch** named `yourname/short-task`, e.g. `sophia/events-tab`.
3. **Commit small and often**: every working step, at least every ~20–30 minutes.
   One logical change per commit. Message format: `area: what changed` (e.g. `model: add exam-week factor`).
4. **Sync with main often**, at least before every push:
   `git fetch origin && git rebase origin/main`
5. **Merge back quickly.** Don't sit on a branch for hours. Small merges mean small conflicts.
   Open a PR (or merge after a teammate's OK), then delete the branch.
6. **Never force-push `main`.** On your own branch use `git push --force-with-lease`, never plain `--force`.

## Avoiding merge conflicts
- **Claim your files** in the table below before you edit, and remove your row when you're done.
- **Stay in your lane:** edit only the files your task needs. No drive-by refactors.
- **Don't reformat or reorder** code you didn't change (no mass prettier runs, no renaming across files).
- **Add, don't rewrite:** prefer new functions and new files over restructuring shared ones.
- **Shared hot spots** (`js/app.js`, `index.html`, `css/styles.css`): keep edits small and merge fast.
- Don't commit generated files, lockfile churn, `.env`, `.vercel/` or `node_modules/`.

## When you hit a merge conflict
1. `git fetch origin && git rebase origin/main`
2. For each conflicted file, **keep both sides' intent**. Never just pick "ours" or "theirs" to make it go away.
   If you don't understand the other change, read its commit (`git log -p origin/main -- <file>`) or ask its author.
3. Check that it still works (see "Before you push"), then `git add <file> && git rebase --continue`.
4. If a conflict is big or confusing, **stop and tell your human** rather than guessing.

## Before you push
- `npm run check` passes (syntax check).
- Run the site locally (`npm start`, then http://localhost:8000), click through every tab,
  and check the browser console has no errors.
- `git status` shows only the files you meant to change.

## Who's working on what (update this, keep it short)
| Person / agent | Task | Files | Started |
|---|---|---|---|
| Sophia (Claude) | Initial site build | everything (first commit) | Sat 12:30 |
| Drew (Claude) | Topping photo check (steps 1–2), then demo slider | new: `toppings.html` `js/toppings.js` `js/toppings-math.js` `js/flags.js` `css/toppings.css` `api/toppings.js` `api/vision.js` `api/cron.js` `api/_lib/ai.js` `api/_lib/photos.js` `tests/toppings.test.mjs`; `db/schema.js` `js/strings.js` `vercel.json`; small: `js/config.js` (2 settings), `index.html` (link + flags script), `README.md` `.env.example` | Sat 17:00 |

## Project layout
```
index.html          page shell and tabs
css/styles.css      all styles
js/config.js        shop settings, event types, default events
js/model.js         forecast, hourly curve, boba / fruit / machine plans
js/weather.js       live forecast (Open-Meteo), sample fallback
js/store.js         saves data in the browser (localStorage)
js/app.js           rendering and UI events
api/events.js       Vercel-style function: AI pulls events out of pasted calendar text
api/sync.js         reads every calendar source (feeds + web pages) and returns dated events
api/_lib.js         shared helpers: fetch, .ics parser, AI calls (not a route)
server.js           local dev server: serves the site and runs api/ (npm start)
.env.example        template for .env (the real .env is never committed)
```

## Code style
- Plain HTML/CSS/JS with ES modules. No build step, so Vercel serves it as is.
- **Short function names** (`forecast`, `bobaPlan`, `getWeather`), not sentence-like ones.
- Keep the forecast math simple and explainable. Every factor shows up as a "why" line in the UI.

## Data honesty (this matters for judging)
- Anything that isn't real must be labeled: keep the "sample" badges. Prefer adding a calendar source over hardcoding events (permanent events live in `FIXED_EVENTS` in `js/config.js`).
- Never present estimated savings as exact numbers.
- Food-safety limits (how long boba and fruit stay good) come from the shop, never from us.
- Never commit API keys. The AI key lives in your local `.env` (and later in Vercel's environment variables) as `ANTHROPIC_API_KEY`.

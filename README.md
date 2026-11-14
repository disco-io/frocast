# FroCast 🍦❄

**Prep less, waste less.** A prep-planning dashboard for a froyo & boba shop on Nassau Street, Princeton, built at HackPrinceton (fall 2026).

## The problem
We talked to staff at a local froyo shop. Froyo demand drops as it gets colder, and they already make less froyo in winter.
But **boba is prepped the same all year**, and cooked pearls harden within a few hours, so leftovers get thrown out.
Cut fruit toppings spoil too.

## What FroCast does
- **Forecasts customers** for the next 14 days from:
  - a typical day for the shop (owner's estimate)
  - live weather (Open-Meteo, free, no key)
  - the Princeton calendar: breaks, reading period and exams, athletics, town and student events, club competitions
  - a correction learned from the nightly closing log
- **Explains every forecast**: each factor shows as a "why" line (e.g. `85 × 0.71 × 1.10 ≈ 66 customers`).
- **Prep plan**: when to cook boba and how much (small batches timed so pearls run out before they harden), how much fruit to cut, how many froyo machines to run.
- **Events calendar**: add events by hand, or paste any calendar page and AI pulls out the dated events.
- **Closing log**: staff enter customers and what got thrown out (30 seconds). The forecast adjusts and the waste chart tracks progress.

## Run it locally
Static site, no build step:
```bash
python3 -m http.server 8000
# open http://localhost:8000
```
The AI event import needs the serverless function. Run with Vercel instead:
```bash
npx vercel dev
# set ANTHROPIC_API_KEY in a local .env file (never commit it)
```

## Deploy
Import the repo in Vercel (no framework, no build command). Add `ANTHROPIC_API_KEY` under Project → Settings → Environment Variables.

## Honest notes
- Sales numbers are **sample estimates** until the shop's real numbers are entered in Settings.
- Events marked "(sample)" are placeholders. Thanksgiving recess dates should be confirmed with the Princeton Registrar.
- Savings shown are **estimates**. Food-safety limits come from the shop.
- Data is stored in the browser (localStorage). Sharing across staff devices would need a small database.

## Team workflow
Several people and coding agents work in this repo. See [AGENTS.md](AGENTS.md).

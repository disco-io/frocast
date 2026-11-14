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
- **Prep plan**: when to cook boba and how much (small batches timed so pearls run out before they harden), how much fruit to cut, how many froyo machines to run. Each plan also has a busy-day backup ("if it's busier than expected, add a ¼ batch at 7 PM"), and the closing log asks whether you ran out of boba.
- **Events calendar**: no hardcoded events. A list of calendar sources (Princeton Athletics, Palmer Square, Planet Princeton, an academic calendar page) is read on the server: `.ics` feeds are parsed directly and ordinary web pages are read by AI. Add your own source links on the Events tab, add events by hand, or paste calendar text for the AI to read.
- **Closing log**: staff enter customers and what got thrown out (30 seconds). The forecast adjusts and the waste chart tracks progress.

## Run it locally
No build step, just Node 20+ and one dependency (Turso's database client):
```bash
npm install
cp .env.example .env     # then put your ANTHROPIC_API_KEY in .env (never commit it)
npm start
# open http://localhost:8000 and set up the device with the owner PIN (0000 unless OWNER_PIN is set)
npm test                 # pairing, page gate and shared-data tests
```
`server.js` serves the site, runs the `api/` functions and the device-pairing check, and keeps data in a local `local.db` file unless `TURSO_*` is set. Without an AI key, everything except the AI event import still works.

## Deploy
Import the repo in Vercel (no framework, no build command). Add these under Project → Settings → Environment Variables:
- `ANTHROPIC_API_KEY`: AI event import
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`: the shared database (create a free database at turso.tech)
- `OWNER_PIN`: the PIN the owner types once per device
- `DEVICE_SECRET`: a long random string that signs device cookies. Changing it un-pairs every device.

## Devices and shared data
Staff pages open only on a **paired device**. The owner enters the PIN once on each tablet or phone, and it stays set up for a year. Settings, events and closing logs are saved to Turso, so every paired device sees the same numbers. A copy stays in the browser, so a device that loses connection keeps working.

## Honest notes
- Sales numbers are **sample estimates** until the shop's real numbers are entered in Settings.
- Some events are read from web pages by AI, so check the dates. The academic calendar source is a third-party page (the Princeton Registrar blocks automated access), so confirm break dates with the Registrar.
- Savings shown are **estimates**. Food-safety limits come from the shop.
- Data is shared through Turso when the server is running. On plain static hosting it falls back to this browser only.

## Team workflow
Several people and coding agents work in this repo. See [AGENTS.md](AGENTS.md).

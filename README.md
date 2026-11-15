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
- **Events calendar**: no hardcoded events. A list of calendar sources (Princeton Athletics, Palmer Square, Planet Princeton, an academic calendar page) is read on the server: `.ics` feeds are parsed directly and ordinary web pages are read by AI. Add events by hand, or paste calendar text for the AI to read. The source list lives in `js/config.js`; a source can be removed on the Events tab. Only events that bring a noticeably bigger crowd are kept: football home games (the only sport), big town festivals and lightings, annual flagship shows, breaks, and the fixed HackPrinceton. Regular club events, other sports and exam periods are left out (see `CROWD` and `relevant` in `api/_lib.js`).
- **Closing log**: staff enter customers and what got thrown out (30 seconds). The forecast adjusts and the waste chart tracks progress.

## Run it locally
No build step, just Node 20+ and one dependency (Turso's database client):
```bash
npm install
cp .env.example .env     # then put your ANTHROPIC_API_KEY in .env (never commit it)
npm start
# open http://localhost:8000 (no PIN screen when running locally)
npm test                 # pairing, page gate, no-PIN local mode and shared-data tests
```
`server.js` serves the site, runs the `api/` functions (and the device-pairing check when it is turned on), and keeps data in a local `local.db` file unless `TURSO_*` is set. Without an AI key, everything except the AI event import still works.

## Hourly shape from BestTime.app (optional)
The hour-by-hour shape of a day can come from [BestTime.app](https://besttime.app)'s foot traffic forecast for the shop.
BestTime gives **relative busyness (0 to 100), not customer counts**: we only use it to split a day's total across the open hours.
The day's total still comes from Settings.

```bash
# put BESTTIME_PRIVATE_API_KEY in .env first (never commit it)
npm run besttime -- status    # credits used, cache age (no API call)
npm run besttime -- fetch     # first forecast: 2 credits (1 if it fails)
npm run besttime -- confirm   # after you check it matched the right shop
npm run besttime -- refresh   # at most once a week: 2 credits
```

- The site **never calls BestTime**. `scripts/besttime.js` fetches by hand and caches in `.cache/besttime/`; `api/shape.js` only reads that cache, for paired devices.
- Without a key or a cache, the site uses our hand-made baseline curve and says so under the hourly chart.
- Hard cap: 20 credits for the whole project. Every call is logged in `data/besttime/credits.jsonl`: commit that file so the cap is shared.
- **Don't commit BestTime's data.** Their terms (section 5.3) forbid redistributing raw or analyzed data, so `.cache/` is git-ignored. Showing it inside the app is allowed. A Vercel deploy from git therefore runs on the baseline curve.

## Deploy
Import the repo in Vercel (no framework, no build command). Add these under Project → Settings → Environment Variables:
- `ANTHROPIC_API_KEY`: AI event import
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`: the shared database (create a free database at turso.tech)
- `OWNER_PIN`: the PIN the owner types once per device
- `DEVICE_SECRET`: a long random string that signs device cookies. Changing it un-pairs every device.
- `TOPPING_CAMERA`: `1` turns on the topping bar check. Leave it unset to hide it.
- `CRON_SECRET`: protects the daily photo cleanup.

## Devices and shared data
When deployed (on Vercel, or locally with `REQUIRE_PAIRING=1`), staff pages open only on a **paired device**: the owner enters the PIN once on each tablet or phone, and it stays set up for a year. Locally there is no PIN screen, so the app opens straight away. Settings, events and closing logs are saved to Turso, so every paired device sees the same numbers. A copy stays in the browser, so a device that loses connection keeps working.

## Boba clock (`clock.html`)
A counter-tablet screen whose color is the state: green (fresh), amber (cook soon), red (cook now). It says when to start the next batch and how big ("Cook a HALF batch at 1:15") from the forecast, batch size, cook time and freshness in Settings. Staff tap **Batch cooked** and **Running low**. When a batch passes its freshness window, one tap answers "How much was left?", and that answer goes into the waste log. **Why this?** shows the math.

## Topping bar check (`toppings.html`, behind `TOPPING_CAMERA`)
At open and close, staff photograph the topping bar on a phone, or enter each bin's level by hand. The AI pre-fills each bin (empty, ¼, ½, ¾, full). Anything unclear is left blank and marked "needs a look", and nothing is saved until staff tap **Confirm all**. The day's usage per bin is open + refills − close. A negative result asks whether a refill was missed. Close levels of bins marked "thrown out" go to the waste log in pans. Photos are stored only when the check passed and no person is in frame, are visible only on paired devices, and are deleted after the Settings retention period (14 days by default). The owner sets up bins under **Bins**.

- **Close photo line-up lock:** on the close check, **Take photo** opens the live rear camera with this morning's photo as a faint overlay. The shutter stays locked until the live view lines up with that photo, and a hint says which way to move the phone (left, right, up, down, closer, back). After 12 seconds of trying, a "take it anyway" button appears so nobody is stuck. The live camera needs `https://` (or `localhost`). Without it the phone's own camera app is used and the finished photo is checked against the morning one instead. The line-up math is in `js/align.js`. *Tested in desktop Chrome with a stand-in camera feed, not yet on a real iPhone or Android phone.*
- **Compared with the morning photo:** the close photo is sent to the model together with the confirmed open photo and its levels, so it judges how far each bin has dropped. The close check shows both photos and each bin's change (for example Full → ½).
- **Table demo with one cup:** `toppings.html?demo=bowls` runs the same check on one real cup of cut strawberries with its own data, apart from the shop's and the simulated demo day's. Take the Opening photo and confirm, take some fruit out, take the Closing photo. For two or more cups, name the fruit in the link, left to right: `toppings.html?demo=bowls&cups=Strawberries,Mango` (up to four; opening a link with other cups starts the demo over). **Start over** clears it for the next run.
- **Model:** the photo check uses `claude-opus-5-5` at low effort (`VISION_MODEL`, `VISION_EFFORT`). It costs a few cents per photo.
- **Prep guidance:** the open check shows how much fresh fruit to set out, based on yesterday's usage. The morning prep text can use the same data from `GET /api/toppings?guidance=1`.
- **Right-sizing:** after at least 5 days of closes, a bin that usually ends ¾ full or more gets a "try a smaller pan" suggestion in **Bins**. The owner approves or dismisses it, and settings never change on their own.
- **Totals:** topping waste in pans, converted to dollars only for bins with an owner-entered cost (`GET /api/toppings?totals=1&days=7`). kg CO₂e shows once `TOPPING_CO2E_KG_PER_PAN` is set from a cited factor.

## Demo (`demo.html`)
A time slider (8 AM–11 PM) runs a **simulated** day through the counter-tablet clock, which fills the screen, without waiting on real time. It shows one day, the cold **Sat, Nov 14**, with that day's real recorded weather. The presenter taps the tablet like staff would. If a "cook now" prompt goes unanswered for 10 minutes, or a "How much was left?" question for 20, the demo does it and marks the entry auto. Dragging back hides later taps, and dragging forward shows them again. **Reset demo** clears the taps and reseeds the simulated data. The simulated topping check is no longer on this page; it still opens directly at `toppings.html?demo=1&day=2026-11-14`, and the real-photo cup check at `toppings.html?demo=bowls`. Demo rows are tagged `scenario = 'demo'` and never mix with live data.

## Staffing: workers per day and people needed at each time (Staffing tab, `npm run staffing`)
The dashboard's **Staffing** tab shows the next two weeks, one row per day: how many workers to schedule that day, then how many people are needed for prep, in each open hour and at close-out. Pick a day to see its shift blocks, who to have on call if it runs busier, the hour-by-hour numbers and the math. Workers to schedule = the day's staff-hours ÷ the longest shift (8 h, a Settings field), rounded up, and never fewer than the most people needed at once.

The script prints the same plan in the terminal. It prints, for each day, how many people to schedule at each time: shift blocks ("10 AM–7 PM 1 person · 7 PM–10 PM 2 people"), the peak, total staff-hours, who to have on call if the day runs 20% busier, and an hour-by-hour table (froyo, tea, boba batches started, work minutes, people).

```bash
npm run staffing                        # next 7 days from today
npm run staffing -- --days 14 --short   # two weeks, shift blocks only
npm run staffing -- --from 2026-11-20   # start on another day (within the 2-week weather forecast)
npm run staffing -- --json              # for the prep text or a schedule sheet
```

Work minutes per hour = tea drinks × 60 / 25 + froyo customers × 60 / 45 + 15 min per boba batch started. People = that ÷ 48 (each person planned at most 80% busy, since customers come in bursts), rounded up, at least 1 while open. Plus 1 person for an hour of prep before open, and 2 for a 45-minute close-out. All six rates (these five and the longest shift) are **assumed** placeholders until the shop sets them in Settings, and the tab shows an "assumed rates" tag while they are. It uses the dashboard's saved settings and events, live weather and the cached hourly shape, and never syncs calendars or calls AI. Logic: `js/staffing.js`; the tab is drawn by `js/staff-tab.js`.

## Texting agent (Photon)
Staff can text the shop's number `prep`, `events` or `help` and get the plan back (iMessage, through Photon). It runs inside `npm start`: when `PHOTON_PROJECT_ID`, `PHOTON_API_KEY`, `PHOTON_AGENT_HANDLE` and `PHOTON_TEST_SENDER` are in `.env`, the terminal prints `Photon agent: on`. Leave them out and it stays off; set `PHOTON_AGENT=0` to switch it off. It answers only the phones listed in `PHOTON_TEST_SENDER`, and only texts sent after it started. It uses the same saved settings and events as the dashboard, plus its own read of the calendar sources. `npm run agent` runs it alone (don't run both).

## Honest notes
- Sales numbers are **sample estimates** until the shop's real numbers are entered in Settings. The typical-day totals (125 weekday, 185 weekend day) are illustrative figures from franchise benchmarks, not this shop's data, and show an "assumed" badge until the owner sets them.
- The typical day and the hourly shape describe recent weeks, so weather counts only as warmer or colder than the last 4 weeks, not as an absolute cold penalty.
- Cold affects the two products in opposite ways: froyo drops, and tea goes up (people want warm boba). A day that is 45°F against a 64°F recent norm is froyo ×0.69 and tea ×1.09. Both curves are our placeholders (`TEMP` in `js/config.js`), not shop data.
- Some events are read from web pages by AI, so check the dates. The academic calendar source is a third-party page (the Princeton Registrar blocks automated access), so confirm break dates with the Registrar.
- Savings shown are **estimates**. Food-safety limits come from the shop.
- Data is shared through Turso when the server is running. On plain static hosting it falls back to this browser only.

## Team workflow
Several people and coding agents work in this repo. See [AGENTS.md](AGENTS.md).

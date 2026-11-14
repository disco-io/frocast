# Frocast — Build Spec

> Fresh boba at the right time, for **Fruity Yogurt** (166 Nassau St, Princeton, NJ).
> Repo: `disco-io/frocast` (public, created 2026-11-14). Product name: **Frocast** (froyo + forecast; the brief's working name was FreshBatch).
> Deadline: **8:00 AM Sun Nov 15, 2026** (hard). In-person judging 9:30 AM–2:30 PM; 2-minute demo at our table.

---

## 0. The one-paragraph pitch

Fruity Yogurt cooks the same three full batches of boba every day, year-round, even when cold weather empties the store. Boba goes hard within hours, so on slow days most of it is thrown out, and the pearls customers do get are stale. Frocast forecasts customers per hour from weather, day of week and the Princeton calendar, then tells the counter **when to cook and how much** ("Cook a HALF batch at 2:40"). One tap at expiry ("How much was left?") becomes the shop's first waste log. Jenny gets a prep text before open, can text questions back, and can update the public site by text. Smaller batches at the right time fix both the waste problem and the quality problem.

---

## 1. Tracks and what each judge needs to see

| Track | Type | What wins it for us | Demo emphasis |
|---|---|---|---|
| **Sustainability** (our one main track) | HackPrinceton main | Measured food waste avoided, with kg / CO₂e | Waste-avoided total, close-out photo |
| **Peri Forward Deployed** | Special | Real need, adoptable Monday, complete end to end | Interview quotes, "assumed" badges replaced by Jenny's real numbers, Monday adoption list |
| **Photon messaging agent** | Special | Real two-way iMessage/WhatsApp agent | Prep text lands on a real phone; reply Q&A; "taro is out" → site updates |
| **Amazon Practical AI** | Special | Agentic (reasons, plans, acts), adaptive, simple UX | Reply agent uses tools; leftover logs → "lower your margin?" suggestion |
| ~~Hardware / Physical AI~~ | Special | **Dropped:** no hardware (D19). The close-out uses the phone camera | — |

Main-track rubric (Creativity, Utility, Charity, Avidity) is covered by the same story.

**Peri eligibility (must be in the Devpost and README):** business name, the name and role of the person consulted (Jenny Chen, Owner), and one piece of evidence (photo, screenshot, short video, or direct quote). The revisit (§13) captures this.

**HackPrinceton rules that affect us:** the repo must be public and created Nov 13–15 (✅ created 2026-11-14). Add Discord usernames to the submission. An optional ≤2-minute video is due with the submission.

---

## 2. Decisions log (from the interview)

| # | Topic | Decision |
|---|---|---|
| D1 | Team | Claude + 2 teammates (team of 3), work split **by section** |
| D2 | Time | 12+ hours of build time (all-nighter) |
| D3 | Storage | **Turso / libSQL** (SQLite dialect; `file:` DB locally; persists on Vercel) |
| D4 | Messaging | **Photon 2.0 is the default adapter** (iMessage/WhatsApp, no US SMS registration). **Twilio** is an alternate adapter. **On-screen phone mockup** is the offline fallback |
| D5 | LLM | Claude via Anthropic API (we have a key). Deterministic fallback for every LLM path |
| D6 | No invented numbers | **Slot tokens.** The model writes `{{tokens}}`; code fills them. Any digit or number word in raw model text is rejected, then one retry, then a deterministic template |
| D7 | Demand model | **Split streams: froyo vs. tea**, each with its own weather sensitivity. Boba servings are derived from both |
| D8 | Batch sizes | **Quarter steps**: ¼, ½, ¾, FULL (optional "≈ N g dry" hint) |
| D9 | Safety margin | Default **+25%** ("running out is worse"). A Setting with an assumed badge |
| D10 | Clock UI | **Full-bleed state color** (green/amber/red/grey) + one giant instruction + thin day strip |
| D11 | Language | **English + Spanish toggle** on staff screens, from one string table |
| D12 | Waste math | **Cooked-less delta** vs. the habit, with logged leftovers alongside as a check |
| D13 | Waste unit | **Servings** headline; secondary **$** and **kg food / kg CO₂e**, each an assumed conversion |
| D14 | Traceability | **Tap any number → "Why?" sheet** via a shared `<Traced>` component |
| D15 | Demo day | **Contrast:** cold **Sat Nov 14, 2026** (Thanksgiving recess 10 days out) vs. warm **Sat Sep 5, 2026** (first weekend of term) |
| D16 | Demo setup | **Stage page + real props.** Laptop `/demo` stage. A teammate's **paired phone** receives the real Photon text and photographs prop topping cups for the close-out |
| D17 | Demo script | **Hybrid.** Off-stage events auto-fire; the presenter taps "Batch cooked" and the leftover answer live |
| D18 | Prep text time | **8:00–9:00 AM ET window.** Two UTC crons + local-hour guard + send-once lock. Time is a Setting |
| D19 | Hardware | **None.** The close-out photo is taken with the phone's camera through a "Take photo" button in the web app: nothing to buy, mount or maintain, and it's what Jenny would realistically adopt. Hardware / Physical AI tracks dropped |
| D20 | Revisit | **In person tonight, before 11 PM close**: field checklist in §13 |
| D21 | Learning loop | **Suggest, owner approves**: leftover logs → one-tap margin suggestion |
| D22 | Close-out photo | **Close-out only, staff confirm.** 1–3 phone photos plus the bar's ordered bin list → Claude vision estimates → staff confirm. Manual taps when there's no photo |
| D23 | Reply intent | **LLM routing + confirm.** Menu changes always echo back and need YES |
| D24 | Access | **Pair each device once** with the owner PIN (1-year signed cookie, revocable). Staff never type a PIN, and the counter tablet never locks. Unpaired visitors can't open staff pages, write data or trigger Claude calls. The owner PIN is still needed for Settings-level actions (§4.6) |
| D25 | Cut list | **No pre-approved cuts.** If anything is at risk, Claude flags it to the user before cutting (per the brief) |
| D26 | Name | **Frocast** (matches the repo), used in the UI, Devpost and pitch |

---

## 3. Team and ownership

| Owner | Owns end to end | Depends on |
|---|---|---|
| **Claude** | M0 contracts + scaffold, DB schema, `Clock` abstraction, §5 Forecast, §6 Batch clock, §8 Demo mode, Settings/setup, `<Traced>` + assumed badges, i18n plumbing, device pairing + access control; then §10 Close-out photo | — |
| **Teammate A** | §7 Prep text + messaging (Photon, Twilio, Mock adapters), cron, reply agent / intent router, phone mockup component | `lib/contracts.ts`, `getPrepFacts()`, forecast query functions |
| **Teammate B** | §9 Public site, menu data + seed file, `parseMenuChange` / `publishMenuChange`, staff flavor board (web fallback) | `lib/contracts.ts`, `Clock` (for "open now") |
| **Whoever is free ~8–10 PM** | §13 Revisit to the shop (≤1 hour) | Printed or phone checklist |
| **Everyone, last 2 hours** | README, Devpost, video, demo rehearsal | — |

**Contract-first rule:** Claude commits `lib/contracts.ts` and fixtures (`data/fixtures/*.json`) **before** anyone writes feature code. Teammates build against the fixtures and swap in real calls when Claude's modules land. Contract changes go through Claude and get announced in the team chat.

Commit small and often to short-lived branches with PRs into `main`, or straight to `main` for tiny changes; nobody force-pushes.

---

## 4. Architecture

### 4.1 Stack ("boring and reliable")
- **Next.js (App Router) + TypeScript + Tailwind**, deployed to **Vercel** (HTTPS by default on `*.vercel.app`).
- **Drizzle ORM + `@libsql/client`**: `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` in prod, `file:./local.db` in dev. Drizzle migrations are committed.
- **Dates/timezones:** store UTC ISO strings; everything user-facing is computed in **`America/New_York`** with `date-fns` + `@date-fns/tz`. Never use the server's local time (Vercel runs in UTC).
- **Anthropic SDK** (`@anthropic-ai/sdk`) + **zod** for structured outputs (`client.messages.parse` + `zodOutputFormat`).
- **Live updates:** plain polling (5 s on the clock and phone mockup). No websockets or SSE.
- **Weather:** Open-Meteo (no key). Committed fixtures for the demo and for offline use.

### 4.2 The `Clock` abstraction (enables demo mode; build in M0)
Every time read goes through `getClock(ctx)`. **Nothing calls `new Date()` directly** in domain code.

```ts
interface Clock { now(): Date; scenarioId: ScenarioId; isDemo: boolean }
type ScenarioId = 'live' | 'demo-nov14' | 'demo-sep05';
```
- Live: real time, `scenarioId = 'live'`.
- Demo: the simulated time and scenario come from the stage page's state (passed as params or cookie `fc_demo`). This is scoped to the demo session, so the real public site and real staff clock are never affected.

### 4.3 Data isolation
Every domain table has a `scenario_id` column. Demo writes (batches, waste, messages) land in `demo-*` scenarios. A **Reset demo** button deletes all rows for that scenario. Live waste totals never include demo data.

### 4.4 LLM usage (all paths have deterministic fallbacks)
- Model: `LLM_MODEL` env, default **`claude-opus-5-5`** at `output_config.effort: "low"` for routing and parsing and `"medium"` for prep text and vision. If demo latency is a problem, switch to `claude-haiku-5-5` with that one env var.
- Opus 5.5 notes: thinking can't be disabled (use low effort); **forced `tool_choice` returns 400**, so use `auto` + `strict: true` tools or structured outputs; include server-side refusal fallbacks (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`) on the beta messages endpoint; always check `stop_reason` before reading content.
- Every LLM call has a 6 s timeout in demo mode and 15 s in live mode. On timeout, error, refusal or validation failure, use the deterministic path. The UI shows a tiny "template" pill when the fallback was used. That is honest, and judges like it.

### 4.5 Feature flags (env, default off)
`ORDER_AHEAD`, `TOPPING_CAMERA`. Plus `DEMO_OFFLINE=1`, which forces weather fixtures, the mock messaging provider, the stub vision result and template text, for when venue Wi-Fi (`puvisitor`) dies.

### 4.6 Access control and spend (D24)
The staff pages share a public deployment with the customer site, and the README/Devpost links are public. So:
- **Device pairing:** `/staff/pair` → owner PIN → name the device ("Counter tablet", "Jenny's phone") → the server creates a `devices` row and sets the `fc_device` cookie (httpOnly, Secure, SameSite=Lax, 365 days) to `deviceId.HMAC(DEVICE_SECRET)`.
- **`middleware.ts`** verifies the HMAC on `/staff/*` and on the staff write APIs (`/api/boba/*`, `/api/vision/*`, `/api/sales/*`, `/api/menu`). Unpaired page requests redirect to `/staff/pair`; unpaired API requests get 401. Route handlers also check `revoked_at` in the DB.
- **Owner session** (PIN, 12-hour cookie) is required on top of pairing for Settings, CSV upload, the menu board, the bin list, suggestion approval and device management (Settings → Devices → Revoke).
- **PIN attempts** are limited to 5 per 15 minutes per IP (`pin_attempts` table).
- **Public surfaces** are the `(public)` routes (read-only) and `/demo`. On `/demo`, unpaired visitors write only to `demo-*` scenarios and **never trigger Claude**: prep text, replies and vision use templates and stub results, labeled "template". The team's paired table laptop and phone get live Claude.
- **Spend backstop:** `LLM_DAILY_CALL_CAP` (env), counted in `llm_usage`. Past the cap, every path uses its deterministic fallback.
- Inbound messaging webhooks use signature verification plus the owner allowlist (§7.1). The cron uses `CRON_SECRET`.
- The README and Devpost link only the public site and `/demo`, never `/staff`.

---

## 5. Section 1 — Demand forecast (foundation; Claude)

### 5.1 Interface (swappable model)
```ts
interface ForecastModel {
  id: string;                                   // 'baseline-v1' | 'fitted-<uploadId>'
  forecastDay(date: LocalDate, inputs: ForecastInputs): DayForecast;
}
interface ForecastInputs { weatherHourly: WeatherHour[]; events: CalendarEvent[]; settings: Settings; config: ForecastConfig }
interface HourForecast {
  hour: number;                                  // 10..22 (slot start), open hours only
  froyo: Traced<number>; tea: Traced<number>; total: Traced<number>;
  bobaServings: Traced<number>; fruitServings: Traced<number>;
  factors: { dow: number; weather: { froyo: number; tea: number }; calendar: number };
}
interface DayForecast {
  date: LocalDate; open: string; close: string;  // from Settings hours_by_dow
  hours: HourForecast[]; totals: {...Traced};
  vsTypical: Traced<number>;                     // ratio vs. typical same weekday
  reason: string;                                // deterministic, e.g. "Cold and rainy: expect about 40% of a typical Saturday"
  modelId: string; isEstimate: true;
}
```
The UI only talks to `getForecast(date, clock)`, which picks the active model (fitted if an active fit exists, else baseline).

### 5.2 Baseline formula (transparent, all knobs in one file)
For category `c ∈ {froyo, tea}`, date `d`, hour `h`:
```
customers[c][h] = base_daily[c] × curve[c][h] × dow[weekday(d)] × weather[c](temp_h, precip_h) × calendar(d, h)
bobaServings[h] = tea[h] × boba_attach_tea + froyo[h] × boba_attach_froyo
fruitServings[h] = froyo[h] × fruit_attach_froyo
typical(d)      = same formula with weather = 1 and calendar = 1   →   vsTypical = Σ actual / Σ typical
```
- **Config file:** `config/forecast.config.ts`, typed and commented. Every value carries `{ value, source, assumed: true }`. All of these are **placeholders until calibrated** (the revisit asks for a busy-Saturday vs. slow-weekday headcount):
  - `base_daily` per category, `curve[c][h]` (normalized hourly shares, 10:00–23:00), `dow` multipliers
  - weather bands per category (froyo steep, tea shallow) on `apparent_temperature` °F, plus a precipitation multiplier
  - attach rates (`boba_attach_tea`, `boba_attach_froyo`, `fruit_attach_froyo`)
  - calendar multipliers by event type
  - `kg_per_boba_serving`, `co2e_per_kg_food` (**null until a cited source is chosen; the CO₂e line hides while null**)
- **Reason string** is a deterministic template built from the two largest factors ("Cold (41°F) and rainy", "Home game vs. Penn", "Thanksgiving recess"). It never uses an LLM.

### 5.3 Calendar file
`data/calendar/princeton-2026-27.json`. Each event is `{ id, type, start, end, multiplier?, hours?, source_url, verified }`. Seed it (all `verified: false` until checked against the registrar or athletics site):
- Fall 2026 classes begin ~Wed Sep 2 (inferred from the Labor Day rule; verify)
- **Thanksgiving recess:** after classes Tue Nov 24 → Sun Nov 29; classes resume Mon Nov 30
- Home football at Princeton Stadium: Sep 26 (UAlbany), Oct 17 (Brown), Oct 31 (Cornell, low confidence), Nov 7 (Dartmouth), **Nov 21 (Penn)**. Game days get a post-game window boost
- Reading period, finals and winter break dates are fetched from the registrar during M1 and cited

Sources found during the interview: acadcalendar.com (Princeton 2026–27), Daily Princetonian (2026–27 calendar change), goprincetontigers.com (2026 schedule), fbschedules.com.

### 5.4 Weather
- `lib/weather/openMeteo.ts`: forecast endpoint for today plus 7 days, hourly `temperature_2m, apparent_temperature, precipitation_probability, precipitation, weather_code`, `temperature_unit=fahrenheit`, `timezone=America/New_York`, at ≈40.350, −74.655 (geocode 166 Nassau St to confirm).
- Archive endpoint for past dates (Sep 5). **Nov 14 won't be in the archive until days later**, so capture today's hourly data from the forecast endpoint (with `past_days`) **tonight** and commit it as a fixture.
- Cache: a `weather_cache` table (30 min TTL) plus committed fixtures `data/fixtures/weather/{2026-09-05,2026-11-14,week-of-2026-11-14}.json`. Fixtures are used when `DEMO_OFFLINE` is set or the fetch fails.

### 5.5 CSV upload + refit (owner PIN)
- `/staff/settings/sales`: upload CSV → **column mapping step** (pick the timestamp, item, quantity, and optional order ID columns) → preview of the first 20 parsed rows → **item mapping** (each distinct item name → `froyo | tea | other`, plus a "contains boba" checkbox, prefilled by keywords like boba/pearl/tapioca) → save.
- Orders are grouped by order ID if mapped; otherwise by identical timestamp to the minute.
- Aggregate into `sales_hourly`. **Refit = shrinkage blend** per (weekday, hour, category) cell: `fitted = (n·empirical + k·baseline) / (n + k)`, with `k` in config (default 4 weeks' weight). Weather and calendar factors stay from config. The boba attach rate is refit from item data when "contains boba" is mapped.
- Writes a `model_fits` row, and the dashboard pill changes from "Estimate · baseline" to "Estimate · fitted on N days".
- The app is fully usable with no upload.

### 5.6 Dashboard (`/staff` home)
- Today's hourly curve (stacked froyo/tea bars, open hours only), the 7-day strip (each day shows vsTypical and its reason), and a callout for notable upcoming calendar events ("Thanksgiving recess in 10 days").
- A small **"Estimate"** scope pill near the title. **No "how to read" notes under charts; caveats go in the footer.** Every number is a `<Traced>` that taps to show "Why?".

**M1 done when:** `getForecast()` returns real-weather forecasts for today plus 7 days; the Nov 14 and Sep 5 fixtures produce visibly different days; the dashboard renders with Why sheets; unit tests cover the formula and the open-hours clipping.

---

## 6. Section 2 — Boba batch clock (hero; Claude)

### 6.1 Semantics
- **Lead time** = from "start cooking" until ready (cook + rest). **"Batch cooked" is pressed when the batch is ready**, so `ready_at = now` and `expires_at = ready_at + freshness_hours`.
- The clock says **"Cook a HALF batch at 2:40"**, meaning start at 2:40 and have it ready by about 3:25.
- Overlapping batches are allowed (max 2 active). Staff serve oldest first, and consumption is FIFO.

### 6.2 Planner (pure function: `planBoba(state, forecast, settings, now) → ClockState`)
1. **Demand** per 15-minute slot = hourly `bobaServings` ÷ 4 × `intradayCorrection` (starts at 1.0; see "Running low").
2. **Remaining per active batch** = servings − FIFO-allocated forecast demand since `ready_at`, floored at 0.
3. **Run-out time** `t_out` = the earliest of (projected total remaining < buffer) and (the newest fresh batch's `expires_at`).
4. **Cook at** `t_cook = t_out − lead_time`.
5. **Size** = demand over `[t_out, min(t_out + freshness, close)]` × (1 + safety_margin) − projected carryover still fresh at `t_out`, ÷ batch_size, **rounded up to the nearest quarter**, clamped to [¼, FULL].
6. **Last-cook cutoff:** no cook prompt if `t_out` > close − `last_cook_cutoff_min` (config, default 45). Show "No more boba cooking today" instead.
7. **State color:** GREEN when the next cook is more than 20 minutes away; AMBER at ≤ 20 minutes; RED when the cook time has passed, nothing fresh is left, or a batch has expired un-logged; GREY when closed or before the first cook. Thresholds live in config.

### 6.3 Screen (`/staff/clock`, paired device, no PIN prompt, tablet landscape, Wake Lock API to keep the screen on)
- Full-bleed state color. One giant line ("COOK A HALF BATCH AT 2:40" / "in 28 minutes"), sized to read from six feet away (instruction ≥ 72 px, secondary ≥ 32 px). Contrast is checked in all four state colors.
- Secondary line: current batch age countdown and estimated servings left.
- A thin 10a–11p day strip showing batches as blocks, plus a now-marker.
- **Two huge buttons** (≥ 120 px tall): **BATCH COOKED** (opens a size picker ¼ ½ ¾ FULL with the recommended size highlighted) and **RUNNING LOW**.
- **Running low:** sets the remaining estimate to `min(est, 15% of batch)`, logs a `running_low` event, updates `intradayCorrection` = observed ÷ forecast consumption (bounded 0.5–2.0), and replans. This usually flips the screen to AMBER or RED.
- **Expiry:** a full-screen modal reads **"How much was left?"** with **None / A quarter / Half / Most** (0, 0.25, 0.5, 0.75). One tap writes `waste_log`. This is the waste log.
- Optional soft chime on the transition to AMBER or RED (toggle; default on).
- Footer: **Waste avoided today: N servings** (an "illustrative" badge while `habit_batches_per_day` is assumed), plus all-time and the logged-leftover check. Tap for the Why sheet.
- ES/EN toggle in the corner.

### 6.4 Waste avoided (D12, D13)
- The habit is modeled as cumulative cooked servings at the habit times (`habit_batch_times` Setting, assumed default 09:15 / 13:30 / 17:30) × batch_size. That makes **avoided(t) = habit_cum(t) − actual_cum(t)** a running number that moves with the demo slider.
- Day total = habit_batches × batch_size − Σ cooked. All-time = sum over live days.
- **Check line:** "Logged leftovers today: N servings."
- **Stockout flag:** if "Running low" was pressed and nothing fresh was ready within lead_time + 15 minutes, the day is marked "may overstate (possible stockout)".
- Secondary conversions: `$ = servings × cost_per_boba_serving` (Setting, assumed), `kg = servings × kg_per_boba_serving` (config), `CO₂e = kg × co2e_per_kg_food` (config, cited; hidden while null).

### 6.5 Learning loop (D21)
After at least 5 logged batches: if the mean leftover fraction is above 0.25, suggest lowering the safety margin by 10 points. If "Running low" was pressed on 30% or more of batches, suggest raising it by 10. Each suggestion appears as a card in Settings with its evidence and an **Apply** button, and lands in the `suggestions` table. Applied changes show up in Why sheets. Nothing changes silently.

**M2 done when:** a full simulated day plays correctly through the planner, covered by unit tests (cold day = fewer and smaller batches, warm day = more, running low triggers a replan, expiry triggers the modal); the screen is legible at six feet on an actual tablet or laptop; waste avoided ties out to the Why sheet.

---

## 7. Section 3 — Morning prep text + replies (Teammate A)

### 7.1 Messaging adapter
```ts
interface MessagingProvider {
  id: 'photon' | 'twilio' | 'mock';
  send(msg: { to: string; body: string; scenarioId: ScenarioId }): Promise<{ providerId: string }>;
  parseInbound(req: Request): Promise<InboundMessage | null>;   // verifies the webhook signature
}
```
- Selected by `MESSAGING_PROVIDER`; automatically falls back to `mock` when credentials are missing. Every message (in and out, any provider) is written to `messages`, and the phone mockup renders from that table.
- **Photon:** SDK/webhook details are unknown. **Timebox 90 minutes** to get send plus inbound hello-world working. If it isn't working by then, tell the team: mock becomes the demo path and Photon is still pitched as the adapter.
- **Twilio:** implement against the standard REST send and inbound webhook. It's fine if it's never exercised live.
- **Sender allowlist:** inbound messages are processed only from the `owner_phone` Setting (plus `DEMO_PHONE` in demo). Everything else gets a polite canned reply.

### 7.2 Facts → tokens → text (D6)
- `getPrepFacts(date, clock): PrepFacts` (Claude provides this) returns a flat map of **token → Traced value**: `weekday`, `traffic_pct`, `expected_customers`, `peak_window`, `weather_summary`, `fruit_trays`, `b1_size`, `b1_time`, … `bN_*`, `batch_count`, `vs_habit_servings`.
- The LLM receives the facts as **token names with their formatted values for context only**. It must return `{ text: string }` (structured output) using `{{token}}` placeholders.
- **Validator** (`lib/llm/validateTokens.ts`): reject if the raw model text contains `/\d/`, any number word (zero–twenty, thirty…hundred, dozen, half, quarter, percent, couple, few), or an unknown token; also cap the filled length at 480 chars. Retry once with the error, then fall back to `templates/prepText.en.ts`.
- **Fruit trays** = ceil(Σ fruitServings ÷ `servings_per_fruit_tray` Setting).
- **Prep text content:** traffic vs. typical with the reason, fruit trays to cut, the boba schedule (sizes and times), and one line about tonight's peak. English to Jenny.

### 7.3 Morning cron (D18)
- `vercel.json` crons at `0 12 * * *` and `0 13 * * *` (UTC) → `/api/cron/prep-text`, protected with `CRON_SECRET`.
- The handler sends only if the local ET hour equals the `prep_text_hour` Setting (default 8) **and** no `prep_text` exists for that local date (a unique index makes it send-once). This survives DST and Hobby's anywhere-in-the-hour firing.

### 7.4 Reply agent (Amazon "agentic" story; D23)
- `lib/agent/router.ts` classifies the intent with a structured output: `forecast_question | menu_change | confirm_yes | confirm_no | other`.
- **forecast_question:** a tool-use loop (`tool_choice: auto`, `strict: true` tools) with read-only tools `query_forecast({date, from_hour, to_hour})`, `get_boba_plan({date})` and `get_waste_summary({range})`. Each tool returns facts with **namespaced tokens** (`{{t1.total_customers}}`). The final answer uses tokens only, so the same validator and filler apply.
- **menu_change:** calls Teammate B's `parseMenuChange(text, menu)` → ops → creates a `pending_actions` row → replies "Publish: Taro OUT, Chai IN? Reply YES to publish or NO to cancel." The pending action expires after 30 minutes. A new item not in the menu is flagged "(new)".
- **confirm_yes:** `publishMenuChange(pendingId)` → "Published. fruityyogurt site updated." (live link). **The agent can never publish without an explicit YES.**
- **other:** a short canned scope reply listing what it can do.

### 7.5 Phone mockup
A `<PhoneMockup scenarioId>` component (an iMessage-style thread) polls `messages`. It has a compose box so the demo and judges can type replies. It's used on `/demo` and on `/staff/messages`.

**M4 done when:** the prep text is generated from facts with zero digits from the model (validator unit tests), a cron dry-run works, replies answer "how busy is tonight?" from data, and "taro is out, chai is in" → confirm → YES updates the site. Real Photon delivery is a bonus.

---

## 8. Demo mode (required; Claude)

### 8.1 `/demo` stage page (laptop, judges at the table)
```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Sat Nov 14 · cold ▾ | Sat Sep 5 · warm]     ⟲ Reset    ▶ Play  offline ●│
│ ┌────────── Batch clock (tablet frame) ──────────┐  ┌── Phone ───────┐   │
│ │  AMBER · COOK A HALF BATCH AT 1:40             │  │ 8:31 Prep text │   │
│ │  [BATCH COOKED]     [RUNNING LOW]              │  │ > how busy...  │   │
│ └────────────────────────────────────────────────┘  └────────────────┘   │
│  Forecast today ▁▂▃▅▆▅▃▂   · reason line ·   Waste avoided: N servings    │
│  8a ─pre-open─|10a────────●────────────────────────────────────────11p   │
└──────────────────────────────────────────────────────────────────────────┘
```
- **Time slider runs 8:00 AM → 11:00 PM** in 5-minute steps, with 8:00–10:00 shaded "pre-open" so the morning text can fire. *(The brief said 10 AM–11 PM; the slider starts earlier because the prep text must land before open.)* Play mode runs at 60× speed.
- **The scenario toggle** switches between the Nov 14 and Sep 5 fixtures. A "compare" chip shows both days' plans side by side: the cold day cooks fewer and smaller batches than the habit (waste avoided), and on the warm day the habit **runs out** in the evening while Frocast adds a batch. One rule fixes both.

### 8.2 Deterministic replay (D17)
- Demo state = `replay(scenarioScript, presenterEvents, t)`, a pure function. Scripted events (prep text at 8:30, opening batch at 9:15, forecast refresh) auto-fire as the slider passes them.
- **Live beats** are the presenter tapping BATCH COOKED at the amber prompt and answering "How much was left?" at expiry. Presenter events are stored with their sim timestamp. Dragging back hides them; dragging forward shows them again.
- **Safety net:** if the presenter drags 10 or more minutes past an un-tapped cook prompt, the script auto-cooks the recommended size (labeled "auto") so the story continues.
- When the sim passes 8:30, the prep text goes into the mock phone, and if the "send real" toggle is on, also to the teammate's phone via Photon.
- Scripts live in `data/demo/scenarios/{nov14-cold,sep05-warm}.ts`.

### 8.3 Offline resilience
`DEMO_OFFLINE` (or an automatic switch after one failed fetch): weather fixtures, mock messaging, template text, and a pre-recorded vision result. The offline dot on the stage shows the mode honestly.

### 8.4 2-minute script (draft; rehearse and trim)
| Time | Beat |
|---|---|
| 0:00–0:15 | Jenny's problem: boba goes hard in hours, 3 full batches year-round, store empty at 11:30 on a cold Saturday |
| 0:15–0:35 | Nov 14 forecast: "Cold: about N% of a typical Saturday"; Penn game bump on Nov 21; Thanksgiving recess callout; tap a number → Why |
| 0:35–1:05 | Drag: 8:30 prep text lands on the real phone → open → amber "Cook a HALF batch" → **tap** → drag to expiry → **"A quarter"** → waste avoided ticks up |
| 1:05–1:20 | Toggle Sep 5: the warm-day plan cooks more; the habit would have run out |
| 1:20–1:40 | Text "how busy is tonight?" → answer; "taro is out, chai is in" → YES → public site updates |
| 1:40–1:55 | Paired phone → **Take photo** of the prop topping cups → close-out estimates → confirm → waste log |
| 1:55–2:00 | Adopt Monday: enter 4 settings, put a tablet on the counter, save a phone number |

Reorder per judge: the Photon judge sees messaging first, Amazon sees the reply agent and the margin suggestion first, Peri sees the interview evidence plus the Monday list.

**M3 done when:** the full script runs start to finish 3 times in a row with Wi-Fi off.

---

## 9. Section 4 — Public website (Teammate B)

- Routes in `app/(public)/`: `/` (today's flavors, hours with "Open now / Opens 10 AM" from `Clock`, location with an embedded OpenStreetMap iframe plus an "Open in Maps" link, and the phone number) and `/menu` (froyo, tea and toppings).
- **Mobile-first, fast:** static rendering with `revalidatePath` on publish, no client JS beyond the essentials, Lighthouse mobile performance ≥ 90.
- **HTTPS:** Vercel default. The README documents pointing the shop's domain at Vercel.
- **Placeholder photos only:** CSS/SVG placeholder tiles ("Photo coming soon") or clearly licensed CC0 images. **Nothing copied from the old site.**
- **Seed data:** `data/seed/menu.seed.ts`, headed `// ⚠️ OWNER TO VERIFY — every item and price below`. **Do not invent flavors or prices.** Seed only items confirmed from the revisit's menu photo; until then use clearly fake placeholders ("Flavor 1 — owner to confirm"). `price_cents: null` hides the price.
- **Phone number:** `phone_number_public` Setting, rendered with a visible "to confirm" marker until the owner sets it.
- **Menu change functions** (B owns; A's router calls them):
  - `parseMenuChange(text, menu) → MenuChangeOp[]`: Claude structured output + code-side fuzzy matching to item IDs (case/whitespace-insensitive, with a small alias table). Ops: `set_available | set_unavailable | add_item`.
  - `publishMenuChange(pendingId)`: applies ops in one transaction, writes `menu_changes` (audit), and revalidates.
- **Staff flavor board** (`/staff/menu`, owner PIN): toggle availability with big switches. This is the web fallback when texting isn't set up, and it makes Monday adoption real.

**M5 done when:** the site is deployed over HTTPS, a text update round-trips to the live page, and the Lighthouse check passes.

---

## 10. Close-out photo (`TOPPING_CAMERA` flag; Claude after M3)

**No hardware.** Staff take the photo on a paired phone in the web app. There is nothing to buy, mount or maintain, and it works on the phone Jenny already has.

- **Capture:** `/staff/close-out` has a big **Take photo** button, implemented as `<input type="file" accept="image/*" capture="environment">`. It opens the rear camera in iOS and Android browsers (a file picker on desktop). Allow 1–3 photos for a long bar. Downscale on a canvas in the browser to ≤ 1600 px JPEG (~300 KB) before upload, well under Vercel's request-body limit.
- **Bin list** (`/staff/settings/bins`, owner PIN): the topping bar's bins in left-to-right order, each with row, position, label, linked menu topping and optional `servings_per_bin` override. **No drawn boxes:** a handheld phone frames the bar differently every night, so fixed boxes wouldn't line up.
- **Interface:** `ToppingVision.estimate(images: Blob[], bins: Bin[]) → BinEstimate[]` (`bin_id`, `level: none|quarter|half|most`, `confidence`, `not_visible`). Implementations: `ClaudeVisionProvider` (Opus 5.5, base64 images plus the ordered bin list, structured output) and `StubVisionProvider` (fixture).
- **Confirm screen:** one tile per bin with the estimate preselected on four tap buttons (none / ¼ / ½ / most). Bins marked `not_visible` or low-confidence are highlighted for staff to set. **Save to waste log** (`source: camera_confirmed`). Waste servings = level × `servings_per_bin` (Setting, assumed).
- **No photo:** the same confirm screen with manual taps (`source: manual`), so it's useful on Monday either way.
- **Demo prop:** 4–6 clear cups of colored toppings at different fill levels. The presenter photographs them with the paired phone. Offline: stub result.

---

## 11. Settings, setup, PIN, i18n

### 11.1 Settings (`/staff/settings`, owner PIN; first run redirects to `/staff/setup`)
| Key | Default (placeholder) | Badge until set |
|---|---|---|
| `batch_size_servings` | 30 | assumed |
| `cook_lead_min` | 45 | assumed |
| `freshness_hours` | 3 | assumed |
| `habit_batches_per_day` | 3 | assumed (waste avoided = "illustrative") |
| `habit_batch_times` | 09:15, 13:30, 17:30 | assumed |
| `safety_margin_pct` | 25 | assumed |
| `dry_grams_per_full_batch` | null (hint hidden) | optional |
| `servings_per_fruit_tray` | 20 | assumed |
| `servings_per_bin` | 15 | assumed |
| `cost_per_boba_serving_usd` | null ($ line hidden until set) | assumed |
| `hours_by_dow` | 10:00–23:00 every day | assumed (confirm weekends) |
| `prep_text_hour` | 8 | assumed |
| `owner_phone`, `phone_number_public` | empty | "to confirm" |

- Setup wizard: the 4 brief fields first (batch size, lead time, freshness, batches/day), then "more (optional)".
- **Every placeholder shows an "assumed, tap to set" badge** that deep-links to its field. Saving a field sets `is_assumed = false`, even if the value is unchanged (the owner confirmed it).

### 11.2 PIN and pairing (D24)
See §4.6. Day to day, a paired device opens the batch clock, dashboard and close-out with no PIN prompt. The owner PIN pairs devices and guards Settings, CSV upload, the menu board, the bin list, suggestion approval and device management. The PIN hash lives in settings and is seeded from the `OWNER_PIN` env (the README says to change it at setup). The owner session lasts 12 hours.

### 11.3 i18n (D11)
`lib/i18n/strings.ts` with `en` and `es` dictionaries; all staff-screen strings go through `t()`. The toggle is stored in localStorage (wrapped in try/catch; defaults to `en`). Spanish strings are machine-drafted with `reviewed: false` until a Spanish speaker checks them (ask at the revisit). Prep texts to Jenny stay English.

---

## 12. Traceability (`<Traced>`; D14)

```ts
type Traced<T> = { value: T; formula: string; inputs: TraceInput[] };
type TraceInput = { label: string; value: string | number;
  source: { kind: 'config' | 'setting' | 'log' | 'weather' | 'calendar' | 'model_fit'; ref: string; assumed: boolean } };
```
- `<TracedNumber t={…} format="servings|pct|time|usd|kg">` renders the value. Tapping opens a bottom sheet with the formula, each input, its source (for example `config/forecast.config.ts → weather.froyo.40–49°F`, `Setting: safety_margin_pct (assumed)`, `waste_log #12`) and assumed badges.
- **Rule:** no domain number is rendered without `Traced`. Code review checks this.

---

## 13. Revisit field checklist (tonight, before 11 PM)

Bring the phone with the deployed app (or screenshots). **Ask permission before photos or recording.**

**Boba**
- [ ] Full batch size (servings and/or dry weight). How do they measure it?
- [ ] Cook + rest time until servable (→ lead time)
- [ ] When does it get too hard to serve? (→ freshness window)
- [ ] How many batches per day now, and at what times? (→ habit)
- [ ] Do they ever mix an old batch with a new one?
- [ ] Rough cost per serving (or per bag)

**Fruit and toppings**
- [ ] How many fruit trays per day, and about how many servings per tray?
- [ ] Who preps, and what time does the opener arrive? (→ prep text hour)
- [ ] Topping bar: list the bins left to right (→ bin list) and rough servings per bin
- [ ] If they allow it, take a test close-out photo of the bar near close (→ a real test image for vision)

**Operations**
- [ ] Register/POS brand. Can it export sales? (photo of the export screen if possible)
- [ ] Weekend hours: same 10 AM–11 PM?
- [ ] Public phone number to list
- [ ] Busiest Saturday vs. slowest weekday headcount (calibrates `base_daily` and `dow`)
- [ ] Which messaging app does Jenny use (iMessage / WhatsApp / SMS)? OK to text her?
- [ ] Do counter staff prefer Spanish or another language? (confirms D11)
- [ ] Photo of the current menu/flavor board (→ seed file; transcribe, don't invent)
- [ ] Does the shop have a tablet or spare device for the counter?

**Evidence (Peri)**
- [ ] Permission to use "Jenny Chen, Owner" and a quote
- [ ] Photo with Jenny or of the shop (with permission), or a short clip
- [ ] Her reaction to the batch clock: "Would you use this on Monday?" (write the exact words)

After the revisit, enter the values into Settings (live scenario), which clears the assumed badges. Commit `docs/interview-notes.md` with the answers.

---

## 14. Data model (Drizzle / libSQL)

All domain tables carry `scenario_id TEXT NOT NULL DEFAULT 'live'`. Timestamps are UTC ISO text.

| Table | Columns (abridged) |
|---|---|
| `settings` | `key PK`, `value_json`, `is_assumed`, `updated_at` |
| `batches` | `id`, `scenario_id`, `ready_at`, `expires_at`, `size_fraction` (0.25/0.5/0.75/1), `servings`, `recommended_fraction`, `source` (`staff\|demo_script\|demo_auto\|order`), `status` (`active\|expired\|dumped`), `leftover_fraction`, `leftover_logged_at` |
| `batch_events` | `id`, `scenario_id`, `at`, `type` (`running_low\|prompt_shown\|prompt_acted`), `batch_id`, `payload_json` |
| `waste_log` | `id`, `scenario_id`, `at`, `item_type` (`boba\|topping`), `item_key`, `leftover_fraction`, `leftover_servings`, `source` (`staff\|camera_confirmed\|manual`), `batch_id?`, `photo_id?` |
| `weather_cache` | `key PK` (lat,lon,date-range), `fetched_at`, `payload_json`, `origin` (`live\|archive\|fixture`) |
| `sales_uploads` | `id`, `uploaded_at`, `filename`, `column_map_json`, `item_map_json`, `row_count`, `date_from`, `date_to` |
| `sales_hourly` | `upload_id`, `local_date`, `hour`, `category`, `orders`, `boba_items` |
| `model_fits` | `id`, `upload_id`, `created_at`, `n_days`, `params_json`, `active` |
| `messages` | `id`, `scenario_id`, `direction`, `provider`, `kind` (`prep_text\|reply\|confirm\|other`), `local_date`, `counterpart`, `body`, `facts_json`, `used_fallback`, `provider_id`, `created_at`. Unique index on (`scenario_id`, `kind`, `local_date`) where `kind = 'prep_text'` |
| `pending_actions` | `id`, `scenario_id`, `message_id`, `type` (`menu_change`), `ops_json`, `status` (`awaiting\|published\|cancelled\|expired`), `expires_at` |
| `menu_items` | `id`, `category` (`froyo\|tea\|topping\|fruit`), `name`, `description?`, `price_cents?`, `available`, `on_tap_today`, `verified`, `sort` |
| `menu_changes` | `id`, `at`, `ops_json`, `source` (`sms\|web`), `pending_action_id?` |
| `suggestions` | `id`, `created_at`, `setting_key`, `current_json`, `proposed_json`, `evidence_json`, `status` |
| `topping_bins` | `id`, `row`, `position`, `label`, `menu_item_id?`, `servings_per_bin?`, `active` |
| `closeout_photos` | `id`, `scenario_id`, `at`, `images_json` (≤ 3 downscaled data URLs), `estimates_json`, `estimator` (`claude\|stub`), `confirmed_at?` |
| `devices` | `id`, `name`, `created_at`, `last_seen_at`, `revoked_at?` |
| `pin_attempts` | `ip_hash`, `at`, `ok` |
| `llm_usage` | `local_date PK`, `calls`, `input_tokens`, `output_tokens` |
| `orders` *(ORDER_AHEAD)* | `id`, `pickup_at`, `items_json`, `name`, `status`. Feeds the planner as known demand |

---

## 15. File layout

```
frocast/
├─ .plans/frocast-spec.md            ← this file
├─ README.md                             problem · interview findings · run · real vs simulated · Monday adoption · Peri block
├─ docs/interview-notes.md               revisit answers + evidence refs
├─ vercel.json                           crons (12:00, 13:00 UTC)
├─ middleware.ts                         device-cookie gate for /staff/* + staff write APIs
├─ drizzle.config.ts · drizzle/          migrations
├─ config/
│  └─ forecast.config.ts                 ALL model knobs (value, source, assumed)
├─ data/
│  ├─ calendar/princeton-2026-27.json
│  ├─ seed/menu.seed.ts                  ⚠️ OWNER TO VERIFY
│  ├─ demo/scenarios/{nov14-cold,sep05-warm}.ts
│  └─ fixtures/{weather/*.json, forecast/*.json, prep-facts.json, vision-estimate.json}
├─ lib/
│  ├─ contracts.ts                       shared types (M0, Claude)
│  ├─ db/{schema.ts, client.ts}
│  ├─ clock.ts                           Clock + scenario resolution
│  ├─ time.ts                            ET helpers, open-hours
│  ├─ settings.ts                        get/set + assumed flags
│  ├─ trace.ts                           Traced helpers
│  ├─ weather/openMeteo.ts
│  ├─ forecast/{index.ts, baseline.ts, fitted.ts, reasons.ts, calendar.ts}
│  ├─ boba/{planner.ts, waste.ts, suggestions.ts}
│  ├─ sales/{parseCsv.ts, aggregate.ts, refit.ts}
│  ├─ auth/{device.ts, owner.ts, pinLimit.ts}
│  ├─ llm/{client.ts, validateTokens.ts, fillTokens.ts, budget.ts}
│  ├─ messaging/{index.ts, photon.ts, twilio.ts, mock.ts}          (A)
│  ├─ prep/{facts.ts (Claude), compose.ts (A), templates/}          
│  ├─ agent/{router.ts, tools.ts}                                   (A)
│  ├─ menu/{parseChange.ts, publish.ts, queries.ts}                 (B)
│  ├─ vision/{index.ts, claude.ts, stub.ts}
│  ├─ demo/{replay.ts, scenarios.ts}
│  └─ i18n/strings.ts
├─ components/
│  ├─ TracedNumber.tsx · WhySheet.tsx · AssumedBadge.tsx · PinGate.tsx
│  ├─ clock/{BatchClock.tsx, SizePicker.tsx, LeftoverModal.tsx, DayStrip.tsx}
│  ├─ forecast/{HourlyChart.tsx, WeekStrip.tsx}
│  ├─ PhoneMockup.tsx                                               (A)
│  └─ public/*                                                      (B)
├─ app/
│  ├─ (public)/page.tsx · (public)/menu/page.tsx                    (B)
│  ├─ staff/page.tsx                     dashboard
│  ├─ staff/pair/page.tsx                owner PIN → pair this device
│  ├─ staff/clock/page.tsx               hero, paired device, no PIN prompt
│  ├─ staff/setup/page.tsx · staff/settings/{page.tsx, sales/page.tsx}
│  ├─ staff/menu/page.tsx                                           (B)
│  ├─ staff/messages/page.tsx                                       (A)
│  ├─ staff/close-out/page.tsx           "Take photo" (phone camera) → confirm
│  ├─ staff/settings/{bins,devices}/page.tsx
│  ├─ demo/page.tsx                      stage
│  └─ api/
│     ├─ forecast/route.ts · boba/{state,cooked,running-low,leftover}/route.ts
│     ├─ cron/prep-text/route.ts                                    (A)
│     ├─ messaging/{photon,twilio}/inbound/route.ts                 (A)
│     ├─ menu/route.ts                                              (B)
│     ├─ sales/upload/route.ts · vision/estimate/route.ts
│     └─ demo/{reset,event}/route.ts
└─ tests/  (vitest)  forecast · planner · waste · validateTokens · parseChange · replay
```

Env vars: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `LLM_MODEL`, `MESSAGING_PROVIDER`, `PHOTON_*`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `OWNER_PIN`, `DEVICE_SECRET`, `LLM_DAILY_CALL_CAP`, `CRON_SECRET`, `DEMO_PHONE`, `DEMO_OFFLINE`, `ORDER_AHEAD`, `TOPPING_CAMERA`. Commit `.env.example`; never commit secrets.

---

## 16. Milestones and gates

Times are targets; slip → tell the user, don't silently cut.

| Milestone | Owner | Exit criteria | Target |
|---|---|---|---|
| **M0** Scaffold + contracts | Claude | Next app on Vercel + Turso, schema migrated, `contracts.ts`, `Clock`, device pairing + `middleware.ts`, fixtures, `.env.example`, empty route stubs | first ~1.5 h |
| **M1** Forecast | Claude | §5 done criteria | +3 h |
| **M2** Batch clock | Claude | §6 done criteria | +3 h |
| **M3** Demo mode | Claude | §8 done criteria (Wi-Fi off ×3) | +2 h |
| **M4** Prep text + replies | A (parallel from M0) | §7 done criteria | parallel |
| **M5** Public site + menu by text | B (parallel from M0) | §9 done criteria | parallel |
| **Revisit** | free teammate | §13 checklist complete, values in Settings | **before 10:30 PM** |
| **M6** Close-out photo | Claude | §10 on a real phone + stub fallback | after M3 |
| **M7** README, Devpost, video | all | README sections per brief, Peri block, Discord names, ≤2 min video uploaded | 5:00–7:00 AM |
| **Freeze** | all | No features after **5:00 AM**; fixes only | 5:00 AM |
| **Submit** | user | Devpost submitted with repo link | **by 7:30 AM** |

**Priority if behind (nothing is pre-approved to cut):** M0 → M1 → M2 → M3 are the spine. Next comes the M4 prep text (template-only text is acceptable before the LLM version), then the M5 site and menu-by-text, then M6 close-out photo, then Twilio, the refit math, ORDER_AHEAD, and full Spanish copy. Claude raises any at-risk item with the user before cutting it.

---

## 17. README outline (required by the brief)

1. Problem: stale boba = waste + quality; no forecasting, no waste tracking
2. Interview findings (Jenny Chen, Owner), with quotes and evidence
3. What Frocast does (screens, with screenshots)
4. How to run it (local + deploy, env vars, `DEMO_OFFLINE`)
5. **Real vs. simulated vs. assumed** table (weather = real; calendar = real, cited; baseline factors = assumed; settings = owner-entered or assumed; demo days = simulated staff actions on real weather)
6. **Adopt on Monday:** enter 4 settings, pair the counter tablet once with the PIN and leave the clock open on it, add Jenny's number, optionally upload a register CSV, point the domain at Vercel
7. Architecture + swappable interfaces (forecast model, messaging provider, vision provider)
8. Tracks entered + team + Discord usernames

---

## 18. Open questions and risks

- **Naming:** resolved: **Frocast** (D26).
- **Photon SDK unknowns:** the 90-minute timebox applies (§7.1). Monday adoption depends on Jenny's messaging app (revisit).
- **Hardware / Physical AI tracks are dropped** (D19). Getting them back would take a real hardware build; the phone photo doesn't count.
- **Calendar dates:** fall-term start is inferred, and one football date (Oct 31) is low confidence. Verify before the demo.
- **Nov 14 weather:** capture the fixture tonight (the archive lags by days).
- **Baseline factors are guesses until the revisit:** say so plainly in the README and UI ("Estimate", assumed badges).
- **Model choice:** Opus 5.5 at low effort by default; switch `LLM_MODEL=claude-haiku-5-5` if demo latency hurts.
- **ChatOverflow leaderboard (handbook):** it would mean connecting this coding agent to an external network. Not done unless the user explicitly opts in.

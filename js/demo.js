// Demo page: a time slider (8:00 AM – 11:00 PM) drives the counter-tablet clock, which fills
// the screen, through a simulated day. Hybrid script: the presenter taps the live beats
// ("Batch cooked", "How much was left?"); if a prompt goes unanswered for a while, the demo
// does it for them (marked auto) so the story keeps moving. Demo rows never touch live data.
import { call } from "./api.js";
import { DEFAULTS, withFixed } from "./config.js";
import { forecast, bobaDemand } from "./model.js";
import { clockState, simulate } from "./planner.js";
import { DEMO_DAYS } from "./demo-data.js";

const $ = id => document.getElementById(id);
const S = { scen: "nov", min: 510, s: structuredClone(DEFAULTS), playing: null, busy: false, timer: null, data: null };
const AUTO_COOK_AFTER = 10;  // minutes past a "cook now" prompt before the demo cooks for you
const AUTO_LEFT_AFTER = 20;  // minutes past expiry before the demo answers "How much was left?"
const START = 510;           // 8:30 AM

const day = () => DEMO_DAYS[S.scen];
const hm = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;

function dayObj() {
  const d = day();
  const [y, m, dd] = d.key.split("-").map(Number);
  return { date: new Date(y, m - 1, dd), key: d.key, temp: d.weather.temp, rain: d.weather.rain, cond: d.weather.cond };
}

function tell(frame, extra = {}) {
  $(frame).contentWindow?.postMessage({ type: "frocast-time", min: S.min, day: day().key, ...extra }, location.origin);
}

async function fetchBoba() {
  const r = await call(`/api/boba?${new URLSearchParams({ scenario: "demo", day: day().key, min: S.min })}`);
  return r.ok ? r.data : { batches: [], lows: [], waste: [] };
}

// The day's forecast, boba demand and clock state at the slider's time (what the hybrid script acts on)
async function readState() {
  const d = dayObj(), events = withFixed(day().events);
  const fc = forecast(d, events, S.s);
  const hourly = bobaDemand(fc, d, events, S.s);
  const boba = await fetchBoba();
  const st = clockState({ hourly, batches: boba.batches, lows: boba.lows, now: S.min, s: S.s });
  S.data = { fc, hourly, boba, st };
}

// ---------- hybrid script ----------
async function autoPlay() {
  if (S.busy) return;
  S.busy = true;
  try {
    for (let i = 0; i < 6; i++) {
      await readState();
      const { st, boba } = S.data;
      const n = st.next;
      if (st.mode === "now" && n && S.min - n.cookMin >= AUTO_COOK_AFTER) {
        await call("/api/boba", { method: "POST", body: { scenario: "demo", day: day().key, min: n.readyMin, action: "cooked", frac: n.frac, recommended: n.frac, batchSize: st.k.batch, source: "demo-auto" } });
        continue;
      }
      const stale = st.needLeftover.find(b => S.min - (b.readyMin + st.k.freshMin) >= AUTO_LEFT_AFTER);
      if (stale) {
        const sim = simulate(S.data.hourly, boba.batches, boba.lows, b0(stale, st), st.k).find(x => x.id === stale.id);
        const frac = sim ? sim.left / sim.servings : 0;
        const level = [0, 0.25, 0.5, 0.75].reduce((best, x) => (Math.abs(x - frac) < Math.abs(best - frac) ? x : best), 0);
        await call("/api/boba", { method: "POST", body: { scenario: "demo", day: day().key, min: S.min, action: "leftover", batchId: stale.id, level, source: "demo-auto" } });
        continue;
      }
      break;
    }
  } finally {
    S.busy = false;
  }
  tell("clockFrame");
}
const b0 = (b, st) => b.readyMin + st.k.freshMin; // stock at the moment the batch expired

// ---------- time ----------
function setMin(m, { quiet = false } = {}) {
  S.min = Math.max(480, Math.min(1380, m));
  $("slider").value = S.min;
  $("time").textContent = hm(S.min);
  tell("clockFrame");
  clearTimeout(S.timer);
  if (!quiet) S.timer = setTimeout(autoPlay, 250);
}

function setScen(scen) {
  S.scen = scen;
  document.querySelectorAll("[data-scen]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.scen === scen)));
  setMin(START);
}

function togglePlay() {
  if (S.playing) {
    clearInterval(S.playing);
    S.playing = null;
  } else {
    if (S.min >= 1380) setMin(START);
    S.playing = setInterval(() => {
      if (S.min >= 1380) return togglePlay();
      setMin(S.min + 5);
    }, 400);
  }
  $("play").textContent = S.playing ? "❚❚ Pause" : "▶ Play";
  $("play").setAttribute("aria-pressed", String(!!S.playing));
}

async function reset() {
  $("reset").disabled = true;
  await call("/api/demo", { method: "POST", body: { action: "reset" } });
  $("reset").disabled = false;
  loadFrames();
  setScen(S.scen);
}

function loadFrames() {
  const q = new URLSearchParams({ demo: "1", day: day().key, min: S.min });
  $("clockFrame").src = `clock.html?${q}`;
}

async function start() {
  const shared = await call("/api/data");
  if (shared.status === 401) { location.href = `/pair.html?next=${encodeURIComponent("/demo.html")}`; return; }
  const src = shared.data?.state?.s;
  if (src) S.s = { ...structuredClone(DEFAULTS), ...src, base: { ...DEFAULTS.base, ...(src.base || {}) } };
  const status = await call("/api/demo");
  if (!status.data?.seeded) await call("/api/demo", { method: "POST", body: { action: "reset" } });
  document.querySelectorAll("[data-scen]").forEach(b => b.addEventListener("click", () => setScen(b.dataset.scen)));
  $("slider").addEventListener("input", e => setMin(Number(e.target.value)));
  $("play").addEventListener("click", togglePlay);
  $("reset").addEventListener("click", reset);
  loadFrames();
  $("clockFrame").addEventListener("load", () => tell("clockFrame"));
  setMin(START, { quiet: true });
}

start();

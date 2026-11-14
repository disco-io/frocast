// Demo page: a time slider (8:00 AM – 11:00 PM) drives the counter-tablet clock and the
// topping check through a simulated day. Hybrid script: the presenter taps the live beats
// ("Batch cooked", "How much was left?"); if a prompt goes unanswered for a while, the demo
// does it for them (marked auto) so the story keeps moving. Demo rows never touch live data.
import { call } from "./api.js";
import { DEFAULTS, withFixed } from "./config.js";
import { forecast, bobaDemand, DOW, MON } from "./model.js";
import { clockState, simulate } from "./planner.js";
import { DEMO_DAYS, DEMO_PHOTOS } from "./demo-data.js";

const $ = id => document.getElementById(id);
const S = { scen: "nov", min: 510, s: structuredClone(DEFAULTS), playing: null, busy: false, tab: null, timer: null, data: null };
const AUTO_COOK_AFTER = 10;  // minutes past a "cook now" prompt before the demo cooks for you
const AUTO_LEFT_AFTER = 20;  // minutes past expiry before the demo answers "How much was left?"
const START = 510;           // 8:30 AM

const day = () => DEMO_DAYS[S.scen];
const hm = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;
const SIZE = { 0.25: "¼", 0.5: "½", 0.75: "¾", 1: "Full" };
const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function dayObj() {
  const d = day();
  const [y, m, dd] = d.key.split("-").map(Number);
  return { date: new Date(y, m - 1, dd), key: d.key, temp: d.weather.temp, rain: d.weather.rain, cond: d.weather.cond };
}

function tell(frame, extra = {}) {
  $(frame).contentWindow?.postMessage({ type: "frocast-time", min: S.min, day: day().key, ...extra }, location.origin);
}

function toppingTab() {
  return S.min >= 21 * 60 + 30 ? "close" : S.min < 11 * 60 ? "open" : "refills";
}

async function fetchBoba() {
  const r = await call(`/api/boba?${new URLSearchParams({ scenario: "demo", day: day().key, min: S.min })}`);
  return r.ok ? r.data : { batches: [], lows: [], waste: [] };
}

async function fetchToppings() {
  const r = await call(`/api/toppings?${new URLSearchParams({ scenario: "demo", day: day().key, min: S.min })}`);
  return r.ok ? r.data : null;
}

// ---------- side panel ----------
async function renderSide() {
  const d = dayObj(), events = withFixed(day().events);
  const fc = forecast(d, events, S.s);
  const hourly = bobaDemand(fc, d, events, S.s);
  const boba = await fetchBoba();
  const st = clockState({ hourly, batches: boba.batches, lows: boba.lows, now: S.min, s: S.s });
  S.data = { fc, hourly, boba, st };

  $("fcTitle").textContent = `${DOW[d.date.getDay()]}, ${MON[d.date.getMonth()]} ${d.date.getDate()} · ${d.temp}°F, ${d.cond}`;
  $("cust").textContent = fc.customers;
  const drop = Math.round((1 - fc.customers / fc.base) * 100);
  $("cmp").innerHTML = `${drop > 0 ? `<b>${drop}% fewer</b> than` : `${-drop}% more than`} a typical warm ${DOW[d.date.getDay()]} (${fc.base}) · ` +
    `<span class="sw" style="background:var(--pink)"></span>${fc.froyo} froyo · <span class="sw" style="background:var(--blue)"></span>${fc.tea} tea`;
  $("dayNote").textContent = day().note;
  const cls = m => (m < 0.99 ? "down" : m > 1.01 ? "up" : "flat");
  $("why").innerHTML = fc.factors.map(x => {
    if (x.base !== undefined) return `<div class="row"><span>${esc(x.label)}</span><span class="x flat">${x.base} customers (${Math.round(x.froyo)} froyo · ${Math.round(x.tea)} tea)</span></div>`;
    if (x.m === undefined) return `<div class="row"><span>${esc(x.label)}</span><span><span class="x ${cls(x.mf)}">froyo ×${x.mf.toFixed(2)}</span> · <span class="x ${cls(x.mt)}">tea ×${x.mt.toFixed(2)}</span></span></div>`;
    return `<div class="row"><span>${esc(x.label)}</span><span class="x ${cls(x.m)}">×${x.m.toFixed(2)}</span></div>`;
  }).join("");
  const chain = key => fc.factors.slice(1).map(x => "× " + (x[key] ?? x.m).toFixed(2)).join(" ");
  $("formula").textContent = `Froyo ${Math.round(fc.factors[0].froyo)} ${chain("mf")} ≈ ${fc.froyo} · Tea ${Math.round(fc.factors[0].tea)} ${chain("mt")} ≈ ${fc.tea}`;

  const lead = st.k.lead;
  const cooked = boba.batches.map(b => `<li><span><b>${SIZE[b.frac]}</b> ready ${hm(b.readyMin)}</span><small>${b.source === "demo-auto" ? "auto" : "tapped"}${b.leftoverLogged ? ` · left ${b.leftoverLevel * 100}%` : ""}</small></li>`);
  const planned = st.plan.filter(p => p.readyMin > S.min).map(p => `<li class="plan"><span><b>${SIZE[p.frac]}</b> start ${hm(p.cookMin)} → ready ${hm(p.readyMin)}</span><small>planned</small></li>`);
  $("plan").innerHTML = [...cooked, ...planned].join("") || "<li class=\"plan\"><span>No boba planned</span></li>";
  const k = st.k;
  const usualDay = k.habit * k.batch, planDay = st.plannedDay;
  const leftovers = boba.waste.reduce((a, w) => a + w.amount, 0);
  const tops = await fetchToppings();
  const topWaste = tops ? tops.waste.reduce((a, w) => a + w.amount, 0) : 0;
  $("totals").innerHTML =
    `<div>Plan for the day: <b>${Math.round(planDay)}</b> drinks of boba vs. your usual <b>${usualDay}</b> (${k.habit} full batches, cook time ${lead} min) <span class="sample">estimate</span></div>` +
    `<div>Boba leftovers logged: <b>${Math.round(leftovers)}</b> drinks · topping waste: <b>${topWaste}</b> pans</div>`;
}

// ---------- hybrid script ----------
async function autoPlay() {
  if (S.busy) return;
  S.busy = true;
  try {
    for (let i = 0; i < 6; i++) {
      await renderSide();
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
  const tab = toppingTab();
  tell("topFrame", tab !== S.tab ? { tab } : {});
  S.tab = tab;
  clearTimeout(S.timer);
  S.timer = setTimeout(quiet ? renderSide : autoPlay, 250);
}

function setScen(scen) {
  S.scen = scen;
  document.querySelectorAll("[data-scen]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.scen === scen)));
  S.tab = null;
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
  $("topFrame").src = `toppings.html?${q}#open`;
}

async function start() {
  $("phOpen").src = DEMO_PHOTOS.open;
  $("phClose").src = DEMO_PHOTOS.close;
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
  $("topFrame").addEventListener("load", () => tell("topFrame", { tab: toppingTab() }));
  setMin(START, { quiet: true });
  setInterval(renderSide, 5000); // pick up the presenter's taps in the tablet
}

start();

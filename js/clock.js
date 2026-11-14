// Boba clock for the counter tablet: what to cook next, the current batch's freshness,
// "Batch cooked" / "Running low", and the one-tap "How much was left?" waste log.
// Demo: clock.html?demo=1&day=2026-11-14&min=600 (or postMessage {type:"frocast-time", min, day}).
import { applyStatic, langToggle, t } from "./i18n.js";
import { call } from "./api.js";
import { DEFAULTS, DEFAULT_EVENTS, withFixed, LOCATION, HOURS, settings } from "./config.js";
import { demoDay } from "./demo-data.js";
import { DOW, forecast, bobaDemand, iso } from "./model.js";
import { loadShape, source as shapeSource } from "./shape.js";
import { getWeather } from "./weather.js";
import { clockState, OPEN, CLOSE } from "./planner.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const demo = params.get("demo") === "1";
const scenario = demo ? "demo" : "live";
const SOUND_KEY = "frocast-sound";

const S = {
  s: structuredClone(DEFAULTS), events: DEFAULT_EVENTS, days: [],
  shape: null,   // cached BestTime hourly shape, or baseline (js/shape.js); same one the dashboard uses
  batches: [], lows: [], waste: [], online: true, lastMode: null, last: null,
  simMin: demo && params.has("min") ? Number(params.get("min")) : null,
  simDay: demo && params.get("day") ? params.get("day") : null,
  undoId: null, toastTimer: null, leftoverFor: null
};

// ---------- time ----------
const nowMin = () => (S.simMin !== null ? S.simMin : new Date().getHours() * 60 + new Date().getMinutes());
const todayKey = () => S.simDay || iso(new Date());
const hm = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(((m % 60) + 60) % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;
const dur = m => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${Math.max(0, m)} min`);
const short = f => t(`sizeShort.${f}`);

// ---------- data ----------
// Shared settings and events straight from the server. (Not through store.js: the clock never
// saves app state, and must not move the dashboard's sync point on this device.)
async function loadShared() {
  const r = await call("/api/data");
  let src = r.ok ? r.data?.state || {} : null;
  if (!src) {
    try { src = JSON.parse(localStorage.getItem("frocast-v1") || "{}"); } catch { src = {}; }
  }
  S.s = settings(src.s);
  S.events = withFixed(src.events || []);   // the dashboard never saves fixed events (e.g. HackPrinceton), so add them back
  if (demo) S.events = withFixed(demoDay(todayKey())?.events || []); // demo days use their own (simulated) events
  if (r.status === 401) toPair();
}

async function loadWeather() {
  const { days } = await getWeather(new Date(), LOCATION);
  S.days = days;
}

// Reads our own cache only (api/shape.js). This never calls BestTime, in live or demo mode.
async function loadHourShape() {
  S.shape = await loadShape();
}

function toPair() {
  location.href = `/pair.html?next=${encodeURIComponent(location.pathname + location.search)}`;
}

function q(extra = {}) {
  const p = { scenario, day: todayKey(), ...extra };
  if (demo) p.min = nowMin();
  return p;
}

async function refresh() {
  const r = await call(`/api/boba?${new URLSearchParams(q())}`);
  if (r.status === 401) return toPair();
  if (r.ok) {
    S.batches = r.data.batches;
    S.lows = r.data.lows;
    S.waste = r.data.waste;
    S.online = true;
  } else if (r.status === 0) {
    S.online = false;
  }
  render();
}

async function act(body) {
  const r = await call("/api/boba", { method: "POST", body: { ...q(), ...body } });
  if (!r.ok) toast(t("clock.saveFailed"));
  return r;
}

// ---------- model ----------
function today() {
  const key = todayKey();
  const w = (demo && demoDay(key)?.weather) || S.days.find(d => d.key === key); // demo: the day's real recorded weather
  const [y, m, d] = key.split("-").map(Number);
  const day = { date: new Date(y, m - 1, d), key, temp: w?.temp ?? 55, norm: w?.norm, rain: !!w?.rain };
  const fc = forecast(day, S.events, S.s);
  return { day, fc, hourly: bobaDemand(fc, day, S.events, S.s, S.shape) };
}

// ---------- render ----------
function render() {
  const { day, fc, hourly } = today();
  const now = nowMin();
  const st = clockState({ hourly, batches: S.batches, lows: S.lows, now, s: S.s });
  S.last = { st, fc, now, day };
  document.body.className = `clock mode-${st.mode}`;
  $("nowTime").textContent = hm(now);

  let big, sub = "";
  if (st.mode === "closed") {
    if (now < OPEN && st.next) { big = t("clock.opens", { time: hm(OPEN) }); sub = t("clock.opensSub", { time: hm(st.next.cookMin) }); }
    else { big = t("clock.closed"); sub = t("clock.closedSub"); }
  } else if (st.mode === "done") {
    big = t("clock.done");
    sub = t("clock.doneSub");
  } else {
    const size = t(`size.${st.next.frac}`);
    if (st.mode === "now") {
      big = t("clock.cookNow", { size });
      sub = t("clock.readyBy", { time: hm(now + st.k.lead) });
    } else {
      big = t("clock.cookAt", { size, time: hm(st.next.cookMin) });
      const d = st.next.cookMin - now;
      sub = d < 60 ? t("clock.inMin", { n: d }) : t("clock.inHours", { h: Math.floor(d / 60), m: String(d % 60).padStart(2, "0") });
    }
  }
  $("instr").textContent = big;
  $("sub").textContent = sub;
  $("whyBtn").classList.toggle("hidden", !st.next);

  const open = now >= OPEN && now < CLOSE;
  $("status").textContent = st.current && st.leftNow >= 0.5
    ? t("clock.current", { left: dur(st.freshUntil - now), n: Math.round(st.leftNow) })
    : open ? t("clock.noFresh") : "";
  drawStrip(st, now);

  const diff = Math.round(st.habitSoFar - st.cookedSoFar);
  $("foot").textContent = diff > 0 ? t("clock.fewer", { n: diff }) : diff < 0 ? t("clock.more", { n: -diff }) : t("clock.same");
  const wasted = S.waste.filter(w => w.item_type === "boba").reduce((a, w) => a + w.amount, 0);
  $("waste").textContent = t("clock.wasteToday", { n: Math.round(wasted) });
  $("offline").classList.toggle("hidden", S.online);

  const pendingLeft = st.needLeftover[0];
  if (pendingLeft && sheetsClosed()) showLeftover(pendingLeft, now);
  if (!pendingLeft && S.leftoverFor) hide("leftSheet");

  if (S.lastMode && S.lastMode !== st.mode && (st.mode === "soon" || st.mode === "now")) chime();
  S.lastMode = st.mode;
}

const pct = m => `${(((Math.min(Math.max(m, OPEN), CLOSE) - OPEN) / (CLOSE - OPEN)) * 100).toFixed(2)}%`;

function drawStrip(st, now) {
  const fresh = st.k.freshMin;
  const blocks = [
    ...S.batches.map(b => ({ a: b.readyMin, b: Math.min(b.readyMin + fresh, CLOSE), label: short(b.frac), plan: false })),
    ...st.plan.filter(p => p.readyMin > now).map(p => ({ a: p.readyMin, b: Math.min(p.readyMin + fresh, CLOSE), label: short(p.frac), plan: true }))
  ];
  const ticks = [10, 14, 18, 22].map(h => `<span class="tick" style="left:${pct(h * 60)}">${hm(h * 60).replace(":00", "")}</span>`).join("");
  $("strip").innerHTML = blocks.map(x =>
    `<span class="blk${x.plan ? " plan" : ""}" style="left:calc(${pct(x.a)} + 1px);width:calc(${pct(x.b)} - ${pct(x.a)} - 2px)">${x.label}</span>`).join("") +
    (now >= OPEN && now <= CLOSE ? `<span class="nowline" style="left:${pct(now)}"></span>` : "") + ticks;
}

// ---------- sheets ----------
const sheetsClosed = () => ["sizeSheet", "whySheet", "leftSheet"].every(id => $(id).classList.contains("hidden"));
function show(id) { $(id).classList.remove("hidden"); $(id).querySelector("button")?.focus(); }
function hide(id) { $(id).classList.add("hidden"); if (id === "leftSheet") S.leftoverFor = null; }

function openSizes() {
  if (!S.last) return;
  const st = S.last.st;
  const rec = st.next?.frac ?? 0.5;
  $("sizes").innerHTML = [0.25, 0.5, 0.75, 1].map(f =>
    `<button type="button" class="clk-size${f === rec ? " rec" : ""}" data-f="${f}">${short(f)}<small>${Math.round(f * st.k.batch)} drinks${f === rec ? ` · ${t("clock.recommended")}` : ""}</small></button>`).join("");
  $("sizes").querySelectorAll("button").forEach(b => b.addEventListener("click", async () => {
    hide("sizeSheet");
    const frac = Number(b.dataset.f);
    const r = await act({ action: "cooked", frac, recommended: rec, batchSize: st.k.batch });
    if (r.ok) {
      S.undoId = r.data.id;
      toast(t("clock.logged", { size: short(frac), time: hm(r.data.readyMin) }), true);
    }
    refresh();
  }));
  show("sizeSheet");
}

function showLeftover(batch, now) {
  S.leftoverFor = batch.id;
  const hours = Math.max(1, Math.round((now - batch.readyMin) / 60));
  $("leftTitle").textContent = t("clock.leftTitle", { size: short(batch.frac), time: hm(batch.readyMin), hours });
  $("levels").innerHTML = [[0, "left0"], [0.25, "left25"], [0.5, "left50"], [0.75, "left75"]].map(([lv, key]) =>
    `<button type="button" class="clk-size" data-lv="${lv}">${t(`clock.${key}`)}</button>`).join("");
  $("levels").querySelectorAll("button").forEach(b => b.addEventListener("click", async () => {
    const r = await act({ action: "leftover", batchId: batch.id, level: Number(b.dataset.lv) });
    if (r.ok) {
      hide("leftSheet");
      toast(t("clock.leftSaved"));
    }
    refresh();
  }));
  show("leftSheet");
}

function openWhy() {
  if (!S.last) return;
  const { st, fc, day } = S.last;
  const n = st.next;
  if (!n) return;
  const k = st.k;
  const row = (label, value, note = "") =>
    `<div class="row"><span>${label}${note ? `<br><small style="color:var(--muted)">${note}</small>` : ""}</span><span class="x flat">${value}</span></div>`;
  $("whyRows").innerHTML = [
    row(t("why.demand", { from: hm(n.readyMin), to: hm(n.to) }), `${n.raw.toFixed(1)}`,
      t("why.demandSrc", { tea: fc.tea, bt: S.s.bobaShareTea ?? 0.7, froyo: fc.froyo, bf: S.s.bobaShareFroyo ?? 0.05 })),
    row(t("why.margin", { pct: Math.round(k.margin * 100) }), `${n.need.toFixed(1)}`),
    row(t("why.size"), t("why.sizeVal", { size: short(n.frac), n: Math.round(n.servings), full: k.batch })),
    row(t("why.runout"), hm(n.readyMin)),
    row(t("why.cook", { lead: k.lead }), hm(n.cookMin))
  ].join("");
  $("whyFormula").textContent = t("why.formula", { raw: n.raw.toFixed(1), mult: (1 + k.margin).toFixed(2), need: n.need.toFixed(1), size: short(n.frac) });
  // Where the hour-by-hour numbers come from (relative busyness from BestTime, or our own curve)
  const dow = DOW[day.date.getDay()];
  const src = shapeSource(S.shape, dow, HOURS, new Date(), day.date);
  $("whyShape").textContent = `${t(`shape.${src.kind}`, { date: src.date })}${src.stale ? ` ${t("shape.stale")}` : ""} ${t(S.s.baseSet[dow] ? "shape.totalSet" : "shape.totalAssumed")}`;
  show("whySheet");
}

// ---------- feedback ----------
function toast(text, undo = false) {
  $("toastText").textContent = text;
  $("toastUndo").classList.toggle("hidden", !undo);
  $("toast").classList.remove("hidden");
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(() => { $("toast").classList.add("hidden"); S.undoId = null; }, undo ? 10000 : 4000);
}

let audio = null;
const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } };
function chime() {
  if (!soundOn()) return;
  try {
    audio = audio || new AudioContext();
    [0, 0.25].forEach((delay, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = i ? 880 : 660;
      g.gain.setValueAtTime(0.0001, audio.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + 0.22);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + delay);
      o.stop(audio.currentTime + delay + 0.25);
    });
  } catch {
    // no audio available
  }
}

async function keepAwake() {
  try { await navigator.wakeLock?.request("screen"); } catch { /* not supported or denied */ }
}

// ---------- start ----------
async function start() {
  applyStatic();
  langToggle($("lang"), render);
  $("sound").setAttribute("aria-pressed", String(soundOn()));
  $("sound").addEventListener("click", () => {
    const on = !soundOn();
    try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* ignore */ }
    $("sound").setAttribute("aria-pressed", String(on));
    if (on) chime();
  });
  document.addEventListener("pointerdown", () => { try { audio = audio || new AudioContext(); audio.resume(); } catch { /* ignore */ } }, { once: true });

  $("cooked").addEventListener("click", openSizes);
  $("low").addEventListener("click", async () => {
    const r = await act({ action: "low" });
    if (r.ok) toast(t("clock.lowLogged"));
    refresh();
  });
  $("whyBtn").addEventListener("click", openWhy);
  $("whyClose").addEventListener("click", () => hide("whySheet"));
  $("sizeCancel").addEventListener("click", () => hide("sizeSheet"));
  ["sizeSheet", "whySheet"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Escape") hide(id); }));
  $("toastClose").addEventListener("click", () => { clearTimeout(S.toastTimer); $("toast").classList.add("hidden"); S.undoId = null; });
  $("toastUndo").addEventListener("click", async () => {
    if (!S.undoId) return;
    await act({ action: "undo", batchId: S.undoId });
    S.undoId = null;
    toast(t("clock.undone"));
    refresh();
  });

  if (demo) {
    window.addEventListener("message", e => {
      if (e.origin !== location.origin || e.data?.type !== "frocast-time") return;
      S.simMin = Number(e.data.min);
      if (e.data.day && e.data.day !== S.simDay) {
        S.simDay = e.data.day;
        S.events = withFixed(demoDay(S.simDay)?.events || []);
        S.lastMode = null; // no chime just for switching days
      }
      refresh();
    });
  }

  await Promise.all([loadShared(), loadWeather(), loadHourShape()]);
  await refresh();
  keepAwake();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { keepAwake(); refresh(); } });
  setInterval(refresh, 15000);
  setInterval(render, 10000);
  setInterval(() => { loadShared(); loadWeather(); loadHourShape(); }, 30 * 60 * 1000);
}

start();

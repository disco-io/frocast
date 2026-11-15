// How many people to schedule at each time, for each day (npm run staffing).
//   npm run staffing                         next 7 days from today (shop time)
//   npm run staffing -- --days 3             fewer or more days (1–14, the weather forecast's range)
//   npm run staffing -- --from 2026-11-20    start on another day (within the next 2 weeks)
//   npm run staffing -- --short              shift blocks only, no hour-by-hour table
//   npm run staffing -- --json               machine-readable (for the prep text or a schedule sheet)
// Uses the shop's saved settings and events from the shared database (the dashboard's data),
// live weather (sample weather offline), and the cached hourly shape. It never syncs calendars or calls AI.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { forecast, iso, DOW, MON } from "../js/model.js";
import { LOCATION, TYPES, settings, withFixed } from "../js/config.js";
import { getWeather } from "../js/weather.js";
import { staffPlan, span, clock, BUSY } from "../js/staffing.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// .env (TURSO_* for the shared database) without overriding what's already set, like server.js
function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env: local.db */ }
}

function args(argv) {
  const o = { days: 7, from: null, short: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--days") o.days = Math.min(14, Math.max(1, Number(argv[++i]) || 7));
    else if (a === "--from") o.from = argv[++i];
    else if (a === "--short") o.short = true;
    else if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new Error(`Unknown option ${a} (try --help)`);
  }
  if (o.from && !/^\d{4}-\d{2}-\d{2}$/.test(o.from)) throw new Error("--from takes a date like 2026-11-20");
  return o;
}

// The dashboard's saved settings and events; defaults if the database can't be read
async function savedState() {
  try {
    const { ready, LOCATION: SHOP } = await import("../api/_lib/db.js");
    const db = await ready();
    const r = await db.execute({ sql: "SELECT key, value_json FROM app_state WHERE location_id = ? AND key IN ('s', 'events')", args: [SHOP] });
    const out = {};
    for (const row of r.rows) {
      try { out[row.key] = JSON.parse(row.value_json); } catch { /* skip a bad row */ }
    }
    return { ...out, from: process.env.TURSO_DATABASE_URL ? "shared database (Turso)" : "local.db" };
  } catch (err) {
    return { from: `defaults (couldn't read the database: ${err.message})` };
  }
}

// Cached BestTime shape, or the baseline curve. Reads our cache only, never BestTime.
async function cachedShape() {
  try {
    const { shape } = await import("../api/shape.js");
    return shape();
  } catch {
    return { source: "baseline", reason: "no-cache" };
  }
}

const people = n => `${n} ${n === 1 ? "person" : "people"}`;
const dateLabel = d => `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
const bar = n => "█".repeat(n);

function dayText(d, fc, plan, s, short) {
  const L = [];
  const wx = `${Math.round(d.temp)}°F${d.rain ? ", rain or snow" : ""}`;
  L.push(`${dateLabel(d.date)} · ${wx} · ${fc.customers} customers (${fc.froyo} froyo, ${fc.tea} tea)`);
  const evs = fc.factors.filter(f => /^[^\w\s]/u.test(f.label) && !/^(🌡|🎓|☔|📝)/u.test(f.label)).map(f => f.label);
  if (evs.length) L.push(`  Events: ${evs.join("; ")}`);
  for (const b of plan.blocks) {
    const note = b.what === "prep" ? "  prep: cut fruit, start the first boba"
      : b.what === "close" ? "  close-out: clean machines, count the drawer, closing log" : "";
    L.push(`  ${span(b.from, b.to).padEnd(18)} ${people(b.staff).padEnd(9)}${note}`);
  }
  L.push(`  Peak: ${people(plan.peak.staff)} at ${clock(plan.peak.h * 60)} · ${Math.round(plan.staffHours * 10) / 10} staff-hours`);
  if (plan.onCall.length) {
    L.push(`  If ${Math.round((s.cushion ?? 0.2) * 100)}% busier: ${plan.onCall.map(b => `+${b.staff} ${span(b.from, b.to)}`).join(", ")}`);
  }
  if (!short) {
    L.push("");
    L.push("  hour       froyo   tea  boba starts  work min  people");
    for (const x of plan.hours) {
      L.push(`  ${clock(x.h * 60).padEnd(8)} ${x.froyo.toFixed(0).padStart(7)} ${x.tea.toFixed(0).padStart(5)} ${(x.cooks ? String(x.cooks) : "·").padStart(12)} ${String(x.workMin).padStart(9)}  ${String(x.staff).padStart(6)} ${bar(x.staff)}`);
    }
  }
  return L.join("\n");
}

export async function main(argv = process.argv.slice(2), log = console.log) {
  const o = args(argv);
  if (o.help) {
    log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).map(l => l.slice(3)).join("\n"));
    return;
  }
  loadEnv();
  const { shopNow } = await import("../api/_lib/shop-time.js");
  const fromKey = o.from || shopNow().day;
  const [y, m, dd] = fromKey.split("-").map(Number);
  const start = new Date(y, m - 1, dd);

  const st = await savedState();
  const s = settings(st.s);
  const events = withFixed((st.events || []).filter(e => e?.from && e?.label && TYPES[e.type]));
  const [wx, shape] = await Promise.all([getWeather(start, LOCATION), cachedShape()]);
  const days = wx.days.filter(d => d.key >= fromKey).slice(0, o.days);
  if (!days.length) throw new Error(`No weather forecast for ${fromKey}: pick a day in the next 2 weeks`);

  const out = days.map(d => {
    const fc = forecast(d, events, s);
    return { d, fc, plan: staffPlan(fc, d, events, s, shape) };
  });

  if (o.json) {
    log(JSON.stringify({
      assumptions: { teaPerHour: s.teaPerHour, froyoPerHour: s.froyoPerHour, cookWorkMin: s.cookWorkMin, minStaff: s.minStaff, closeStaff: s.closeStaff, busy: BUSY },
      sources: { settings: st.from, weather: wx.live ? "Open-Meteo" : "sample (offline)", shape: shape.source },
      days: out.map(({ d, fc, plan }) => ({
        day: d.key, temp: d.temp, rain: d.rain, customers: fc.customers, froyo: fc.froyo, tea: fc.tea,
        blocks: plan.blocks.map(b => ({ from: clock(b.from), to: clock(b.to), staff: b.staff, what: b.what })),
        hours: plan.hours.map(x => ({ hour: clock(x.h * 60), froyo: +x.froyo.toFixed(1), tea: +x.tea.toFixed(1), cooks: x.cooks, workMin: x.workMin, staff: x.staff, ifBusier: x.busyStaff })),
        peak: { at: clock(plan.peak.h * 60), staff: plan.peak.staff },
        staffHours: Math.round(plan.staffHours * 10) / 10
      }))
    }, null, 2));
    return;
  }

  log(`FroCast staffing · ${days.length} day${days.length > 1 ? "s" : ""} from ${dateLabel(start)}`);
  log(`Data: settings and events from ${st.from} · weather ${wx.live ? "Open-Meteo" : "sample (offline)"} · hourly shape ${shape.source === "besttime" ? "BestTime cache" : "baseline curve"}`);
  const assumed = ["teaPerHour", "froyoPerHour", "cookWorkMin", "minStaff", "closeStaff"].some(k => st.s?.[k] == null);
  log(`Rates: ${s.teaPerHour} tea drinks or ${s.froyoPerHour} froyo customers per person-hour, ${s.cookWorkMin} min to start a boba batch, ` +
    `people kept ≤${Math.round(BUSY * 100)}% busy, at least ${people(s.minStaff)} while open${assumed ? " (assumed: set them in Settings)" : ""}`);
  for (const { d, fc, plan } of out) log(`\n${dayText(d, fc, plan, s, o.short)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(() => process.exit(0)).catch(err => { console.error(err.message); process.exit(1); });
}

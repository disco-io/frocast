// photon-agent.js: FroCast's iMessage agent (Photon). Answers "prep", "events" and "help".
// server.js starts it automatically when the PHOTON_* values are in .env, so one `npm start`
// runs the website and the agent together. It can also run alone: `npm run agent`.
// Don't run both at once (the agent would answer twice; Photon drops the duplicate reply, but it's wasteful).
import { pathToFileURL } from "node:url";
import { forecast, bobaPlan, fruitPlan, machines, iso } from "./js/model.js";
import { DEFAULTS, DEFAULT_SOURCES, LOCATION, TYPES, WHEN, withFixed } from "./js/config.js";
import { getWeather } from "./js/weather.js";
import { read } from "./api/_lib.js";
import { ready, LOCATION as SHOP_ID } from "./api/_lib/db.js";
import { Photon } from "@photon-ai/api";

const SIZE = { 0.25: "¼", 0.5: "½", 0.75: "¾", 1: "full" };
const MAX_EVENTS = 8;   // a text message, not a spreadsheet
const REFRESH_MS = 30 * 60 * 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getStartTime(h, leadMinutes) {
  // Convert decimal hour (e.g., 14.5) into total minutes from midnight
  const totalMinutes = Math.round(h * 60) - leadMinutes;

  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

// ---------------- Data: the same events and settings the dashboard shows ----------------
// Saved app data (settings, staff-added and synced events) from the shared database.
async function sharedState() {
  try {
    const db = await ready();
    const r = await db.execute({ sql: "SELECT key, value_json FROM app_state WHERE location_id = ?", args: [SHOP_ID] });
    const out = {};
    for (const row of r.rows) {
      try { out[row.key] = JSON.parse(row.value_json); } catch { /* skip a bad row */ }
    }
    return out;
  } catch {
    return {};
  }
}

// The calendar sources, read here too, so the agent has events even if nobody opened the dashboard.
const fromSources = { at: 0, events: [] };

export async function refreshSources(log = console) {
  const today = iso(new Date());
  const results = await Promise.allSettled(DEFAULT_SOURCES.map(src => read(src, today)));
  const events = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") r.value.events.forEach(e => events.push({ ...e, source: DEFAULT_SOURCES[i].name, url: DEFAULT_SOURCES[i].url }));
    else log.error?.(`photon agent: couldn't read ${DEFAULT_SOURCES[i].name}: ${r.reason?.message || r.reason}`);
  });
  if (events.length) {
    fromSources.events = events;
    fromSources.at = Date.now();
  }
  return events.length;
}

const evKey = e => `${e.from}|${String(e.label).toLowerCase().replace(/[^a-z0-9]/g, "")}`;

// { s: settings, events }: saved data first, then the sources, with the fixed events (HackPrinceton) always in
export async function getContext() {
  const st = await sharedState();
  const s = { ...structuredClone(DEFAULTS), ...(st.s || {}), base: { ...DEFAULTS.base, ...(st.s?.base || {}) } };
  const seen = new Set();
  const events = [];
  for (const e of [...(st.events || []), ...fromSources.events]) {
    if (!e?.from || !e?.label || !TYPES[e.type] || seen.has(evKey(e))) continue;
    seen.add(evKey(e));
    events.push(e);
  }
  return { s, events: withFixed(events) };
}

// ---------------- Replies ----------------
export function getEventsText(ctx, now = new Date()) {
  const twoWeeksOut = new Date(now);
  twoWeeksOut.setDate(now.getDate() + 14);

  const todayKey = iso(now);
  const limitKey = iso(twoWeeksOut);

  // Filter for active or upcoming events within the next 14 days
  const upcoming = ctx.events.filter(
    e => e.to >= todayKey && e.from <= limitKey
  ).sort((a, b) => a.from.localeCompare(b.from));

  if (upcoming.length === 0) {
    return "📅 No campus or town events scheduled for the next 14 days.";
  }

  const lines = upcoming.slice(0, MAX_EVENTS).map(e => {
    const info = TYPES[e.type];
    const windowName = WHEN[e.when]?.name || e.when;
    const dateRange = e.from === e.to ? e.from : `${e.from} to ${e.to}`;
    const impact = Math.round((info.mult - 1) * 100);
    const impactLabel = impact >= 0 ? `+${impact}%` : `${impact}%`;

    return `${info.icon} *${e.label}*
   📆 ${dateRange} · ${windowName}
   📈 Traffic impact: ${impactLabel} (${info.name})`;
  });
  const more = upcoming.length - lines.length;

  return `📅 Upcoming Events & Reminders (Next 14 Days):\n\n${lines.join("\n\n")}${more > 0 ? `\n\n…and ${more} more. See the dashboard for the full list.` : ""}`;
}

export async function getPrepText(ctx, now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const dateString = tomorrow.toLocaleDateString("en-US", {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  const weatherResult = ctx.weather ?? await getWeather(now, LOCATION);
  const tomorrowWeather = weatherResult.days.find(d => d.key === iso(tomorrow)) || { temp: 70, rain: false, cond: "Clear" };

  const dayData = {
    date: tomorrow,
    key: iso(tomorrow),
    temp: tomorrowWeather.temp,
    rain: tomorrowWeather.rain
  };

  const fc = forecast(dayData, ctx.events, ctx.s);
  const boba = bobaPlan(fc, dayData, ctx.events, ctx.s);
  const fruit = fruitPlan(fc, ctx.s);
  const activeMachines = machines(fc.froyo);
  const lead = ctx.s.cookLead ?? 45;

  // Map out start times (accounting for the cook lead) and batch sizes
  const bobaScheduleText = boba.batches.length > 0
    ? boba.batches.map(b => `• Start at ${getStartTime(b.h, lead)} — Size: ${SIZE[b.size] ?? b.size} batch (${Math.round(b.drinks)} drinks)`).join("\n")
    : "• None needed";

  return `📋 Prep Plan: ${dateString}
🌡️ ${Math.round(tomorrowWeather.temp)}°F, ${tomorrowWeather.cond}

👥 Est. Customers: ${fc.customers}

🧋 Boba Prep Schedule (Cook Lead: ${lead}m):
${bobaScheduleText}

🍉 Fruit: Cut ${fruit.containers} container(s)
⚙️ Froyo Machines: Run ${activeMachines}`;
}

export function getHelpText() {
  return `🍦 *FroCast Staff Commands*

• *prep* — Tomorrow's customer forecast, live weather, boba cook start times, fruit containers, and froyo machines
• *events* (or *reminders*) — Upcoming campus & town events affecting customer traffic over the next 14 days
• *help* — Show this command menu`;
}

export async function handle(text, ctx) {
  const cleanText = text.trim().toLowerCase();

  if (cleanText.includes("prep")) {
    return await getPrepText(ctx ?? await getContext());
  }

  if (cleanText.includes("event") || cleanText.includes("reminder")) {
    return getEventsText(ctx ?? await getContext());
  }

  if (cleanText.includes("help") || cleanText === "?" || cleanText.includes("command")) {
    return getHelpText();
  }

  return `Didn't catch that! Here's what you can ask me:\n\n${getHelpText()}`;
}

// ---------------- The Photon connection ----------------
// Starts listening for texts from the allowed sender and returns { stop }.
// Throws right away if a PHOTON_* value is missing. After that, network errors are logged and retried,
// so a Photon outage never takes the website down.
export function startAgent({ log = console } = {}) {
  const env = (n) => { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; };
  const project = env("PHOTON_PROJECT_ID");
  const agent = env("PHOTON_AGENT_HANDLE");
  const senders = new Set(env("PHOTON_TEST_SENDER").split(",").map((s) => s.trim()));
  const photon = new Photon({ headers: { Authorization: `Bearer ${env("PHOTON_API_KEY")}` } });

  const startedAt = Date.now();
  const seen = new Set();
  let stopped = false;

  refreshSources(log).catch(() => {});
  const timer = setInterval(() => refreshSources(log).catch(() => {}), REFRESH_MS);
  timer.unref?.();

  async function reply(m, text) {
    await photon.projects.sendMessage({
      path: { id: project },
      headers: { "idempotency-key": `frocast-reply:${m.id}` },
      body: {
        spaceId: m.space.id, senderId: m.receivedBy.id, parentMessageId: m.id,
        content: { type: "text", format: "plain", text },
      },
    });
  }

  async function poll() {
    let pageToken;
    do {
      const page = await photon.projects.listMessages({
        path: { id: project },
        query: {
          createdSince: new Date(startedAt - 5000).toISOString(),
          direction: "received", order: "asc", pageSize: 100, platform: "imessage",
          ...(pageToken ? { pageToken } : {}),
        },
      });
      for (const m of page.items) {
        if (seen.has(m.id) || m.status !== "received") continue;
        if (Date.parse(m.createdAt) < startedAt) continue;
        if (m.sentBy?.kind !== "human" || !senders.has(m.sentBy.handle)) continue;
        if (m.receivedBy?.handle !== agent || m.content?.type !== "text") continue;
        seen.add(m.id);
        try { await reply(m, await handle(m.content.text)); }
        catch (e) { log.error("reply failed", e?.status ?? e); }
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  (async () => {
    let lastError = "";
    while (!stopped) {
      try {
        await poll();
        lastError = "";
      } catch (e) {
        const msg = String(e?.status ?? e?.message ?? e);
        if (msg !== lastError) log.error("photon agent: can't reach Photon, will keep retrying:", msg);   // log a new problem once
        lastError = msg;
        await sleep(10000);
      }
      await sleep(2000);
    }
  })();

  log.log("FroCast agent ready.");
  return { stop() { stopped = true; clearInterval(timer); } };
}

// `npm run agent` / `node --env-file=.env photon-agent.js`: run on its own
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startAgent();

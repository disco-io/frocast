// photon-agent.js
import { forecast, bobaPlan, fruitPlan, machines, iso } from "./js/model.js";
import { DEFAULTS, DEFAULT_EVENTS, LOCATION, TYPES, WHEN } from "./js/config.js";
import { getWeather } from "./js/weather.js";
import { Photon } from "@photon-ai/api";

const env = (n) => { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; };
const project = env("PHOTON_PROJECT_ID");
const agent = env("PHOTON_AGENT_HANDLE");
const senders = new Set(env("PHOTON_TEST_SENDER").split(",").map((s) => s.trim()));
const photon = new Photon({ headers: { Authorization: `Bearer ${env("PHOTON_API_KEY")}` } });

const startedAt = Date.now();
const seen = new Set();

function formatHour(h) {
  const hour24 = Math.floor(h);
  const minutes = Math.round((h - hour24) * 60);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minutes > 0
    ? `${hour12}:${String(minutes).padStart(2, "0")} ${period}`
    : `${hour12}:00 ${period}`;
}

function getStartTime(h, leadMinutes) {
  // Convert decimal hour (e.g., 14.5) into total minutes from midnight
  const totalMinutes = Math.round(h * 60) - leadMinutes;

  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function getEventsText() {
  const today = new Date();
  const twoWeeksOut = new Date();
  twoWeeksOut.setDate(today.getDate() + 14);

  const todayKey = iso(today);
  const limitKey = iso(twoWeeksOut);

  // Filter for active or upcoming events within the next 14 days
  const upcoming = DEFAULT_EVENTS.filter(
    e => e.to >= todayKey && e.from <= limitKey
  ).sort((a, b) => a.from.localeCompare(b.from));

  if (upcoming.length === 0) {
    return "📅 No campus or town events scheduled for the next 14 days.";
  }

  const lines = upcoming.map(e => {
    const info = TYPES[e.type];
    const windowName = WHEN[e.when]?.name || e.when;
    const dateRange = e.from === e.to ? e.from : `${e.from} to ${e.to}`;
    const impact = Math.round((info.mult - 1) * 100);
    const impactLabel = impact >= 0 ? `+${impact}%` : `${impact}%`;

    return `${info.icon} *${e.label}*
   📆 ${dateRange} · ${windowName}
   📈 Traffic impact: ${impactLabel} (${info.name})`;
  });

  return `📅 Upcoming Events & Reminders (Next 14 Days):\n\n${lines.join("\n\n")}`;
}

async function getPrepText() {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateString = tomorrow.toLocaleDateString("en-US", {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  const weatherResult = await getWeather(today, LOCATION);
  const tomorrowWeather = weatherResult.days.find(d => d.key === iso(tomorrow)) || { temp: 70, rain: false, cond: "Clear" };

  const dayData = {
    date: tomorrow,
    key: iso(tomorrow),
    temp: tomorrowWeather.temp,
    rain: tomorrowWeather.rain
  };

  const fc = forecast(dayData, DEFAULT_EVENTS, DEFAULTS);
  const boba = bobaPlan(fc, dayData, DEFAULT_EVENTS, DEFAULTS);
  const fruit = fruitPlan(fc, DEFAULTS);
  const activeMachines = machines(fc.froyo);

  // Map out start times (accounting for DEFAULTS.cookLead) and batch sizes
  const bobaScheduleText = boba.batches.length > 0
    ? boba.batches.map(b => `• Start at ${getStartTime(b.h, DEFAULTS.cookLead)} — Size: ${b.size} batch (${b.drinks} drinks)`).join("\n")
    : "• None needed";

  return `📋 Prep Plan: ${dateString}
🌡️ ${Math.round(tomorrowWeather.temp)}°F, ${tomorrowWeather.cond}

👥 Est. Customers: ${fc.customers}

🧋 Boba Prep Schedule (Cook Lead: ${DEFAULTS.cookLead}m):
${bobaScheduleText}

🍉 Fruit: Cut ${fruit.containers} container(s)
⚙️ Froyo Machines: Run ${activeMachines}`;
}

function getHelpText() {
  return `🍦 *FroCast Staff Commands*

• *prep* — Tomorrow's customer forecast, live weather, boba cook start times, fruit containers, and froyo machines
• *events* (or *reminders*) — Upcoming campus & town events affecting customer traffic over the next 14 days
• *help* — Show this command menu`;
}

async function handle(text) {
  const cleanText = text.trim().toLowerCase();

  if (cleanText.includes("prep")) {
    return await getPrepText();
  }

  if (cleanText.includes("event") || cleanText.includes("reminder")) {
    return getEventsText();
  }

  if (cleanText.includes("help") || cleanText === "?" || cleanText.includes("command")) {
    return getHelpText();
  }

  return `Didn't catch that! Here's what you can ask me:\n\n${getHelpText()}`;
}

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

console.log("FroCast agent ready.");
while (true) {
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
      catch (e) { console.error("reply failed", e?.status ?? e); }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  await new Promise((r) => setTimeout(r, 2000));
}

// The Photon texting agent: reply texts, real saved data, safe start. No network, no real Photon account.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";

const dbFile = path.join(tmpdir(), `frocast-photon-${process.pid}-${Date.now()}.db`);
process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
for (const k of ["PHOTON_PROJECT_ID", "PHOTON_API_KEY", "PHOTON_AGENT_HANDLE", "PHOTON_TEST_SENDER"]) delete process.env[k];

// Importing must not start anything (no loop, no env needed)
const agent = await import("../photon-agent.js");
const { ready, LOCATION } = await import("../api/_lib/db.js");
after(() => { for (const s of ["", "-wal", "-shm", "-journal"]) rmSync(dbFile + s, { force: true }); });

const NOW = new Date(2026, 10, 14);   // Sat Nov 14, 2026
const ev = (label, type, from, to = from, when = "afternoon") => ({ from, to, label, type, when, source: "t" });
const weather = { days: [{ key: "2026-11-15", temp: 46, rain: false, cond: "Cloudy" }] };

test("help lists the three commands; unknown text gets the menu; matching ignores case", async () => {
  const help = agent.getHelpText();
  for (const w of ["prep", "events", "help"]) assert.ok(help.includes(`*${w}*`) || help.includes(w));
  assert.match(await agent.handle("hello?", { s: {}, events: [] }), /Didn't catch that/);
  assert.match(await agent.handle("  HELP  "), /FroCast Staff Commands/);
});

test("events text: only the next 14 days, soonest first, capped for a text message", async () => {
  const many = Array.from({ length: 12 }, (_, i) => ev(`Game ${i + 1}`, "athletics", `2026-11-${String(15 + (i % 8)).padStart(2, "0")}`));
  const far = ev("Far away event", "town", "2027-02-01");
  const text = agent.getEventsText({ events: [far, ...many, ev("HackPrinceton", "competition", "2026-11-13", "2026-11-15", "late")] }, NOW);
  assert.match(text, /HackPrinceton/);
  assert.ok(!text.includes("Far away event"));
  assert.equal((text.match(/Traffic impact/g) || []).length, 8);
  assert.match(text, /and 5 more/);
  assert.match(agent.getEventsText({ events: [far] }, NOW), /No campus or town events/);
});

test("prep text: tomorrow's customers, start times with the cook lead, readable batch sizes", async () => {
  const { forecast } = await import("../js/model.js");
  const { DEFAULTS } = await import("../js/config.js");
  const ctx = { s: { ...DEFAULTS, cookLead: 45 }, events: [ev("Penn game", "athletics", "2026-11-15")], weather };
  const text = await agent.getPrepText(ctx, NOW);
  const fc = forecast({ date: new Date(2026, 10, 15), key: "2026-11-15", temp: 46, rain: false }, ctx.events, ctx.s);
  assert.match(text, /Prep Plan: Sun, Nov 15/);
  assert.match(text, new RegExp(`Est\\. Customers: ${fc.customers}\\b`));
  assert.match(text, /Cook Lead: 45m/);
  assert.match(text, /Start at \d{1,2}:\d{2} (AM|PM) — Size: (¼|½|¾|full) batch/);
  assert.ok(!/0\.\d+ batch/.test(text), "no decimal batch sizes");
  // a longer cook lead moves every start time earlier
  const early = await agent.getPrepText({ ...ctx, s: { ...ctx.s, cookLead: 90 } }, NOW);
  assert.match(early, /Cook Lead: 90m/);
  assert.notEqual(early, text);
});

test("the agent reads the same saved settings and events as the dashboard, and always has HackPrinceton", async () => {
  const none = await agent.getContext();
  assert.ok(none.events.some(e => e.label === "HackPrinceton" && e.fixed));
  const db = await ready();
  const put = (key, value) => db.execute({ sql: "INSERT INTO app_state (location_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)", args: [LOCATION, key, JSON.stringify(value), new Date().toISOString()] });
  await put("s", { cookLead: 30, drinksPerBatch: 24 });
  await put("events", [ev("Staff added: Tree lighting", "town", "2026-11-27"), ev("HackPrinceton", "competition", "2026-11-13", "2026-11-15", "late")]);
  const ctx = await agent.getContext();
  assert.equal(ctx.s.cookLead, 30);
  assert.equal(ctx.s.drinksPerBatch, 24);
  assert.ok(ctx.s.base.Sat > 0, "defaults fill anything not saved");
  assert.ok(ctx.events.some(e => e.label === "Staff added: Tree lighting"));
  assert.equal(ctx.events.filter(e => e.label === "HackPrinceton").length, 1, "a saved copy of a fixed event isn't doubled");
});

test("starting without Photon values fails right away with a clear message", () => {
  assert.throws(() => agent.startAgent({ log: { log() {}, error() {} } }), /Missing PHOTON_PROJECT_ID/);
});

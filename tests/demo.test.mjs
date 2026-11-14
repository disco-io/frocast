// Demo mode: seeding/reset touch only demo rows, the slider replays deterministically,
// the sample photo returns labeled canned estimates.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { demoHistory, DEMO_DAYS, DEMO_BINS } from "../js/demo-data.js";

const dbFile = path.join(tmpdir(), `frocast-demo-${process.pid}-${Date.now()}.db`);
process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
process.env.TOPPING_CAMERA = "1";
delete process.env.REQUIRE_PAIRING; // local mode: no PIN screen
delete process.env.VERCEL;

const { createServer } = await import("../server.js");
const { ready } = await import("../api/_lib/db.js");
let server, base;
before(async () => {
  server = createServer();
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  for (const s of ["", "-wal", "-shm", "-journal"]) rmSync(dbFile + s, { force: true });
});
const post = (route, body) => fetch(`${base}/api/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, data: await r.json() }));
const get = (route, q) => fetch(`${base}/api/${route}?${new URLSearchParams(q)}`).then(r => r.json());
const NOV = DEMO_DAYS.nov.key;

test("history is two weeks before the demo day, deterministic", () => {
  const h = demoHistory(NOV);
  assert.equal(h.length, 14);
  assert.equal(h[0].day, "2026-10-31");
  assert.equal(h[13].day, "2026-11-13");
  assert.deepEqual(demoHistory(NOV), h);
});

test("reset seeds demo bins and history, and never touches live rows", async () => {
  await post("toppings", { action: "saveBin", bin: { name: "Real strawberries", row: 1, col: 1 } });
  await post("boba", { action: "cooked", frac: 0.5 });
  const r = await post("demo", { action: "reset" });
  assert.equal(r.data.bins, DEMO_BINS.length);
  assert.equal(r.data.levels, 2 * 14 * 2 * DEMO_BINS.length);
  assert.equal((await get("demo", {})).seeded, true);
  const live = await get("toppings", {});
  assert.deepEqual(live.bins.map(b => b.name), ["Real strawberries"], "demo bins stay out of the live list");
  assert.equal((await get("boba", { scenario: "live" })).batches.length, 1, "live batch kept");
  const demoDayBefore = await get("toppings", { scenario: "demo", day: "2026-11-13" });
  assert.equal(demoDayBefore.bins.length, DEMO_BINS.length);
  assert.ok(demoDayBefore.checks.close, "simulated close check exists");
  assert.equal(demoDayBefore.checks.close.confirmedBy, "Demo history (simulated)");
  assert.ok(demoDayBefore.waste.length > 0);
  const db = await ready();
  const n = async tbl => Number((await db.execute(`SELECT COUNT(*) AS n FROM ${tbl} WHERE scenario = 'demo'`)).rows[0].n);
  const before = await n("topping_checks");
  await post("demo", { action: "reset" });
  assert.equal(await n("topping_checks"), before, "reset replaces, doesn't pile up");
});

test("the slider replays: later taps are hidden when you drag back, shown again going forward", async () => {
  await post("boba", { scenario: "demo", day: NOV, min: 600, action: "cooked", frac: 0.5 });
  const later = await post("boba", { scenario: "demo", day: NOV, min: 840, action: "cooked", frac: 0.75, source: "demo-auto" });
  await post("boba", { scenario: "demo", day: NOV, min: 700, action: "low" });
  await post("boba", { scenario: "demo", day: NOV, min: 900, action: "leftover", batchId: later.data.id, level: 0.25, source: "demo-auto" });
  let at = await get("boba", { scenario: "demo", day: NOV, min: 650 });
  assert.equal(at.batches.length, 1);
  assert.deepEqual(at.lows, []);
  assert.equal(at.waste.length, 0);
  at = await get("boba", { scenario: "demo", day: NOV, min: 900 });
  assert.equal(at.batches.length, 2);
  assert.equal(at.batches[1].source, "demo-auto");
  assert.deepEqual(at.lows, [700]);
  assert.equal(at.waste[0].source, "demo-auto");
  const live = await post("boba", { action: "cooked", frac: 0.25, source: "demo-auto" });
  const liveDay = await get("boba", { scenario: "live" });
  assert.equal(liveDay.batches.find(b => b.id === live.data.id).source, "staff", "live taps can't claim to be auto");
});

test("sample photo: canned estimates, labeled simulated, never stored; Kiwi needs a look", async () => {
  const v = await post("vision", { scenario: "demo", day: NOV, kind: "close", sample: true });
  assert.equal(v.data.available, true);
  assert.equal(v.data.model, "sample (simulated)");
  assert.equal(v.data.photoId, null);
  const seeded = await get("toppings", { scenario: "demo", day: NOV });
  const kiwi = seeded.bins.find(b => b.name === "Kiwi");
  assert.equal(v.data.bins.find(b => b.id === kiwi.id).confidence, "low");
  assert.equal((await post("vision", { kind: "close", sample: true })).status, 400, "live mode needs a real photo");
});

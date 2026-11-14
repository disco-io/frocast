// Topping bar check: flag, owner-only setup, usage math, missed refills, waste log,
// vision prefill (stubbed), person-in-frame photos never stored, photo retention.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { rmSync, writeFileSync } from "node:fs";
import { usage, prefill, outcome, discards } from "../js/toppings-math.js";

const dir = tmpdir(), tag = `${process.pid}-${Date.now()}`;
const dbFile = path.join(dir, `frocast-top-${tag}.db`);
const stub = path.join(dir, `frocast-stub-${tag}.json`);
process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
process.env.OWNER_PIN = "2468";
process.env.DEVICE_SECRET = "test-secret";
process.env.TOPPING_CAMERA = "1";
process.env.CRON_SECRET = "cron-test";
delete process.env.VERCEL;
delete process.env.ANTHROPIC_API_KEY;

const { createServer } = await import("../server.js");
const { ready } = await import("../api/_lib/db.js");
const { purgeOld } = await import("../api/_lib/photos.js");
let server, base, owner, staff;
const D = { scenario: "demo", day: "2026-11-14" };
const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

before(async () => {
  server = createServer();
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/api/auth`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pair", pin: "2468", name: "Counter tablet" }) });
  owner = r.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  staff = owner.split("; ").filter(c => c.startsWith("fc_device=")).join("; ");
});
after(() => {
  server.close();
  for (const s of ["", "-wal", "-shm", "-journal"]) rmSync(dbFile + s, { force: true });
  rmSync(stub, { force: true });
});

const post = (body, cookie = owner, route = "toppings") => fetch(`${base}/api/${route}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));
const day = () => fetch(`${base}/api/toppings?${new URLSearchParams(D)}`, { headers: { cookie: owner } }).then(r => r.json());
const ids = {};

test("usage math: open + refills - close, negative is reported not clamped", () => {
  assert.equal(usage({ open: 0.5, close: 0.25, refills: [{ amount: 1 }] }).used, 1.25);
  const neg = usage({ open: 0.25, close: 0.75, refills: [] });
  assert.equal(neg.used, -0.5);
  assert.equal(neg.negative, true);
  assert.equal(usage({ open: null, close: 0.5 }).used, null);
  assert.equal(prefill({ level: 0.5, confidence: "low", visible: true }), null, "low confidence stays blank");
  assert.equal(prefill({ level: 0.5, confidence: "high", visible: false }), null, "not visible stays blank");
  assert.equal(outcome({ level: 0.5, confidence: "high", visible: true }, 0.5), "accepted");
  assert.equal(outcome({ level: 0.5, confidence: "high", visible: true }, 0.75), "corrected");
  assert.equal(outcome({ level: 0.5, confidence: "low", visible: true }, 0.75), "filled");
  assert.equal(outcome(null, 0.75), "manual");
  assert.equal(discards({ discard_at_close: null }), true, "unset counts as discarded (assumed)");
});

test("feature flag off hides everything without errors", async () => {
  process.env.TOPPING_CAMERA = "0";
  assert.deepEqual(await (await fetch(`${base}/api/toppings?flags=1`, { headers: { cookie: owner } })).json(), { enabled: false });
  assert.equal((await fetch(`${base}/api/toppings`, { headers: { cookie: owner } })).status, 404);
  assert.equal((await post({ kind: "open", image: IMG }, owner, "vision")).status, 404);
  process.env.TOPPING_CAMERA = "1";
  assert.deepEqual(await (await fetch(`${base}/api/toppings?flags=1`, { headers: { cookie: owner } })).json(), { enabled: true });
});

test("only the owner can set up bins", async () => {
  assert.equal((await post({ action: "saveBin", bin: { name: "Kiwi", row: 1, col: 1 } }, staff)).status, 403);
  for (const [name, row, col, discard] of [["Strawberries", 1, 1, true], ["Mochi", 1, 2, false], ["Mango", 2, 1, null]]) {
    const r = await post({ action: "saveBin", bin: { name, row, col, discard, panLabel: name === "Mochi" ? "1/6 pan" : null, panCost: name === "Strawberries" ? 12 : null } });
    assert.equal(r.status, 200);
    ids[name] = r.data.id;
  }
  const d = await day();
  assert.deepEqual(d.bins.map(b => b.name), ["Strawberries", "Mochi", "Mango"]);
  assert.equal(d.bins.find(b => b.name === "Mango").discard_at_close, null);
});

test("open + refill + close: usage, missed-refill prompt, waste for discarded bins only", async () => {
  const lv = obj => Object.entries(obj).map(([n, level]) => ({ binId: ids[n], level }));
  assert.equal((await post({ ...D, action: "confirm", kind: "open", levels: lv({ Strawberries: 1, Mochi: 0.5 }) })).status, 400, "every bin needs a level");
  assert.equal((await post({ ...D, action: "confirm", kind: "open", levels: lv({ Strawberries: 1, Mochi: 0.5, Mango: 0.75 }) }, staff)).status, 200);
  assert.equal((await post({ ...D, min: 800, action: "refill", binId: ids.Strawberries, amount: 1 }, staff)).status, 200);
  assert.equal((await post({ ...D, action: "refill", binId: ids.Mango, amount: 0.3 })).status, 400);
  const close = await post({ ...D, action: "confirm", kind: "close", levels: lv({ Strawberries: 0.25, Mochi: 0.25, Mango: 1 }) }, staff);
  assert.equal(close.status, 200);
  const u = Object.fromEntries(close.data.usage.map(x => [x.binId, x.used]));
  assert.equal(u[ids.Strawberries], 1.75);
  assert.equal(u[ids.Mochi], 0.25);
  assert.equal(u[ids.Mango], -0.25);
  assert.deepEqual(close.data.negatives, [ids.Mango]);
  let d = await day();
  const waste = Object.fromEntries(d.waste.map(w => [w.item_key, w]));
  assert.equal(waste[ids.Strawberries].amount, 0.25);
  assert.equal(waste[ids.Strawberries].unit, "pans");
  assert.equal(waste[ids.Mango].amount, 1, "unset counts as discarded");
  assert.equal(waste[ids.Mochi], undefined, "carry-over bins are not waste");
  await post({ ...D, min: 1370, action: "refill", binId: ids.Mango, amount: 0.5, source: "missed" }, staff);
  d = await day();
  assert.equal(d.usage.find(x => x.binId === ids.Mango).used, 0.25);
  assert.equal(d.refills.find(r => r.binId === ids.Mango).source, "missed");
  assert.equal(d.checks.close.confirmedBy, "Counter tablet");
  // confirming again replaces the check and its waste rows (no duplicates)
  await post({ ...D, action: "confirm", kind: "close", levels: lv({ Strawberries: 0, Mochi: 0.25, Mango: 1 }) }, staff);
  d = await day();
  assert.equal(d.waste.length, 1);
});

test("vision prefill (stubbed): unknown bins need a look, outcomes recorded, photo stored behind pairing", async () => {
  writeFileSync(stub, JSON.stringify({ photo_usable: true, problems: [], bins: [
    { id: ids.Strawberries, level: 0.25, confidence: "high", visible: true },
    { id: ids.Mochi, level: 0.5, confidence: "low", visible: true },
    { id: "not-a-bin", level: 1, confidence: "high", visible: true }
  ] }));
  process.env.VISION_STUB = stub;
  const v = await post({ ...D, kind: "open", image: IMG }, staff, "vision");
  assert.equal(v.data.available, true);
  assert.ok(v.data.photoId);
  const byId = Object.fromEntries(v.data.bins.map(b => [b.id, b]));
  assert.equal(byId[ids.Mango].visible, false, "missing from the answer -> needs a look");
  assert.equal(byId["not-a-bin"], undefined);
  const levels = [
    { binId: ids.Strawberries, level: 0.25, estimate: byId[ids.Strawberries] },
    { binId: ids.Mochi, level: 0.75, estimate: byId[ids.Mochi] },
    { binId: ids.Mango, level: 0.5, estimate: byId[ids.Mango] }
  ];
  await post({ ...D, action: "confirm", kind: "open", levels, estimator: "vision", photoId: v.data.photoId, model: v.data.model, photoUsable: true }, staff);
  const d = await day();
  const out = d.checks.open.levels;
  assert.equal(out[ids.Strawberries].outcome, "accepted");
  assert.equal(out[ids.Mochi].outcome, "filled");
  assert.equal(out[ids.Mango].outcome, "filled");
  assert.equal(d.checks.open.photoId, v.data.photoId);
  const img = await fetch(`${base}/api/toppings?photo=${v.data.photoId}`, { headers: { cookie: staff } });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/jpeg");
  assert.equal((await fetch(`${base}/api/toppings?photo=${v.data.photoId}`)).status, 401, "photos only for paired devices");
});

test("a photo with a person in it is never stored; vision off falls back", async () => {
  const db = await ready();
  const count = async () => Number((await db.execute("SELECT COUNT(*) AS n FROM photos")).rows[0].n);
  const before = await count();
  writeFileSync(stub, JSON.stringify({ photo_usable: true, problems: ["person_in_frame"], bins: [] }));
  const v = await post({ ...D, kind: "close", image: IMG }, staff, "vision");
  assert.equal(v.data.photo_usable, false);
  assert.equal(v.data.photoId, null);
  assert.equal(await count(), before);
  delete process.env.VISION_STUB;
  const off = await post({ ...D, kind: "close", image: IMG }, staff, "vision");
  assert.deepEqual([off.status, off.data.available, off.data.reason], [200, false, "no_key"]);
});

test("photos older than the retention setting are deleted; numbers stay", async () => {
  const db = await ready();
  await fetch(`${base}/api/data`, { method: "PUT", headers: { "content-type": "application/json", cookie: owner }, body: JSON.stringify({ state: { s: { photoDays: 3 } } }) });
  await db.execute({ sql: "INSERT INTO photos (id, location_id, scenario, day, kind, mime, data, bytes, created_at) VALUES ('old', 'nassau-st', 'live', '2026-11-01', 'open', 'image/jpeg', x'00', 1, ?)", args: [new Date(Date.now() - 5 * 86400e3).toISOString()] });
  const r = await purgeOld(db);
  assert.equal(r.days, 3);
  assert.ok(r.deleted >= 1);
  assert.equal((await db.execute("SELECT COUNT(*) AS n FROM photos WHERE id = 'old'")).rows[0].n, 0);
  assert.ok((await day()).checks.open.levels[ids.Strawberries], "confirmed numbers kept");
  assert.equal((await fetch(`${base}/api/cron`)).status, 401);
  assert.equal((await fetch(`${base}/api/cron`, { headers: { authorization: "Bearer cron-test" } })).status, 200);
});

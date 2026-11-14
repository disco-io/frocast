// Table demo (one cup of strawberries): its own data set beside live and demo, a close photo that
// is compared with the confirmed open photo, usage for the cup, and a reset that touches nothing else.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { rmSync, writeFileSync } from "node:fs";

const dir = tmpdir(), tag = `${process.pid}-${Date.now()}`;
const dbFile = path.join(dir, `frocast-bowls-${tag}.db`);
const stub = path.join(dir, `frocast-bowls-stub-${tag}.json`);
process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
process.env.DEVICE_SECRET = "test-secret";
process.env.TOPPING_CAMERA = "1";
delete process.env.REQUIRE_PAIRING;
delete process.env.VERCEL;
process.env.ANTHROPIC_API_KEY = ""; // empty, not deleted: server.js would otherwise load a real key from .env and make a billed call

const { createServer } = await import("../server.js");
const { ready } = await import("../api/_lib/db.js");
let server, base;
const B = { scenario: "bowls" };
const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

before(async () => {
  server = createServer();
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  for (const s of ["", "-wal", "-shm", "-journal"]) rmSync(dbFile + s, { force: true });
  rmSync(stub, { force: true });
  delete process.env.VISION_STUB;
});

const post = (body, route = "toppings") => fetch(`${base}/api/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));
const get = q => fetch(`${base}/api/toppings?${new URLSearchParams(q)}`).then(r => r.json());
const see = levels => {
  writeFileSync(stub, JSON.stringify({ photo_usable: true, problems: [], bins: Object.entries(levels).map(([id, level]) => ({ id, level, confidence: "high", visible: true })) }));
  process.env.VISION_STUB = stub;
};
const STRAW = "bowl-strawberries";

test("reset sets up the one cup and leaves live and demo bins alone", async () => {
  await post({ action: "saveBin", bin: { name: "Live mochi", row: 1, col: 1 } });
  await post({ action: "reset" }, "demo");
  const r = await post({ action: "reset", scenario: "bowls" }, "demo");
  assert.deepEqual([r.status, r.data.bins], [200, 1]);
  const d = await get(B);
  assert.deepEqual(d.bins.map(b => [b.id, b.name, b.pan_label]), [[STRAW, "Strawberries", "cup"]]);
  assert.equal((await get({ scenario: "live" })).bins.length, 1);
  assert.equal((await get({ scenario: "demo", day: "2026-11-14" })).bins.length, 6);
});

test("the second photo is compared with the confirmed first photo: full -> half", async () => {
  see({ [STRAW]: 1 });
  const first = await post({ ...B, kind: "open", image: IMG }, "vision");
  assert.equal(first.data.available, true);
  assert.equal(first.data.compared, false, "nothing to compare the first photo with");
  assert.ok(first.data.photoId);
  const levels = est => est.bins.map(b => ({ binId: b.id, level: b.level, estimate: b }));

  see({ [STRAW]: 0.5 });
  const early = await post({ ...B, kind: "close", image: IMG }, "vision");
  assert.equal(early.data.compared, false, "an unconfirmed first photo is not a yardstick");

  await post({ ...B, action: "confirm", kind: "open", levels: levels(first.data), estimator: "vision", photoId: first.data.photoId, model: first.data.model, photoUsable: true });
  const second = await post({ ...B, kind: "close", image: IMG }, "vision");
  assert.equal(second.data.compared, true);
  const done = await post({ ...B, action: "confirm", kind: "close", levels: levels(second.data), estimator: "vision", photoId: second.data.photoId, model: second.data.model, photoUsable: true });
  const used = Object.fromEntries(done.data.usage.map(u => [u.binId, u.used]));
  assert.deepEqual(used, { [STRAW]: 0.5 });

  const d = await get(B);
  assert.equal(d.checks.open.levels[STRAW].level, 1);
  assert.equal(d.checks.close.levels[STRAW].level, 0.5);
  assert.equal(d.checks.close.levels[STRAW].outcome, "accepted");
  assert.ok(d.checks.open.photoId && d.checks.close.photoId, "both photos kept for the before/after view");
  assert.equal((await get({ scenario: "live" })).checks.open, null, "live data untouched");
});

test("live close checks get the same comparison", async () => {
  const bin = (await get({ scenario: "live" })).bins[0].id;
  see({ [bin]: 0.75 });
  const open = await post({ kind: "open", image: IMG }, "vision");
  await post({ action: "confirm", kind: "open", levels: [{ binId: bin, level: 0.75, estimate: open.data.bins[0] }], estimator: "vision", photoId: open.data.photoId, photoUsable: true });
  assert.equal((await post({ kind: "close", image: IMG }, "vision")).data.compared, true);
  // a first check entered by hand has no photo to compare with
  await post({ action: "confirm", kind: "open", levels: [{ binId: bin, level: 0.75 }] });
  assert.equal((await post({ kind: "close", image: IMG }, "vision")).data.compared, false);
});

test("start over clears the cup's checks and photos only", async () => {
  const db = await ready();
  const photos = async s => Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM photos WHERE scenario = ?", args: [s] })).rows[0].n);
  assert.ok((await photos("bowls")) >= 2);
  const live = await photos("live");
  await post({ action: "reset", scenario: "bowls" }, "demo");
  const d = await get(B);
  assert.deepEqual([d.checks.open, d.checks.close, d.waste.length, d.bins.length], [null, null, 0, 1]);
  assert.equal(await photos("bowls"), 0);
  assert.equal(await photos("live"), live);
  assert.equal((await get({ scenario: "demo", day: "2026-11-14" })).bins.length, 6);
});

// Batch clock API: cooked / running low / leftover (waste log) / undo / demo isolation.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";

const dbFile = path.join(tmpdir(), `frocast-boba-${process.pid}-${Date.now()}.db`);
process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
process.env.OWNER_PIN = "2468";
process.env.REQUIRE_PAIRING = "1";   // these tests cover the PIN screen, which is off by default locally
process.env.DEVICE_SECRET = "test-secret";
delete process.env.VERCEL;

const { createServer } = await import("../server.js");
let server, base, cookie;
before(async () => {
  server = createServer();
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/api/auth`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pair", pin: "2468", name: "Counter" }) });
  cookie = r.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
});
after(() => {
  server.close();
  for (const s of ["", "-wal", "-shm", "-journal"]) rmSync(dbFile + s, { force: true });
});

const post = body => fetch(`${base}/api/boba`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, data: await r.json() }));
const get = q => fetch(`${base}/api/boba?${new URLSearchParams(q)}`, { headers: { cookie } }).then(r => r.json());
const demoDay = "2026-11-14";

test("unpaired devices can't use the clock api; the clock page needs pairing", async () => {
  assert.equal((await fetch(`${base}/api/boba`)).status, 401);
  assert.equal((await fetch(`${base}/clock.html`, { redirect: "manual" })).status, 302);
  assert.equal((await fetch(`${base}/clock.html`, { headers: { cookie } })).status, 200);
});

test("cooked → running low → leftover writes one waste entry; undo removes it", async () => {
  const d = { scenario: "demo", day: demoDay };
  const cooked = await post({ ...d, min: 600, action: "cooked", frac: 0.5, recommended: 0.5, batchSize: 20 });
  assert.equal(cooked.status, 200);
  assert.equal(cooked.data.readyMin, 600);
  assert.equal((await post({ ...d, min: 700, action: "low" })).status, 200);
  const left = await post({ ...d, min: 850, action: "leftover", batchId: cooked.data.id, level: 0.25 });
  assert.equal(left.data.amount, 2.5); // a quarter of a 10-drink half batch
  await post({ ...d, min: 851, action: "leftover", batchId: cooked.data.id, level: 0.5 }); // corrected, not duplicated
  let day = await get({ ...d, min: 860 });
  assert.equal(day.batches.length, 1);
  assert.equal(day.batches[0].leftoverLogged, true);
  assert.deepEqual(day.lows, [700]);
  assert.equal(day.waste.length, 1);
  assert.equal(day.waste[0].amount, 5);
  assert.equal(day.waste[0].unit, "drinks");
  await post({ ...d, action: "undo", batchId: cooked.data.id });
  day = await get({ ...d, min: 860 });
  assert.equal(day.batches.length, 0);
  assert.equal(day.waste.length, 0);
});

test("bad sizes and levels are refused", async () => {
  assert.equal((await post({ scenario: "demo", day: demoDay, min: 600, action: "cooked", frac: 0.3 })).status, 400);
  const ok = await post({ scenario: "demo", day: demoDay, min: 600, action: "cooked", frac: 1 });
  assert.equal((await post({ scenario: "demo", day: demoDay, action: "leftover", batchId: ok.data.id, level: 0.6 })).status, 400);
});

test("demo rows never show up in live, and reset clears only demo", async () => {
  await post({ scenario: "demo", day: demoDay, min: 610, action: "cooked", frac: 0.25 });
  const live = await post({ action: "cooked", frac: 0.75 });
  assert.equal(live.status, 200);
  const liveDay = await get({ scenario: "live" });
  assert.ok(liveDay.batches.some(b => b.id === live.data.id));
  assert.ok(liveDay.batches.every(b => b.frac !== 0.25 || b.id === live.data.id));
  assert.equal((await post({ action: "reset" })).status, 400, "live data can't be reset");
  await post({ scenario: "demo", action: "reset" });
  assert.equal((await get({ scenario: "demo", day: demoDay })).batches.length, 0);
  assert.ok((await get({ scenario: "live" })).batches.some(b => b.id === live.data.id));
});

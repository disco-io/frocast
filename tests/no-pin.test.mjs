// Local runs have no PIN screen: pages and shared data open without pairing.
// REQUIRE_PAIRING=1 (or running on Vercel) turns the PIN back on.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";

const dbFile = path.join(tmpdir(), `frocast-nopin-${process.pid}-${Date.now()}.db`);
process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
delete process.env.REQUIRE_PAIRING;
delete process.env.VERCEL;
delete process.env.OWNER_PIN;
delete process.env.DEVICE_SECRET;

const { createServer } = await import("../server.js");
let server, base;
before(async () => {
  server = createServer();
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  delete process.env.REQUIRE_PAIRING;
  server.close();
  for (const s of ["", "-wal", "-shm", "-journal"]) rmSync(dbFile + s, { force: true });
});

test("staff pages open with no PIN and no pairing cookie", async () => {
  for (const p of ["/", "/index.html", "/clock.html"]) {
    assert.equal((await fetch(`${base}${p}`, { redirect: "manual" })).status, 200, p);
  }
});

test("shared data and the boba API work without pairing", async () => {
  const put = await fetch(`${base}/api/data`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: { showSample: false } }) });
  assert.equal(put.status, 200);
  const got = await (await fetch(`${base}/api/data`)).json();
  assert.equal(got.state.showSample, false);
  assert.equal((await fetch(`${base}/api/auth`).then(r => r.json())).paired, true);
});

test("REQUIRE_PAIRING=1 turns the PIN gate back on", async () => {
  process.env.REQUIRE_PAIRING = "1";
  const r = await fetch(`${base}/`, { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.match(r.headers.get("location"), /pair\.html/);
  assert.equal((await fetch(`${base}/api/data`)).status, 401);
});

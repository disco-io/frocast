// Pairing, page gate and shared data, end to end through server.js.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";

const dbFile = path.join(tmpdir(), `frocast-test-${process.pid}-${Date.now()}.db`);
process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
process.env.OWNER_PIN = "2468";
process.env.DEVICE_SECRET = "test-secret";
delete process.env.VERCEL;

const { createServer } = await import("../server.js");
const { verify, sign } = await import("../api/_lib/token.js");
const { safeNext } = await import("../js/api.js");

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

const cookieOf = res => res.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
const post = (body, cookie = "", ip = "10.0.0.1") =>
  fetch(`${base}/api/auth`, { method: "POST", headers: { "content-type": "application/json", cookie, "x-forwarded-for": ip }, body: JSON.stringify(body) });

async function pair(name, ip) {
  const r = await post({ action: "pair", pin: "2468", name }, "", ip);
  assert.equal(r.status, 200);
  return { cookie: cookieOf(r), body: await r.json() };
}

test("token signing rejects tampering", async () => {
  const tok = await sign("d|nassau-st|abc", "k");
  assert.equal(await verify(tok, "k"), "d|nassau-st|abc");
  assert.equal(await verify(tok.replace("abc", "abd"), "k"), null);
  assert.equal(await verify(tok, "other-key"), null);
});

test("safeNext only allows same-site paths", () => {
  assert.equal(safeNext("/clock.html?x=1"), "/clock.html?x=1");
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext(null), "/");
});

test("staff pages redirect unpaired visitors to pairing; pair page is open", async () => {
  const r = await fetch(`${base}/`, { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.match(r.headers.get("location"), /\/pair\.html\?next=%2F$/);
  assert.equal((await fetch(`${base}/pair.html`)).status, 200);
  assert.equal((await fetch(`${base}/api/data`)).status, 401);
  assert.equal((await fetch(`${base}/local.db`)).status, 404);
  assert.equal((await fetch(`${base}/node_modules/@libsql/client/package.json`)).status, 404);
});

test("wrong PIN is rejected; right PIN pairs and opens the dashboard", async () => {
  assert.equal((await post({ action: "pair", pin: "1111" }, "", "10.0.0.2")).status, 401);
  const { cookie, body } = await pair("Counter tablet", "10.0.0.2");
  assert.equal(body.device.name, "Counter tablet");
  assert.match(cookie, /fc_device=/);
  assert.match(cookie, /fc_owner=/);
  const page = await fetch(`${base}/`, { headers: { cookie }, redirect: "manual" });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /FroCast/);
  const status = await (await fetch(`${base}/api/auth`, { headers: { cookie } })).json();
  assert.equal(status.paired, true);
  assert.equal(status.owner, true);
});

test("shared data round-trips between two paired devices", async () => {
  const a = await pair("Tablet", "10.0.0.3");
  const b = await pair("Jenny's phone", "10.0.0.3");
  const state = { s: { bobaHours: 3 }, events: [{ from: "2026-11-21", to: "2026-11-21", label: "Penn game", type: "athletics", when: "afternoon", source: "test" }] };
  const put = await fetch(`${base}/api/data`, { method: "PUT", headers: { "content-type": "application/json", cookie: a.cookie }, body: JSON.stringify({ state }) });
  assert.equal((await put.json()).saved, 2);
  const got = await (await fetch(`${base}/api/data`, { headers: { cookie: b.cookie } })).json();
  assert.deepEqual(got.state.s, state.s);
  assert.equal(got.state.events[0].label, "Penn game");
});

test("saves from a stale device merge instead of overwriting", async () => {
  const tablet = await pair("Tablet", "10.0.0.8");
  const phone = await pair("Phone", "10.0.0.8");
  const put = (who, body) => fetch(`${base}/api/data`, { method: "PUT", headers: { "content-type": "application/json", cookie: who.cookie }, body: JSON.stringify(body) }).then(r => r.json());
  const morning = (await (await fetch(`${base}/api/data`, { headers: { cookie: tablet.cookie } })).json()).state;
  const concert = { from: "2026-11-20", to: "2026-11-20", label: "Concert", type: "student", when: "evening", source: "phone" };
  await put(phone, { base: morning, state: { ...morning, events: [...(morning.events || []), concert] } });
  const night = { ...morning, logs: [{ key: "2026-11-14", customers: 61, predicted: 56, boba: 0.25, fruit: 0, planner: true }] };
  const merged = (await put(tablet, { base: morning, state: night })).state;
  assert.ok(merged.events.some(e => e.label === "Concert"), "phone's event survives the tablet's save");
  assert.ok(merged.logs.some(l => l.customers === 61), "tablet's log is saved");
  const shared = (await (await fetch(`${base}/api/data`, { headers: { cookie: phone.cookie } })).json()).state;
  assert.deepEqual(shared, merged);
});

test("a tampered device cookie is refused", async () => {
  const { cookie } = await pair("Tablet", "10.0.0.4");
  const bad = cookie.replace(/fc_device=([^;]+)/, (m, v) => `fc_device=${v.slice(0, -2)}xx`);
  assert.equal((await fetch(`${base}/api/data`, { headers: { cookie: bad } })).status, 401);
});

test("owner can revoke a device; the revoked device loses access", async () => {
  const owner = await pair("Owner phone", "10.0.0.5");
  const other = await pair("Old tablet", "10.0.0.5");
  const list = await (await fetch(`${base}/api/auth?devices=1`, { headers: { cookie: owner.cookie } })).json();
  assert.ok(list.devices.some(d => d.id === other.body.device.id));
  assert.equal((await post({ action: "revoke", id: other.body.device.id }, owner.cookie)).status, 200);
  assert.equal((await fetch(`${base}/api/data`, { headers: { cookie: other.cookie } })).status, 401);
  assert.equal((await fetch(`${base}/api/data`, { headers: { cookie: owner.cookie } })).status, 200);
});

test("five wrong PINs lock that address out, even with the right PIN", async () => {
  const ip = "10.0.0.66";
  for (let i = 0; i < 5; i++) assert.equal((await post({ action: "pair", pin: "0000" }, "", ip)).status, 401);
  assert.equal((await post({ action: "pair", pin: "2468" }, "", ip)).status, 429);
  assert.equal((await post({ action: "pair", pin: "2468" }, "", "10.0.0.67")).status, 200);
});

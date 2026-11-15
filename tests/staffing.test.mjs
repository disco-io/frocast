// People needed at each time of day (js/staffing.js) and the npm run staffing script.
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import { forecast } from "../js/model.js";
import { DEFAULTS, HOURS } from "../js/config.js";
import { staffPlan, blocks, clock, span, BUSY, PREP_MIN, CLOSE_MIN } from "../js/staffing.js";

const day = (key, temp, rain = false) => {
  const [y, m, d] = key.split("-").map(Number);
  return { date: new Date(y, m - 1, d), key, temp, rain };
};
const S = { ...DEFAULTS };
const plan = (customers, s = S) => staffPlan({ froyo: customers * 0.6, tea: customers * 0.4 }, day("2026-11-21", 70), [], s);

test("every open hour has at least minStaff, and the slots cover prep to close-out", () => {
  const p = plan(10);
  assert.equal(p.hours.length, HOURS.length);
  p.hours.forEach(x => assert.ok(x.staff >= S.minStaff));
  assert.equal(p.slots[0].what, "prep");
  assert.equal(p.slots[0].to, HOURS[0] * 60);
  assert.ok(HOURS[0] * 60 - p.slots[0].from >= PREP_MIN);
  const last = p.slots[p.slots.length - 1];
  assert.equal(last.what, "close");
  assert.equal(last.to - last.from, CLOSE_MIN);
  assert.equal(last.staff, S.closeStaff);
});

test("people = ceil(work minutes / (60 × BUSY)), never below minStaff", () => {
  const p = plan(400);
  for (const x of p.hours) {
    const work = (x.tea * 60) / S.teaPerHour + (x.froyo * 60) / S.froyoPerHour + x.cooks * S.cookWorkMin;
    assert.equal(x.staff, Math.max(S.minStaff, Math.ceil(work / (60 * BUSY) - 1e-9)));
  }
  assert.ok(p.peak.staff >= 3, "a 400-customer day needs a bigger crew at the peak");
});

test("more customers never means fewer people", () => {
  const quiet = plan(100), busy = plan(250);
  quiet.hours.forEach((x, i) => assert.ok(busy.hours[i].staff >= x.staff, `${x.h}:00`));
  assert.ok(busy.staffHours > quiet.staffHours);
});

test("starting a boba batch adds hands-on time in the hour cooking starts", () => {
  const p = plan(180);
  const opened = p.cookStarts.filter(m => m >= HOURS[0] * 60);
  assert.equal(p.hours.reduce((a, x) => a + x.cooks, 0), opened.length, "pre-open starts belong to prep");
  const none = plan(180, { ...S, cookWorkMin: 0 });
  p.hours.forEach((x, i) => assert.ok(x.workMin >= none.hours[i].workMin));
});

test("slower rates and a higher floor raise the head count", () => {
  const base = plan(200);
  const slow = plan(200, { ...S, teaPerHour: 12, froyoPerHour: 20 });
  assert.ok(slow.staffHours > base.staffHours);
  const floor = plan(50, { ...S, minStaff: 2 });
  floor.hours.forEach(x => assert.ok(x.staff >= 2));
});

test("the busier-day plan only ever adds people", () => {
  const p = staffPlan(forecast(day("2026-11-14", 44), [], S), day("2026-11-14", 44), [], S);
  p.hours.forEach(x => assert.ok(x.busyStaff >= x.staff));
  p.onCall.forEach(b => assert.ok(b.staff >= 1));
});

test("blocks merge back-to-back slots with the same head count", () => {
  const out = blocks([
    { from: 600, to: 660, staff: 1, what: "open" },
    { from: 660, to: 720, staff: 1, what: "open" },
    { from: 720, to: 780, staff: 2, what: "open" },
    { from: 780, to: 825, staff: 2, what: "close" }
  ]);
  assert.deepEqual(out.map(b => [b.from, b.to, b.staff, b.what]), [[600, 720, 1, "open"], [720, 780, 2, "open"], [780, 825, 2, "close"]]);
});

test("clock and span read like a schedule", () => {
  assert.equal(clock(9 * 60), "9 AM");
  assert.equal(clock(12 * 60), "12 PM");
  assert.equal(clock(23 * 60 + 45), "11:45 PM");
  assert.equal(clock(9 * 60 + 15), "9:15 AM");
  assert.equal(span(600, 1140), "10 AM–7 PM");
});

test("npm run staffing prints a plan for each day (offline, empty database)", async () => {
  const dbFile = path.join(os.tmpdir(), `frocast-staffing-${process.pid}.db`);
  process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };   // sample weather, no network
  const lines = [];
  const { main } = await import("../scripts/staffing.js");
  try { await main(["--days", "2", "--short"], l => lines.push(l)); } finally { globalThis.fetch = realFetch; rmSync(dbFile, { force: true }); }
  const text = lines.join("\n");
  assert.match(text, /weather sample \(offline\)/);
  assert.match(text, /FroCast staffing · 2 days/);
  assert.equal((text.match(/Peak: /g) || []).length, 2);
  assert.match(text, /prep: cut fruit/);
  assert.match(text, /close-out/);
});

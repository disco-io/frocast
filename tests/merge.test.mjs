// Three-way merge: one device's save must never erase another device's changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeState, mergeValue, mergeList, eventId } from "../js/merge.js";

const ev = (label, from = "2026-11-21") => ({ from, to: from, label, type: "student", when: "evening", source: "test" });
const log = (key, customers) => ({ key, customers, predicted: 50, boba: 0.25, fruit: 0, planner: true });

test("stale tablet saving a log at night keeps the event Jenny added at noon", () => {
  const morning = { s: { bobaHours: 4 }, events: [ev("Concert")], logs: [] };
  const server = { ...morning, events: [ev("Concert"), ev("Penn game")] };         // Jenny, noon
  const tablet = { ...morning, logs: [log("2026-11-14", 61)] };                       // tablet, night
  const merged = mergeState(morning, tablet, server);
  assert.deepEqual(merged.events.map(e => e.label).sort(), ["Concert", "Penn game"]);
  assert.equal(merged.logs.length, 1);
  assert.equal(merged.logs[0].customers, 61);
});

test("a deletion on one device sticks unless the other device re-adds it", () => {
  const base = { events: [ev("A"), ev("B")] };
  const local = { events: [ev("A")] };              // this device deleted B
  const remote = { events: [ev("A"), ev("B"), ev("C")] }; // another device added C
  assert.deepEqual(mergeState(base, local, remote).events.map(e => e.label).sort(), ["A", "C"]);
  // deleted elsewhere, untouched here: stays deleted
  assert.deepEqual(mergeList(base.events, base.events, [ev("A")], eventId).map(e => e.label), ["A"]);
});

test("settings merge field by field, including the per-day base", () => {
  const base = { s: { bobaHours: 4, drinksPerBatch: 20, base: { Sat: 85, Sun: 70 } } };
  const local = { s: { bobaHours: 3, drinksPerBatch: 20, base: { Sat: 85, Sun: 60 } } };
  const remote = { s: { bobaHours: 4, drinksPerBatch: 30, base: { Sat: 95, Sun: 70 } } };
  assert.deepEqual(mergeState(base, local, remote).s, { bobaHours: 3, drinksPerBatch: 30, base: { Sat: 95, Sun: 60 } });
});

test("the same log day changed on both devices: this device's save wins; untouched days follow the server", () => {
  const base = { logs: [log("2026-11-13", 40), log("2026-11-14", 50)] };
  const local = { logs: [log("2026-11-13", 40), log("2026-11-14", 55)] };
  const remote = { logs: [log("2026-11-13", 44), log("2026-11-14", 52)] };
  const out = mergeState(base, local, remote).logs;
  assert.equal(out.find(l => l.key === "2026-11-14").customers, 55);
  assert.equal(out.find(l => l.key === "2026-11-13").customers, 44);
});

test("no base (first save ever) keeps local values", () => {
  assert.equal(mergeValue(undefined, 3, undefined), 3);
  assert.deepEqual(mergeState(null, { events: [ev("A")] }, {}).events.map(e => e.label), ["A"]);
});

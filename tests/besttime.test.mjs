// Credit rules of scripts/besttime.js. These tests never call BestTime.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CAP,
  COST,
  REFRESH_DAYS,
  spent,
  canSpend,
  outcome,
  daysSince,
} from "../scripts/besttime.js";

test("credit costs match the API reference and the project cap", () => {
  assert.equal(CAP, 20);
  assert.deepEqual(COST, { ok: 2, failed: 1, serverError: 0 });
  assert.equal(REFRESH_DAYS, 7);
});

test("the cap is hard: a call is refused when its cost would pass 20", () => {
  const log = (n) => Array.from({ length: n }, () => ({ credits: 2 }));
  assert.equal(spent(log(9)), 18);
  assert.equal(canSpend(log(9)), true); // 18 + 2 = 20
  assert.equal(canSpend(log(10)), false);
  assert.equal(canSpend([...log(9), { credits: 1 }]), false); // 19 + 2 > 20
  assert.equal(canSpend([]), true);
});

test("a call with no reply is counted against the cap", () => {
  const log = [
    { outcome: "network-error", credits: 2, unconfirmed: true },
    { outcome: "ok", credits: 2 },
  ];
  assert.equal(spent(log), 4);
});

test("outcome: cost and reason of each kind of reply", () => {
  assert.deepEqual(outcome(200, { status: "OK", analysis: [] }), {
    ok: true,
    credits: 2,
  });
  assert.deepEqual(outcome(503, null), {
    ok: false,
    credits: 0,
    reason: "error",
  });
  assert.equal(
    outcome(404, { status: "Error", message: "Could not find venue." }).reason,
    "not-found",
  );
  assert.equal(
    outcome(404, { status: "Error", message: "Could not find venue." }).credits,
    1,
  );
  assert.equal(
    outcome(200, {
      status: "Error",
      message: "Venue found, but could not forecast: not enough data.",
    }).reason,
    "no-data",
  );
  assert.equal(
    outcome(401, { status: "Error", message: "Invalid key" }).reason,
    "error",
  );
});

test("refresh age is measured in days", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  assert.equal(daysSince("2026-11-14T12:00:00Z", now), 7);
  assert.ok(daysSince("2026-11-15T12:00:00Z", now) < REFRESH_DAYS);
});

// Batch clock planner: when to cook, how much, and what state the screen is in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clockState, planRest, simulate, sizeFor, knobs, habitTimes, demandBetween, OPEN, CLOSE } from "../js/planner.js";
import { forecast, bobaDemand } from "../js/model.js";
import { DEFAULTS } from "../js/config.js";

const S = { ...DEFAULTS, bobaMargin: 0.25 };
const K = knobs(S);
const day = (temp, key = "2026-11-14") => {
  const [y, m, d] = key.split("-").map(Number);
  return { date: new Date(y, m - 1, d), key, temp, rain: false };
};
const hourlyFor = temp => { const d = day(temp); return bobaDemand(forecast(d, [], S), d, [], S); };
const cold = hourlyFor(44), warm = hourlyFor(80);

test("before open: first batch is ready at 10:00, so start it at 9:15", () => {
  const st = clockState({ hourly: cold, batches: [], lows: [], now: 8 * 60 + 30, s: S });
  assert.equal(st.next.readyMin, OPEN);
  assert.equal(st.next.cookMin, OPEN - 45);
  assert.equal(st.mode, "fresh");
  assert.equal(clockState({ hourly: cold, batches: [], lows: [], now: 9 * 60, s: S }).mode, "soon");
  assert.equal(clockState({ hourly: cold, batches: [], lows: [], now: 9 * 60 + 20, s: S }).mode, "now");
});

test("after a batch is cooked the screen goes green, then amber, then red", () => {
  const first = planRest(cold, [], [], 9 * 60, K)[0];
  const batches = [{ id: "a", readyMin: OPEN, servings: first.servings }];
  const st = clockState({ hourly: cold, batches, lows: [], now: OPEN + 10, s: S });
  assert.equal(st.mode, "fresh");
  assert.ok(st.next.readyMin > OPEN);
  assert.equal(clockState({ hourly: cold, batches, lows: [], now: st.next.cookMin - 10, s: S }).mode, "soon");
  assert.equal(clockState({ hourly: cold, batches, lows: [], now: st.next.cookMin + 1, s: S }).mode, "now");
});

test("'Running low' brings the next batch forward", () => {
  const batches = [{ id: "a", readyMin: OPEN, servings: 20 }];
  const normal = clockState({ hourly: cold, batches, lows: [], now: OPEN + 60, s: S });
  const low = clockState({ hourly: cold, batches, lows: [OPEN + 60], now: OPEN + 65, s: S });
  assert.ok(low.next.readyMin < normal.next.readyMin);
  assert.ok(low.leftNow <= 0.15 * K.batch + 1e-9);
});

test("a batch past its freshness window asks 'How much was left?' until logged", () => {
  const batches = [{ id: "a", readyMin: OPEN, servings: 20 }];
  const later = OPEN + K.freshMin + 5;
  assert.deepEqual(clockState({ hourly: cold, batches, lows: [], now: later, s: S }).needLeftover.map(b => b.id), ["a"]);
  const logged = [{ ...batches[0], leftoverLogged: true }];
  assert.equal(clockState({ hourly: cold, batches: logged, lows: [], now: later, s: S }).needLeftover.length, 0);
});

test("warm days get bigger batches than cold days; sizes are quarter steps", () => {
  const c = sizeFor(cold, 14 * 60, K), w = sizeFor(warm, 14 * 60, K);
  assert.ok(w.frac >= c.frac);
  for (const f of [c.frac, w.frac]) assert.ok([0.25, 0.5, 0.75, 1].includes(f));
  assert.ok(c.frac * K.batch >= c.raw, "never smaller than raw demand unless capped at a full batch");
});

test("no batch is planned to be ready in the last 45 minutes; closed after 11 PM", () => {
  const plan = planRest(cold, [], [], OPEN, K);
  assert.ok(plan.length > 0);
  assert.ok(plan.every(p => p.readyMin < CLOSE - 45));
  assert.equal(clockState({ hourly: cold, batches: [], lows: [], now: CLOSE + 5, s: S }).mode, "closed");
});

test("the planned day covers demand: stock never runs out between planned batches", () => {
  const plan = planRest(cold, [], [], 9 * 60, K);
  const batches = plan.map((p, i) => ({ id: String(i), readyMin: p.readyMin, servings: p.servings }));
  for (let t = OPEN + 30; t < CLOSE - 60; t += 30) {
    const st = simulate(cold, batches, [], t, K);
    const fresh = st.filter(b => b.started && !b.expired).reduce((a, b) => a + b.left, 0);
    const nextReady = batches.find(b => b.readyMin > t);
    if (nextReady && nextReady.readyMin - t > 15) assert.ok(fresh > 0, `stock at ${t}`);
  }
  const cooked = plan.reduce((a, p) => a + p.servings, 0);
  assert.ok(cooked >= demandBetween(cold, OPEN, CLOSE));
});

test("usual routine: full batches at evenly spaced hours", () => {
  assert.deepEqual(habitTimes(K), [600, 960]); // 10 AM and 4 PM with 2 batches
  const st = clockState({ hourly: cold, batches: [], lows: [], now: 17 * 60, s: S });
  assert.equal(st.habitSoFar, 2 * K.batch);
});

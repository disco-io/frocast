// Froyo and tea counted separately in the forecast and prep plan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { forecast, bobaPlan, bobaDemand, fruitPlan, machines, tempFactor, teaTempFactor } from "../js/model.js";
import { DEFAULTS, DEFAULT_EVENTS } from "../js/config.js";

const day = (key, temp, rain = false) => {
  const [y, m, d] = key.split("-").map(Number);
  return { date: new Date(y, m - 1, d), key, temp, rain };
};
const S = { ...DEFAULTS };

test("froyo and tea add up to the customer total", () => {
  for (const t of [30, 44, 70, 88]) {
    const fc = forecast(day("2026-11-14", t), DEFAULT_EVENTS, S);
    assert.equal(fc.froyo + fc.tea, fc.customers);
  }
});

test("cold cuts froyo and lifts tea (warm boba)", () => {
  const warm = forecast(day("2026-11-21", 70), [], S);
  const cold = forecast(day("2026-11-21", 35), [], S);
  assert.ok(cold.froyo < warm.froyo, "froyo drops in the cold");
  assert.ok(cold.tea > warm.tea, "tea goes up in the cold");
  assert.ok(cold.customers < warm.customers, "the day as a whole is still slower");
  for (const t of [20, 30, 40, 55, 65]) assert.ok(teaTempFactor(t) > 1, `tea is above 1.0 at ${t}°F`);
  assert.ok(teaTempFactor(30) > teaTempFactor(55), "colder means a bigger lift");
  assert.equal(tempFactor(70), 1);
  assert.equal(teaTempFactor(70), 1);
  // Weather counts against the recent norm: colder than the last few weeks lifts tea above 1.0,
  // a day as cold as the norm is 1.0 (the typical day already includes it).
  const row = (temp, norm) => forecast({ ...day("2026-11-21", temp), norm }, [], S).factors[1];
  assert.ok(row(45, 64).mt > 1 && row(45, 64).mf < 1);
  assert.equal(row(45, 45).mt, 1);
});

test("a warm typical day splits by the froyo share", () => {
  const fc = forecast(day("2026-11-21", 70), [], S); // Saturday, no events
  assert.equal(fc.froyo, Math.round(S.base.Sat * S.froyoShare));
  assert.equal(fc.tea, Math.round(S.base.Sat * (1 - S.froyoShare)));
});

test("shared factors (events) hit both; rain hits froyo harder", () => {
  const ev = [{ from: "2026-11-21", to: "2026-11-21", label: "Penn game", type: "athletics", when: "afternoon", source: "t" }];
  const plain = forecast(day("2026-11-21", 60), [], S);
  const game = forecast(day("2026-11-21", 60), ev, S);
  assert.ok(game.froyo > plain.froyo && game.tea > plain.tea);
  const wet = forecast(day("2026-11-21", 60, true), [], S);
  assert.ok(wet.froyo / plain.froyo < wet.tea / plain.tea);
  const rainRow = wet.factors.find(f => f.label.includes("Rain"));
  assert.ok(rainRow.mf < rainRow.mt);
});

test("boba demand comes mostly from tea; fruit only from froyo", () => {
  const fc = forecast(day("2026-11-14", 44), [], S);
  const total = bobaDemand(fc, day("2026-11-14", 44), [], S).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - (fc.tea * S.bobaShareTea + fc.froyo * S.bobaShareFroyo)) < 1e-6);
  assert.equal(fruitPlan(fc, S).cups, fc.froyo * S.fruitShare);
  assert.ok(bobaPlan(fc, day("2026-11-14", 44), [], S).cooked > 0);
});

test("older callers passing a plain customer count still work", () => {
  const d = day("2026-11-14", 44);
  assert.ok(bobaPlan(60, d, [], S).cooked > 0);
  assert.equal(fruitPlan(60, S).cups, 60 * S.froyoShare * S.fruitShare);
});

test("saved settings from before the split still work (defaults fill new keys)", () => {
  const old = { ...DEFAULTS, bobaShare: 0.35 };
  delete old.froyoShare; delete old.bobaShareTea; delete old.bobaShareFroyo;
  const fc = forecast(day("2026-11-14", 44), [], old);
  assert.equal(fc.froyo + fc.tea, fc.customers);
  assert.ok(bobaPlan(fc, day("2026-11-14", 44), [], old).cooked > 0);
});

test("froyo machines follow froyo customers", () => {
  assert.equal(machines(10), 3);
  assert.equal(machines(30), 4);
  assert.equal(machines(50), 5);
});

// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { HOURS, HOUR_W, DEFAULTS, settings } from "../js/config.js";
import { parse, weights, dayWeights, label, source, isStale } from "../js/shape.js";
import { forecast, hourly, bobaPlan } from "../js/model.js";
import { shape as cachedShape } from "../api/shape.js";

// Synthetic sample in the documented response shape (made-up values, see its _note).
// Same-day hours 6..23 hold hour × 2 + day_int; after-midnight hours 0..5 hold 90 + hour.
const sample = () =>
  JSON.parse(
    fs.readFileSync(
      new URL("./fixtures/besttime-forecast.sample.json", import.meta.url),
      "utf8",
    ),
  );
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const sum = (a) => a.reduce((x, y) => x + y, 0);
const day = (isoDate, extra = {}) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return {
    date: new Date(y, m - 1, d),
    key: isoDate,
    temp: 50,
    norm: 50,
    rain: false,
    ...extra,
  };
};

test("hour mapping: day_raw values land on the clock hour named by hour_analysis", () => {
  const { busy, hourSource } = parse(sample());
  assert.equal(hourSource, "hour_analysis");
  // day_int 0 is Monday, 5 is Saturday, 6 is Sunday
  assert.equal(busy.Mon[10], 10 * 2 + 0);
  assert.equal(busy.Mon[22], 22 * 2 + 0);
  assert.equal(busy.Sat[19], 19 * 2 + 5);
  assert.equal(busy.Sun[6], 6 * 2 + 6);
  // open hours 10:00–23:00 are indexes 4..16 of the 6 AM window, not 10..22
  assert.equal(sample().analysis[0].day_raw[4], busy.Mon[10]);
});

test("hour mapping: hours after midnight belong to the next calendar day", () => {
  const { busy } = parse(sample());
  assert.equal(busy.Tue[0], 90); // from Monday's BestTime day
  assert.equal(busy.Tue[5], 95);
  assert.equal(busy.Mon[3], 93); // from Sunday's BestTime day (week wraps)
  for (const d of DAYS) assert.ok(busy[d].every((v) => typeof v === "number"));
});

test("hour mapping follows the hour fields, not the array position", () => {
  const r = sample();
  // Same data, but each day listed from midnight instead of 6 AM
  for (const e of r.analysis) {
    const pairs = e.hour_analysis.map((h, i) => [h, e.day_raw[i]]);
    const rotated = [...pairs.slice(18), ...pairs.slice(0, 18)];
    e.hour_analysis = rotated.map(([h]) => h);
    e.day_raw = rotated.map(([, v]) => v);
  }
  const { busy } = parse(r);
  assert.equal(busy.Mon[10], 20);
  assert.equal(busy.Mon[0], 90); // no midnight crossing in this layout: stays on Monday
});

test("hour mapping without hour_analysis uses the documented 6 AM window", () => {
  const r = sample();
  r.analysis.forEach((e) => delete e.hour_analysis);
  const p = parse(r);
  assert.equal(p.hourSource, "documented-window");
  assert.deepEqual(p.busy, parse(sample()).busy);
});

test("parse rejects replies that are not a usable forecast", () => {
  assert.throws(() => parse({ status: "Error", message: "x" }));
  assert.throws(() => parse({ status: "OK", venue_info: {} }));
  const short = sample();
  short.analysis[2].day_raw.pop();
  assert.throws(() => parse(short));
  const mislabeled = sample();
  mislabeled.analysis[0].day_info.day_text = "Sunday";
  assert.throws(() => parse(mislabeled));
  const jumbled = sample();
  jumbled.analysis[0].hour_analysis[3].hour = 20;
  assert.throws(() => parse(jumbled));
});

test("weights sum to 1 for each day across open hours", () => {
  const w = weights(parse(sample()).busy, HOURS);
  for (const d of DAYS) {
    assert.equal(w[d].length, HOURS.length);
    assert.ok(Math.abs(sum(w[d]) - 1) < 1e-9, `${d} sums to ${sum(w[d])}`);
    assert.ok(w[d].every((x) => x >= 0));
  }
  // weight(d, h) = busyness(d, h) / sum over that day's open hours
  const mon = HOURS.map((h) => h * 2);
  assert.ok(Math.abs(w.Mon[0] - mon[0] / sum(mon)) < 1e-12);
});

test("a day with no busyness in open hours falls back to the baseline curve", () => {
  const r = sample();
  r.analysis[1].day_raw = Array(24).fill(0); // Tuesday closed
  const w = weights(parse(r).busy, HOURS);
  assert.equal(w.Tue, null);
  const shape = {
    source: "besttime",
    fetched: "2026-11-14T12:00:00Z",
    weights: w,
  };
  assert.equal(dayWeights(shape, "Tue", HOURS), null);
  const tue = day("2026-11-17");
  assert.deepEqual(hourly(100, tue, [], shape), hourly(100, tue, [], null));
  assert.match(label(shape, "Tue", HOURS), /baseline curve/);
});

test("hourly: customers(d, h) = daily total × weight(d, h), and the day adds up", () => {
  const w = weights(parse(sample()).busy, HOURS);
  const shape = {
    source: "besttime",
    fetched: "2026-11-14T12:00:00Z",
    weights: w,
  };
  const sat = day("2026-11-14");
  const hc = hourly(185, sat, [], shape);
  hc.forEach((c, i) => assert.ok(Math.abs(c - 185 * w.Sat[i]) < 1e-9));
  assert.ok(Math.abs(sum(hc) - 185) < 1e-9);
  // event hours are boosted, then re-normalized to the same total
  const ev = [
    {
      from: sat.key,
      to: sat.key,
      type: "student",
      when: "late",
      label: "x",
      source: "t",
    },
  ];
  const boosted = hourly(185, sat, ev, shape);
  assert.ok(Math.abs(sum(boosted) - 185) < 1e-9);
  assert.ok(boosted[HOURS.indexOf(21)] > hc[HOURS.indexOf(21)]);
});

test("no cached shape: the old baseline curve still drives forecast and boba plan", () => {
  const sat = day("2026-11-14");
  const total = sum(HOUR_W);
  for (const none of [
    null,
    undefined,
    { source: "baseline", reason: "no-cache" },
  ]) {
    const hc = hourly(100, sat, [], none);
    hc.forEach((c, i) =>
      assert.ok(Math.abs(c - (100 * HOUR_W[i]) / total) < 1e-9),
    );
  }
  const plan = bobaPlan(100, sat, [], DEFAULTS, null);
  assert.ok(plan.batches.length > 0);
});

test("boba plan reads the new weights", () => {
  // All demand in the last open hour: the first cook moves from open to that hour
  const late = {
    source: "besttime",
    fetched: "2026-11-14T12:00:00Z",
    weights: {},
  };
  for (const d of DAYS) late.weights[d] = HOURS.map((h) => (h === 22 ? 1 : 0));
  const sat = day("2026-11-14");
  assert.equal(bobaPlan(100, sat, [], DEFAULTS, late).batches[0].h, 22);
  assert.equal(bobaPlan(100, sat, [], DEFAULTS, null).batches[0].h, 10);
});

test("weather counts as a deviation from the recent norm, not an absolute cold penalty", () => {
  const s = structuredClone(DEFAULTS);
  const cold = forecast(day("2026-11-14", { temp: 44, norm: 44 }), [], s);
  assert.equal(cold.customers, s.base.Sat); // as cold as the last few weeks: no penalty
  const colder = forecast(day("2026-11-14", { temp: 44, norm: 64 }), [], s);
  assert.ok(colder.customers < s.base.Sat);
  const warmer = forecast(day("2026-11-14", { temp: 70, norm: 55 }), [], s);
  assert.ok(warmer.customers > s.base.Sat);
});

test("placeholder daily totals: 125 on weekdays, 185 on weekend days, none marked owner-set", () => {
  assert.deepEqual(DEFAULTS.base, {
    Sun: 185,
    Mon: 125,
    Tue: 125,
    Wed: 125,
    Thu: 125,
    Fri: 125,
    Sat: 185,
  });
  assert.deepEqual(DEFAULTS.baseSet, {});
});

test("labels say where the shape comes from, and never call it Google data", () => {
  const w = weights(parse(sample()).busy, HOURS);
  const fresh = {
    source: "besttime",
    fetched: "2026-11-14T15:00:00Z",
    weights: w,
  };
  const now = new Date("2026-11-20T15:00:00Z");
  assert.equal(
    label(fresh, "Sat", HOURS, now),
    "Hourly shape: BestTime forecast fetched Nov 14, 2026. Relative busyness, not customer counts.",
  );
  const later = new Date("2026-12-20T15:00:00Z");
  assert.equal(isStale(fresh, now), false);
  assert.equal(isStale(fresh, later), true);
  assert.match(label(fresh, "Sat", HOURS, later), /may be stale/);
  const all = [
    label(fresh, "Sat", HOURS, now),
    label(fresh, "Sat", HOURS, later),
    label(null, "Sat", HOURS),
    label({ source: "baseline", reason: "no-cache" }, "Sat", HOURS),
    label(
      {
        source: "baseline",
        reason: "not-found",
        checked: "2026-11-14T15:00:00Z",
      },
      "Sat",
      HOURS,
    ),
    label(
      {
        source: "baseline",
        reason: "no-data",
        checked: "2026-11-14T15:00:00Z",
      },
      "Sat",
      HOURS,
    ),
  ];
  all.slice(2).forEach((t) => assert.match(t, /baseline curve/));
  all.forEach((t) => assert.doesNotMatch(t, /google/i));
});

test("the page endpoint only reads the cache, and sends weights rather than the raw reply", () => {
  const out = cachedShape(); // whatever is (or isn't) cached on this machine
  assert.ok(["besttime", "baseline"].includes(out.source));
  assert.equal("response" in out, false);
  if (out.source === "besttime") {
    for (const d of DAYS)
      if (out.weights[d]) assert.ok(Math.abs(sum(out.weights[d]) - 1) < 1e-9);
  }
});

test("a comparison day in another season is labeled our seasonal assumption, not BestTime data", () => {
  const w = weights(parse(sample()).busy, HOURS);
  const cached = { source: "besttime", fetched: "2026-11-14T15:00:00Z", weights: w };
  const now = new Date("2026-11-15T15:00:00Z");
  const sep5 = new Date(2026, 8, 5);
  assert.equal(source(cached, "Sat", HOURS, now, sep5).kind, "seasonal");
  const text = label(cached, "Sat", HOURS, now, sep5);
  assert.match(text, /our seasonal assumption/);
  assert.doesNotMatch(text, /^Hourly shape: BestTime/);
  // days near today keep the BestTime label; a late look at a fresh-enough day says "may be stale"
  assert.equal(source(cached, "Sat", HOURS, now, new Date(2026, 10, 21)).kind, "besttime");
  const jan = new Date("2027-01-10T15:00:00Z");
  assert.deepEqual(
    { ...source(cached, "Sun", HOURS, jan, jan), date: undefined },
    { kind: "besttime", stale: true, date: undefined },
  );
});

test("typical-day totals: only days the owner set override the placeholders, on every screen", () => {
  // an older save that stored the previous defaults for every day, with no owner-set marks
  const old = settings({ base: { Sun: 70, Mon: 45, Sat: 85 }, bobaHours: 3 });
  assert.deepEqual(old.base, DEFAULTS.base);
  assert.equal(old.bobaHours, 3);
  const set = settings({ base: { Sun: 70, Sat: 210 }, baseSet: { Sat: true } });
  assert.equal(set.base.Sat, 210);
  assert.equal(set.base.Sun, 185);
  assert.deepEqual(settings(undefined).base, DEFAULTS.base);
  assert.deepEqual(settings(null).baseSet, {});
});

test("the busy-day backup plan uses the same hourly shape as the main plan", () => {
  const late = { source: "besttime", fetched: "2026-11-14T12:00:00Z", weights: {} };
  for (const d of DAYS) late.weights[d] = HOURS.map((h) => (h === 22 ? 1 : 0));
  const plan = bobaPlan(100, day("2026-11-14"), [], DEFAULTS, late);
  assert.ok(plan.backup.every((b) => b.h === 22));
});

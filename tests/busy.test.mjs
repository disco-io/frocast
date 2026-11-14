// Busyness words, the plain "why" sentence, event stacking and the busy-day backup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { forecast, bobaDemand } from "../js/model.js";
import { DEFAULTS, EVENT_STACK } from "../js/config.js";
import { levelOf, whyLine, plannerBackup, LEVELS } from "../js/busy.js";
import { planRest, knobs, CLOSE } from "../js/planner.js";

const day = (key, temp, rain = false) => {
  const [y, m, d] = key.split("-").map(Number);
  return { date: new Date(y, m - 1, d), key, temp, rain };
};
const ev = (label, type, from = "2026-11-21", to = from) => ({ from, to, label, type, when: "afternoon", source: "t" });
const S = { ...DEFAULTS };

test("levels: very busy at 125%+ of the reference down to very slow under 60%", () => {
  assert.equal(levelOf(130, 100).name, "Very busy");
  assert.equal(levelOf(110, 100).name, "Busy");
  assert.equal(levelOf(90, 100).name, "Slightly busy");
  assert.equal(levelOf(70, 100).name, "Not busy");
  assert.equal(levelOf(30, 100).name, "Very slow");
  assert.equal(LEVELS.length, 5);
});

test("events of different types don't stack fully: biggest in full, next at half, the rest not at all", () => {
  assert.deepEqual(EVENT_STACK, [1, 0.5, 0]);
  const d = day("2026-11-21", 70);
  const none = forecast(d, [], S);
  const four = forecast(d, [ev("Tree lighting", "town"), ev("Penn game", "athletics"), ev("Concert", "student"), ev("Hackathon", "competition")], S);
  // town 1.2 in full, athletics 1.15 at half = 1.075; student and competition add nothing
  const rows = four.factors.filter(f => f.m !== undefined && /Tree|Penn|Concert|Hackathon/.test(f.label));
  assert.equal(rows.length, 2);
  assert.ok(Math.abs(rows[0].m - 1.2) < 1e-9 && Math.abs(rows[1].m - 1.075) < 1e-9);
  assert.ok(four.customers <= Math.round(none.customers * 1.2 * 1.075) + 1);
  assert.ok(four.customers > none.customers);
});

test("several events of one type still make one row; a break is separate", () => {
  const d = day("2026-11-21", 60);
  const fc = forecast(d, [ev("Football", "athletics"), ev("Squash", "athletics"), ev("Hockey", "athletics")], S);
  assert.equal(fc.factors.filter(f => /Football|Squash|Hockey/.test(f.label)).length, 1);
  assert.match(fc.factors.find(f => /Football/.test(f.label)).label, /\+ 2 more/);
  const brk = forecast(d, [ev("Thanksgiving recess", "break")], S);
  assert.ok(brk.customers < forecast(d, [], S).customers);
});

test("why line is plain English: what pushes up, what holds down", () => {
  const d = day("2026-11-21", 44);
  const events = [ev("Home football game", "athletics")];
  const line = whyLine(d, forecast(d, events, S), events);
  assert.match(line, /^Pushed up by Home football game; held down by cold \(44°F\)\.$/);
  assert.match(whyLine(day("2026-11-21", 65), forecast(day("2026-11-21", 65), [], S), []), /normal day/);
  const w = day("2026-09-05", 82, true);
  assert.match(whyLine(w, forecast(w, [], S), []), /warm \(82°F\).*rain or snow|rain or snow/);
  const bk = [ev("Thanksgiving recess", "break")];
  assert.match(whyLine(day("2026-11-21", 50), forecast(day("2026-11-21", 50), bk, S), bk), /students away \(Thanksgiving recess\)/);
});

test("busy-day backup: nothing with no cushion, extra boba with a big one, nothing after close", () => {
  const d = day("2026-11-21", 60);
  const fc = forecast(d, [], S);
  const hourly = bobaDemand(fc, d, [], S);
  const k = knobs(S);
  const base = planRest(hourly, [], [], 9 * 60, k);
  assert.deepEqual(plannerBackup(hourly, [], [], 9 * 60, { ...S, cushion: 0 }, base), []);
  const extra = plannerBackup(hourly, [], [], 9 * 60, { ...S, cushion: 0.6 }, base);
  assert.ok(extra.length > 0);
  for (const b of extra) {
    assert.ok(["add", "bigger"].includes(b.kind));
    assert.ok([0.25, 0.5, 0.75, 1].includes(b.frac));
    if (b.kind === "bigger") assert.ok(b.frac > b.was);
  }
  assert.deepEqual(plannerBackup(hourly, [], [], CLOSE, { ...S, cushion: 0.6 }, []), []);
});

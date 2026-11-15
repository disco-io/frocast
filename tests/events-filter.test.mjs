// Which events count: football home games, big town and student draws, breaks. Not other sports or club events.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcs, isHome, isFootball, relevant } from "../api/_lib.js";

const ics = lines => `BEGIN:VCALENDAR\n${lines.map(([title, loc, date]) =>
  `BEGIN:VEVENT\nSUMMARY:${title}\nLOCATION:${loc}\nDTSTART;VALUE=DATE:${date}\nDTEND;VALUE=DATE:${date}\nEND:VEVENT`).join("\n")}\nEND:VCALENDAR`;

test("from the athletics feed only football home games count", () => {
  const items = parseIcs(ics([
    ["[W] Princeton University Football vs Penn - Senior Day", "Princeton\\, N.J.", "20261121"],
    ["Princeton University Football at Yale", "New Haven\\, Conn.", "20261114"],
    ["Princeton University Men's Ice Hockey vs Dartmouth", "\\, Hobey Baker Rink", "20261114"],
    ["Princeton University Women's Squash vs Drexel", "Princeton\\, N.J.", "20261121"],
    ["Princeton University Men's Basketball vs Monmouth", "Princeton\\, N.J., Jadwin Gymnasium", "20261120"]
  ]));
  const kept = items.filter(isHome).filter(isFootball);
  assert.equal(kept.length, 1);
  assert.match(kept[0].title, /Football vs Penn/);
  assert.ok(items.filter(isHome).length >= 4, "the other home sports exist, they are just not counted");
});

test("an away football game and a 'football' word in another sport don't sneak in", () => {
  const items = parseIcs(ics([
    ["Princeton University Football at Harvard", "Cambridge\\, Mass.", "20261107"],
    ["Princeton University Women's Soccer vs Penn", "Princeton\\, N.J.", "20261107"]
  ]));
  assert.equal(items.filter(isHome).filter(isFootball).length, 0);
});

test("web feeds keep only breaks, town events and big student events", () => {
  const ev = type => ({ from: "2026-11-20", to: "2026-11-20", label: type, type, when: "all" });
  const all = ["break", "exams", "athletics", "town", "student", "competition"].map(ev);
  assert.deepEqual(relevant(all, "town").map(e => e.type), ["break", "town", "student"]);
  assert.deepEqual(relevant(all, "").map(e => e.type), ["break", "town", "student"]);
});

test("the academic calendar only contributes breaks (reading period and exams are dropped)", () => {
  const ev = (type, label) => ({ from: "2026-11-25", to: "2026-11-29", label, type, when: "all" });
  const out = relevant([ev("break", "Thanksgiving recess"), ev("exams", "Reading period"), ev("exams", "Final assessments")], "academic");
  assert.deepEqual(out.map(e => e.label), ["Thanksgiving recess"]);
});

// Staff-friendly summaries shared by the dashboard and the demo page:
// how busy a day is (a color-coded word), a plain "why" sentence, and what to add if it gets busier.
import { isMajor } from "./config.js";
import { dayEvents } from "./model.js";
import { knobs, planRest, CLOSE } from "./planner.js";

// min = lowest share of the reference (the 2-week average, or a typical day) for the level
export const LEVELS = [
  { min: 1.25, name: "Very busy", cls: "lv-hot" },
  { min: 1.05, name: "Busy", cls: "lv-warm" },
  { min: 0.85, name: "Slightly busy", cls: "lv-ok" },
  { min: 0.6, name: "Not busy", cls: "lv-cool" },
  { min: 0, name: "Very slow", cls: "lv-cold" }
];

export const levelOf = (customers, ref) => LEVELS.find(l => customers / Math.max(ref, 1) >= l.min);

// One plain sentence: what pushes the day up, what holds it down.
export function whyLine(day, fc, events) {
  const ups = [], downs = [];
  const temp = fc.factors.find(f => f.mf !== undefined)?.mf ?? 1;   // the temperature row (froyo side)
  if (temp < 0.85) downs.push(`cold (${Math.round(day.temp)}°F)`);
  else if (temp > 1.1) ups.push(`warm (${Math.round(day.temp)}°F)`);
  if (day.rain) downs.push("rain or snow");
  const byType = {};
  [...dayEvents(events, day.key)].sort((a, b) => isMajor(b) - isMajor(a)).forEach(e => (byType[e.type] ||= []).push(e));
  for (const [t, list] of Object.entries(byType)) {
    if (t === "break") downs.push(`students away (${list[0].label})`);
    else ups.push(`${list[0].label.replace(/\s+[-–]\s+.*$/, "")}${list.length > 1 ? ` + ${list.length - 1} more` : ""}`);
  }
  const short = list => (list.length > 3 ? `${list.slice(0, 3).join(", ")} and ${list.length - 3} more` : list.join(", "));
  const parts = [];
  if (ups.length) parts.push(`Pushed up by ${short(ups)}`);
  if (downs.length) parts.push(`held down by ${short(downs)}`);
  if (!parts.length) return "A normal day: no events, mild weather.";
  const text = parts.join("; ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

// For screens that use planner.js: compare today's plan with the plan for a busier day (cushion = how much busier)
// and list what to add or make bigger. basePlan = planRest() for the normal day, from the same moment.
export function plannerBackup(hourly, batches, lows, now, s, basePlan) {
  if (now >= CLOSE) return [];
  const k = knobs(s), up = 1 + (s.cushion ?? 0.2);
  const busy = planRest(hourly.map(x => x * up), batches, lows, now, k);
  const used = new Set(), out = [];
  for (const b of busy) {
    let best = -1;
    basePlan.forEach((p, i) => {
      const gap = Math.abs(p.readyMin - b.readyMin);
      if (!used.has(i) && gap <= 60 && (best < 0 || gap < Math.abs(basePlan[best].readyMin - b.readyMin))) best = i;
    });
    if (best < 0) out.push({ kind: "add", cookMin: b.cookMin, frac: b.frac });
    else {
      used.add(best);
      if (b.frac > basePlan[best].frac + 0.01) out.push({ kind: "bigger", cookMin: basePlan[best].cookMin, frac: b.frac, was: basePlan[best].frac });
    }
  }
  return out;
}

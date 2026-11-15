// How many people the shop needs at each time of day, from the same forecast the dashboard shows.
//   work minutes in an hour = tea drinks × (60 / teaPerHour)       made to order
//                           + froyo cups × (60 / froyoPerHour)     self-serve: weigh, ring up, keep the bar stocked
//                           + cookWorkMin for each boba batch started that hour (hands-on time, not the whole cook)
//   people = max(minStaff, ceil(work minutes / (60 × BUSY)))
// Plus a prep slot before open (1 person) and a close-out slot after close (closeStaff people).
// Every rate is a placeholder until the shop sets it in Settings.
import { HOURS } from "./config.js";
import { hourly, bobaPlan } from "./model.js";

export const BUSY = 0.8;      // plan each person at most 80% busy: customers arrive in bursts, not evenly
export const PREP_MIN = 60;   // before open: cut fruit, start the first boba
export const CLOSE_MIN = 45;  // after close: clean machines, count the drawer, closing log

const OPEN = HOURS[0] * 60;
const SHUT = (HOURS[HOURS.length - 1] + 1) * 60;

// Staff per open hour for one day's demand (froyo and tea per hour, boba cook starts in minutes)
function perHour(hf, ht, starts, s) {
  return HOURS.map((h, i) => {
    const cooks = starts.filter(m => Math.floor(m / 60) === h).length;   // batches started before open are prep work
    const workMin = (ht[i] * 60) / s.teaPerHour + (hf[i] * 60) / s.froyoPerHour + cooks * s.cookWorkMin;
    return { cooks, workMin, staff: Math.max(s.minStaff, Math.ceil(workMin / (60 * BUSY) - 1e-9)) };
  });
}

// Boba batches are listed by the hour they're ready; cooking starts cookLead minutes before
const cookStarts = (batches, s) => batches.map(b => b.h * 60 - s.cookLead);

// Merge back-to-back slots with the same head count: [{ from, to, staff, what }] in minutes after midnight
export function blocks(slots) {
  const out = [];
  for (const x of slots) {
    const last = out[out.length - 1];
    if (last && last.to === x.from && last.staff === x.staff && last.what === x.what) last.to = x.to;
    else out.push({ ...x });
  }
  return out;
}

// One day's plan. fc = forecast(day, events, s) from model.js.
export function staffPlan(fc, day, events, s, shape) {
  const hf = hourly(fc.froyo, day, events, shape);
  const ht = hourly(fc.tea, day, events, shape);
  const boba = bobaPlan(fc, day, events, s, shape);
  const starts = cookStarts(boba.batches, s);
  const rows = perHour(hf, ht, starts, s);

  // Busier day (s.cushion more customers): who to have on call
  const busy = perHour(hourly(boba.busyFc.froyo, day, events, shape), hourly(boba.busyFc.tea, day, events, shape),
    cookStarts(bobaPlan(boba.busyFc, day, events, s, shape).batches, s), s);

  const hours = HOURS.map((h, i) => ({
    h, froyo: hf[i], tea: ht[i],
    cooks: rows[i].cooks,
    workMin: Math.round(rows[i].workMin),
    staff: rows[i].staff,
    busyStaff: busy[i].staff
  }));
  const prepStart = Math.min(OPEN - PREP_MIN, ...starts);
  const slots = [
    { from: prepStart, to: OPEN, staff: 1, what: "prep" },
    ...hours.map(x => ({ from: x.h * 60, to: x.h * 60 + 60, staff: x.staff, what: "open" })),
    { from: SHUT, to: SHUT + CLOSE_MIN, staff: Math.max(1, s.closeStaff), what: "close" }
  ];
  const peak = hours.reduce((a, x) => (x.staff > a.staff || (x.staff === a.staff && x.workMin > a.workMin) ? x : a), hours[0]);
  const staffHours = slots.reduce((a, x) => a + (x.staff * (x.to - x.from)) / 60, 0);
  const onCall = blocks(hours.filter(x => x.busyStaff > x.staff)
    .map(x => ({ from: x.h * 60, to: x.h * 60 + 60, staff: x.busyStaff - x.staff, what: "extra" })));
  return { hours, slots, blocks: blocks(slots), peak: { h: peak.h, staff: peak.staff }, staffHours, onCall, cookStarts: starts };
}

// 9:15 AM, 12 PM, 11:45 PM
export function clock(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}
export const span = (from, to) => `${clock(from)}–${clock(to)}`;

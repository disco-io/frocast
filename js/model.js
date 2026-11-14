import { HOURS, HOUR_W, TYPES, WHEN, TEMP, RAIN, EVENT_STACK, isMajor } from "./config.js";

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const iso = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const dayEvents = (events, key) => events.filter(e => key >= e.from && key <= e.to);
export const isBreak = (events, key) => dayEvents(events, key).some(e => e.type === "break");

// Straight-line lookup in [x, y] points
function curve(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [a, fa] = pts[i - 1];
      const [b, fb] = pts[i];
      return fa + ((fb - fa) * (t - a)) / (b - a);
    }
  }
  return pts[pts.length - 1][1];
}

// Temperature effect on froyo: 30°F ×0.45 … 70°F ×1.0 … 90°F ×1.25
export const tempFactor = t => curve(TEMP.froyo, t);
// Temperature effect on tea: 30°F ×0.75 … 70°F ×1.0 … 90°F ×1.05
export const teaTempFactor = t => curve(TEMP.tea, t);

// Expected customers, froyo and tea counted separately:
//   froyo = typical day × froyo share × weather (froyo) × campus × events × learned correction
//   tea   = typical day × tea share   × weather (tea)   × campus × events × learned correction
// A factor row has m (same for both) or mf / mt (froyo / tea).
export function forecast(day, events, s) {
  const dow = DOW[day.date.getDay()];
  const base = s.base[dow];
  const share = s.froyoShare ?? 0.6;
  const evs = dayEvents(events, day.key);
  const brk = evs.find(e => e.type === "break");
  const f = [
    { label: `Typical ${dow} (warm day, students here)`, base, froyo: base * share, tea: base * (1 - share) },
    { label: `🌡 ${Math.round(day.temp)}°F`, mf: tempFactor(day.temp), mt: teaTempFactor(day.temp) },
    brk ? { label: `${TYPES.break.icon} ${brk.label}`, m: TYPES.break.mult } : { label: "🎓 Students on campus", m: 1 }
  ];
  if (day.rain) f.push({ label: "☔ Rain or snow", mf: RAIN.froyo, mt: RAIN.tea });
  const byType = {};        // several events of one type on a day (e.g. 4 home games) make one row
  [...evs].sort((a, b) => isMajor(b) - isMajor(a)).filter(e => e.type !== "break").forEach(e => (byType[e.type] ||= []).push(e));
  // Events of different types don't stack fully (EVENT_STACK): the biggest boost counts in full,
  // the next at half, the rest not at all. Otherwise a day with 4 small events looks busier than a big game.
  Object.entries(byType).sort((a, b) => TYPES[b[0]].mult - TYPES[a[0]].mult).forEach(([t, list], i) => {
    const share = EVENT_STACK[Math.min(i, EVENT_STACK.length - 1)];
    if (share <= 0) return;
    f.push({ label: `${TYPES[t].icon} ${list[0].label}${list.length > 1 ? ` + ${list.length - 1} more` : ""} · ${WHEN[list[0].when].name.toLowerCase()}`, m: 1 + (TYPES[t].mult - 1) * share });
  });
  if (Math.abs(s.calib - 1) > 0.01) f.push({ label: "📝 Adjusted from your closing logs", m: s.calib });
  const mult = key => f.slice(1).reduce((acc, x) => acc * (x[key] ?? x.m), 1);
  const froyoMult = mult("mf"), teaMult = mult("mt");
  const froyo = Math.max(0, Math.round(base * share * froyoMult));
  const tea = Math.max(0, Math.round(base * (1 - share) * teaMult));
  return { base, factors: f, froyo, tea, froyoMult, teaMult, customers: froyo + tea };
}

// Older callers may pass a plain customer count; split it with the froyo share.
const split = (fc, s) => (typeof fc === "number"
  ? { froyo: fc * (s.froyoShare ?? 0.6), tea: fc * (1 - (s.froyoShare ?? 0.6)) }
  : fc);

// Spread the day's customers across open hours, boosted when events happen
export function hourly(customers, day, events) {
  const boost = new Set();
  if (day) dayEvents(events, day.key).forEach(e => WHEN[e.when].hours.forEach(h => boost.add(h)));
  const w = HOURS.map((h, i) => HOUR_W[i] * (boost.has(h) ? 1.6 : 1));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(x => (customers * x) / sum);
}

// Run a cooking schedule hour by hour; pearls expire after s.bobaHours
function simulate(demand, s, decide) {
  let stock = [];
  let cooked = 0;
  let tossed = 0;
  const batches = [];
  for (let i = 0; i < HOURS.length; i++) {
    const h = HOURS[i];
    stock.forEach(b => {
      if (b.expires <= h) {
        tossed += b.left;
        b.left = 0;
      }
    });
    stock = stock.filter(b => b.left > 0);
    const have = stock.reduce((a, b) => a + b.left, 0);
    const size = decide(i, h, have);
    if (size > 0) {
      const drinks = s.drinksPerBatch * size;
      batches.push({ h, size, drinks });
      stock.push({ left: drinks, expires: h + s.bobaHours });
      cooked += drinks;
    }
    let need = demand[i];
    for (const b of stock) {
      const use = Math.min(b.left, need);
      b.left -= use;
      need -= use;
      if (need <= 0) break;
    }
  }
  stock.forEach(b => { tossed += b.left; });
  return { batches, cooked, tossed };
}

// Boba drinks per open hour: tea drinks with boba + froyo cups with boba topping
export function bobaDemand(fc, day, events, s) {
  const { froyo, tea } = split(fc, s);
  const hf = hourly(froyo, day, events), ht = hourly(tea, day, events);
  return hf.map((x, i) => x * (s.bobaShareFroyo ?? 0.05) + ht[i] * (s.bobaShareTea ?? 0.7));
}

// Cook only when stock runs short, sized in quarter batches to the next few hours
const cook = (demand, s) => simulate(demand, s, (i, h, have) => {
  if (demand[i] <= have + 0.01) return 0;
  const ahead = demand.slice(i, i + s.bobaHours).reduce((a, b) => a + b, 0) - have;
  return Math.min(1, Math.max(0.25, Math.ceil((ahead / s.drinksPerBatch) * 4) / 4));
});

// Boba plan, plus a backup: what to add if the day turns out busier than expected (s.cushion = how much busier).
// busyFc is the forecast scaled up by the cushion, so the caller can size fruit and froyo for a busy day too.
export function bobaPlan(fc, day, events, s) {
  const demand = bobaDemand(fc, day, events, s);
  const plan = cook(demand, s);
  const n = Math.max(1, s.oldBatches);
  const times = Array.from({ length: n }, (_, k) => HOURS[Math.floor((k * HOURS.length) / n)]);
  const old = simulate(demand, s, (i, h) => (times.includes(h) ? 1 : 0));

  const up = 1 + (s.cushion ?? 0.2);
  const { froyo, tea } = split(fc, s);
  const busyFc = { froyo: froyo * up, tea: tea * up };
  const busyCustomers = Math.round((froyo + tea) * up);
  const busy = cook(bobaDemand(busyFc, day, events, s), s);
  const base = Object.fromEntries(plan.batches.map(b => [b.h, b.size]));
  const backup = busy.batches
    .map(b => ({ h: b.h, size: +(b.size - (base[b.h] || 0)).toFixed(2) }))
    .filter(b => b.size > 0.01);
  return { ...plan, oldTossed: old.tossed, busyCustomers, busyFc, backup };
}

// Fresh fruit goes on froyo cups only
export function fruitPlan(fc, s) {
  const cups = split(fc, s).froyo * s.fruitShare;
  return { cups, containers: Math.max(1, Math.ceil(cups / s.cupsPerContainer)) };
}

// Froyo machines to run, from froyo customers (same cut-offs as before at a 60% froyo share)
export const machines = froyo => (froyo < 21 ? 3 : froyo < 39 ? 4 : 5);

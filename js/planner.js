// Batch clock planner: given today's boba demand and the batches actually cooked, says
// when to start the next batch and how big, minute by minute. Pure functions (no DOM),
// shared by clock.js and the tests. Times are minutes after midnight, shop local time.
import { HOURS } from "./config.js";

export const OPEN = HOURS[0] * 60;                         // 10:00
export const CLOSE = (HOURS[HOURS.length - 1] + 1) * 60;   // 23:00
export const STEP = 5;                                     // simulation step, minutes
export const SOON_MIN = 20;                                // amber when the next cook is this close
export const LAST_COOK_MIN = 45;                           // don't plan a batch ready in the last 45 min
export const LOW_LEFT = 0.15;                              // "Running low" = about 15% of a batch left

const SIZES = [0.25, 0.5, 0.75, 1];

// Drinks wanted per minute at minute t (hourly demand spread evenly over the hour).
export function rateAt(hourly, t) {
  const i = Math.floor((t - OPEN) / 60);
  return i >= 0 && i < hourly.length ? hourly[i] / 60 : 0;
}

export function demandBetween(hourly, a, b) {
  let total = 0;
  for (let t = Math.max(a, OPEN); t < Math.min(b, CLOSE); t++) total += rateAt(hourly, t);
  return total;
}

// Settings the planner needs, with the shop's placeholders as fallbacks.
export function knobs(s) {
  return {
    batch: s.drinksPerBatch ?? 20,
    freshMin: (s.bobaHours ?? 4) * 60,
    lead: s.cookLead ?? 45,
    margin: s.bobaMargin ?? 0.25,
    habit: Math.max(1, s.oldBatches ?? 2)
  };
}

// Quarter-batch size covering demand over the window plus the margin (never below raw demand).
export function sizeFor(hourly, from, k) {
  const to = Math.min(from + k.freshMin, CLOSE);
  const raw = demandBetween(hourly, from, to);
  const need = raw * (1 + k.margin);
  const q = k.batch / 4;
  const quarters = Math.max(Math.round(need / q), Math.ceil(raw / q));
  const frac = Math.min(1, Math.max(0.25, quarters / 4));
  return { frac, raw, need, to };
}

// Simulate stock from the first batch to `until`. Batches: { id, readyMin, servings };
// lows: minutes when staff pressed "Running low". Returns remaining drinks per batch and
// batches that expired with drinks left (they need a "How much was left?" answer).
export function simulate(hourly, batches, lows, until, k) {
  const stock = batches.map(b => ({ ...b, left: 0, started: false, expired: false })).sort((a, b) => a.readyMin - b.readyMin);
  const lowSet = [...lows].sort((a, b) => a - b);
  let li = 0;
  const start = stock.length ? Math.min(stock[0].readyMin, until) : until;
  for (let t = start; t < until; t += STEP) {
    for (const b of stock) {
      if (!b.started && b.readyMin <= t) { b.started = true; b.left = b.servings; }
      if (b.started && !b.expired && t >= b.readyMin + k.freshMin) b.expired = true;
    }
    while (li < lowSet.length && lowSet[li] <= t) {
      stock.forEach(b => { if (b.started && !b.expired) b.left = Math.min(b.left, LOW_LEFT * k.batch); });
      li++;
    }
    let need = demandBetween(hourly, t, Math.min(t + STEP, until));
    for (const b of stock) { // oldest first
      if (!b.started || b.expired || need <= 0) continue;
      const use = Math.min(b.left, need);
      b.left -= use;
      need -= use;
    }
  }
  for (const b of stock) {
    if (!b.started && b.readyMin <= until) { b.started = true; b.left = b.servings; }
    if (b.started && !b.expired && until >= b.readyMin + k.freshMin) b.expired = true;
  }
  return stock;
}

const freshLeft = stock => stock.filter(b => b.started && !b.expired).reduce((a, b) => a + b.left, 0);

// When does fresh stock run out after `from`? (stock is the simulation state at `from`)
function runOutAfter(hourly, stock, from, k) {
  const s = stock.map(b => ({ ...b }));
  if (freshLeft(s) < 1) return from;
  for (let t = from; t < CLOSE; t += STEP) {
    for (const b of s) if (b.started && !b.expired && t >= b.readyMin + k.freshMin) b.expired = true;
    if (freshLeft(s) < 1) return t; // expired right now
    let need = demandBetween(hourly, t, t + STEP);
    for (const b of s) {
      if (!b.started || b.expired || need <= 0) continue;
      const use = Math.min(b.left, need);
      b.left -= use;
      need -= use;
    }
    if (freshLeft(s) < 1) return t; // runs out during this step: have the next one ready at its start
  }
  return CLOSE;
}

// The rest of today's plan from `now`, given what's been cooked. Each planned batch:
// { readyMin, cookMin, frac, servings, raw, need, to }.
export function planRest(hourly, batches, lows, now, k) {
  const plan = [];
  let cooked = batches.map(b => ({ ...b }));
  let from = Math.max(now, OPEN - k.lead);
  for (let guard = 0; guard < 12; guard++) {
    const stock = simulate(hourly, cooked, lows, Math.max(from, OPEN), k);
    let ready = runOutAfter(hourly, stock, Math.max(from, OPEN), k);
    if (!cooked.length) ready = Math.max(ready, OPEN);
    if (ready >= CLOSE - LAST_COOK_MIN) break;
    const size = sizeFor(hourly, ready, k);
    const p = { readyMin: ready, cookMin: ready - k.lead, frac: size.frac, servings: size.frac * k.batch, raw: size.raw, need: size.need, to: size.to };
    plan.push(p);
    cooked = [...cooked, { id: `plan-${guard}`, readyMin: ready, servings: p.servings, planned: true }];
    from = ready + STEP;
  }
  return plan;
}

// Your usual routine: full batches ready at evenly spaced hours (same rule as model.js).
export function habitTimes(k) {
  return Array.from({ length: k.habit }, (_, i) => HOURS[Math.floor((i * HOURS.length) / k.habit)] * 60);
}

// Everything the clock screen shows.
export function clockState({ hourly, batches, lows, now, s }) {
  const k = knobs(s);
  const stock = simulate(hourly, batches, lows, now, k);
  const active = stock.filter(b => b.started && !b.expired && !b.leftoverLogged && b.status !== "expired");
  const needLeftover = stock.filter(b => b.started && b.expired && !b.leftoverLogged && b.status !== "expired");
  const plan = now < CLOSE ? planRest(hourly, batches, lows, now, k) : [];
  const next = plan.find(p => p.readyMin > now - 1) || null;
  const current = active.length ? active[active.length - 1] : null;
  const leftNow = active.reduce((a, b) => a + b.left, 0);

  let mode;
  if (now >= CLOSE) mode = "closed";
  else if (!next) mode = now < OPEN ? "closed" : "done";
  else if (now < next.cookMin - 90 && now < OPEN) mode = "closed";
  else if (now >= next.cookMin) mode = "now";
  else if (next.cookMin - now <= SOON_MIN) mode = "soon";
  else mode = "fresh";

  const cookedSoFar = batches.filter(b => b.readyMin <= now).reduce((a, b) => a + b.servings, 0);
  const habitSoFar = habitTimes(k).filter(t => t <= now).length * k.batch;
  return {
    mode, next, plan, current, leftNow, needLeftover,
    ageMin: current ? now - current.readyMin : null,
    freshUntil: current ? current.readyMin + k.freshMin : null,
    cookedSoFar, habitSoFar, habitDay: k.habit * k.batch,
    plannedDay: cookedSoFar + plan.filter(p => p.readyMin > now).reduce((a, p) => a + p.servings, 0),
    k
  };
}

export const SIZE_LABEL = { 0.25: "¼", 0.5: "½", 0.75: "¾", 1: "full" };
export const nearestSize = f => SIZES.reduce((best, x) => (Math.abs(x - f) < Math.abs(best - f) ? x : best), 1);

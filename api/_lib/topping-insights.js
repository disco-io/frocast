// Step 4 of the topping check: turning confirmed checks into suggestions, totals and prep guidance.
import { LOCATION, now } from "./db.js";
import { usage, discards } from "../../js/toppings-math.js";

export const SUGGEST_MIN_DAYS = 5;
export const SUGGEST_WINDOW_DAYS = 14;
export const HIGH_CLOSE = 0.75;

export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

async function bins(db, scenario) {
  const r = await db.execute({ sql: "SELECT id, name, discard_at_close, pan_cost FROM bins WHERE location_id = ? AND scenario = ? AND active = 1 ORDER BY row_no, col_no", args: [LOCATION, scenario] });
  return r.rows.map(b => ({ id: b.id, name: b.name, discard_at_close: b.discard_at_close == null ? null : Number(b.discard_at_close), pan_cost: b.pan_cost == null ? null : Number(b.pan_cost) }));
}

// "Try a smaller pan": a bin that ended three-quarters full or more on most of the last two
// weeks' closes (at least 5 days of data). Suggestions wait for the owner; approving one does
// not change any setting.
export async function suggestions(db, scenario, day) {
  const since = addDays(day, -(SUGGEST_WINDOW_DAYS - 1));
  const r = await db.execute({
    sql: `SELECT c.day, l.bin_id, l.level FROM check_levels l JOIN topping_checks c ON c.id = l.check_id
          WHERE c.location_id = ? AND c.scenario = ? AND c.kind = 'close' AND c.day BETWEEN ? AND ?`,
    args: [LOCATION, scenario, since, day]
  });
  const per = new Map();
  for (const row of r.rows) {
    const p = per.get(row.bin_id) || { days: 0, high: 0, sum: 0 };
    p.days++;
    p.sum += Number(row.level);
    if (Number(row.level) >= HIGH_CLOSE) p.high++;
    per.set(row.bin_id, p);
  }
  const list = await bins(db, scenario);
  const want = new Set();
  const stmts = [];
  for (const b of list) {
    const p = per.get(b.id);
    if (!p || p.days < SUGGEST_MIN_DAYS || p.high * 2 <= p.days) continue;
    const id = `${scenario}:${b.id}:smaller_pan`;
    want.add(id);
    const evidence = JSON.stringify({ days: p.days, highDays: p.high, avgClose: Math.round((p.sum / p.days) * 100) / 100, from: since, to: day });
    stmts.push({
      sql: `INSERT INTO suggestions (id, location_id, scenario, bin_id, kind, evidence_json, status, created_at) VALUES (?, ?, ?, ?, 'smaller_pan', ?, 'open', ?)
            ON CONFLICT (id) DO UPDATE SET evidence_json = excluded.evidence_json WHERE suggestions.status = 'open'`,
      args: [id, LOCATION, scenario, b.id, evidence, now()]
    });
  }
  // Open suggestions that no longer hold go away; decided ones stay as history.
  const open = await db.execute({ sql: "SELECT id FROM suggestions WHERE location_id = ? AND scenario = ? AND status = 'open'", args: [LOCATION, scenario] });
  for (const o of open.rows) if (!want.has(o.id)) stmts.push({ sql: "DELETE FROM suggestions WHERE id = ?", args: [o.id] });
  if (stmts.length) await db.batch(stmts, "write");
  const out = await db.execute({ sql: "SELECT id, bin_id, kind, evidence_json, status, decided_at FROM suggestions WHERE location_id = ? AND scenario = ? ORDER BY created_at", args: [LOCATION, scenario] });
  const names = Object.fromEntries(list.map(b => [b.id, b.name]));
  return out.rows.filter(s => names[s.bin_id]).map(s => ({ id: s.id, binId: s.bin_id, bin: names[s.bin_id], kind: s.kind, status: s.status, decidedAt: s.decided_at, evidence: JSON.parse(s.evidence_json) }));
}

export async function decide(db, id, decision, deviceId) {
  if (!["approved", "dismissed"].includes(decision)) return false;
  const r = await db.execute({ sql: "UPDATE suggestions SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND location_id = ? AND status = 'open'", args: [decision, now(), deviceId, String(id || ""), LOCATION] });
  return r.rowsAffected > 0;
}

// Waste over the last `days` days: toppings in pans (dollars only where the owner entered a
// pan cost) and boba in drinks. kg CO2e needs an emissions factor nobody has set yet.
export async function totals(db, scenario, day, days = 7) {
  const since = addDays(day, -(days - 1));
  const r = await db.execute({
    sql: "SELECT item_type, item_key, amount FROM waste_log WHERE location_id = ? AND scenario = ? AND day BETWEEN ? AND ?",
    args: [LOCATION, scenario, since, day]
  });
  const list = await bins(db, scenario);
  const cost = Object.fromEntries(list.map(b => [b.id, b.pan_cost]));
  const name = Object.fromEntries(list.map(b => [b.id, b.name]));
  const byBin = {};
  let pans = 0, dollars = 0, pansNoCost = 0, bobaDrinks = 0;
  for (const w of r.rows) {
    const amt = Number(w.amount);
    if (w.item_type === "boba") { bobaDrinks += amt; continue; }
    pans += amt;
    const c = cost[w.item_key];
    if (c != null) dollars += amt * c; else pansNoCost += amt;
    const b = byBin[w.item_key] || (byBin[w.item_key] = { binId: w.item_key, bin: name[w.item_key] || "?", pans: 0, dollars: c == null ? null : 0 });
    b.pans += amt;
    if (c != null) b.dollars += amt * c;
  }
  const co2eKgPerPan = Number(process.env.TOPPING_CO2E_KG_PER_PAN);
  return {
    from: since, to: day, days, pans, dollars: Math.round(dollars * 100) / 100, pansNoCost, bobaDrinks,
    co2eKg: Number.isFinite(co2eKgPerPan) && co2eKgPerPan > 0 ? Math.round(pans * co2eKgPerPan * 10) / 10 : null,
    byBin: Object.values(byBin).sort((a, b) => b.pans - a.pans)
  };
}

// Morning guidance from yesterday's usage: how many pans to set out per bin.
export async function guidance(db, scenario, day) {
  const y = addDays(day, -1);
  const args = [LOCATION, scenario, y];
  const [levels, refills, list] = await Promise.all([
    db.execute({ sql: "SELECT c.kind, l.bin_id, l.level FROM check_levels l JOIN topping_checks c ON c.id = l.check_id WHERE c.location_id = ? AND c.scenario = ? AND c.day = ?", args }),
    db.execute({ sql: "SELECT bin_id, amount FROM refills WHERE location_id = ? AND scenario = ? AND day = ?", args }),
    bins(db, scenario)
  ]);
  const lv = { open: {}, close: {} };
  levels.rows.forEach(r => { lv[r.kind][r.bin_id] = Number(r.level); });
  return {
    day, yesterday: y,
    bins: list.map(b => {
      const u = usage({ open: lv.open[b.id] ?? null, close: lv.close[b.id] ?? null, refills: refills.rows.filter(r => r.bin_id === b.id).map(r => ({ amount: Number(r.amount) })) });
      const used = u.used == null || u.negative ? null : u.used;
      return { binId: b.id, bin: b.name, fresh: discards(b), usedYesterday: used, setOut: used == null ? null : Math.max(0.5, Math.ceil(used * 2) / 2) };
    })
  };
}

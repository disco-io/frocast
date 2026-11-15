// Demo mode setup. Only touches rows with scenario 'demo'; live data is never read or changed.
//   GET  /api/demo                 -> { seeded, days }
//   POST /api/demo { action: "reset" }   clear all demo rows, then seed demo bins and two weeks
//                                        of SIMULATED topping history before each demo day
//   POST /api/demo { action: "reset", scenario: "bowls", cups? }   table demo: clear its checks
//                                        and photos and set up the fruit cups (no history).
//                                        cups: the fruit in each cup, left to right (default: one
//                                        cup of strawberries)
import { ready, LOCATION, now } from "./_lib/db.js";
import { requireDevice, sendError } from "./_lib/auth.js";
import { DEMO_DAYS, DEMO_BINS, cupBins, demoHistory } from "../js/demo-data.js";

const SIM_DEVICE = "demo-sim";

async function seed(db) {
  const stmts = [
    ...["batches", "batch_events", "waste_log", "refills", "photos", "topping_checks"].map(tbl =>
      ({ sql: `DELETE FROM ${tbl} WHERE location_id = ? AND scenario = 'demo'`, args: [LOCATION] })),
    { sql: "DELETE FROM check_levels WHERE location_id = ? AND check_id LIKE 'demo:%'", args: [LOCATION] },
    { sql: "DELETE FROM bins WHERE location_id = ? AND scenario = 'demo'", args: [LOCATION] },
    { sql: "INSERT INTO devices (id, location_id, name, created_at) VALUES (?, ?, 'Demo history (simulated)', ?) ON CONFLICT (id) DO NOTHING", args: [SIM_DEVICE, LOCATION, now()] }
  ];
  const ids = {};
  for (const b of DEMO_BINS) {
    ids[b.name] = `demo-bin-${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    stmts.push({
      sql: "INSERT INTO bins (id, location_id, scenario, name, row_no, col_no, discard_at_close, pan_label, pan_cost, active, created_at, updated_at) VALUES (?, ?, 'demo', ?, ?, ?, ?, ?, ?, 1, ?, ?)",
      args: [ids[b.name], LOCATION, b.name, b.row, b.col, b.discard == null ? null : b.discard ? 1 : 0, b.panLabel, b.panCost, now(), now()]
    });
  }
  let rows = 0;
  for (const d of Object.values(DEMO_DAYS)) {
    for (const h of demoHistory(d.key)) {
      for (const kind of ["open", "close"]) {
        const checkId = `demo:${h.day}:${kind}`;
        stmts.push({
          sql: "INSERT INTO topping_checks (id, location_id, scenario, day, kind, estimator, confirmed_at, device_id) VALUES (?, ?, 'demo', ?, ?, 'simulated', ?, ?)",
          args: [checkId, LOCATION, h.day, kind, `${h.day}T${kind === "open" ? "14" : "03"}:00:00.000Z`, SIM_DEVICE]
        });
        for (const b of h.bins) {
          const level = kind === "open" ? b.open : b.close;
          stmts.push({ sql: "INSERT INTO check_levels (check_id, location_id, bin_id, level, outcome) VALUES (?, ?, ?, ?, 'manual')", args: [checkId, LOCATION, ids[b.name], level] });
          const bin = DEMO_BINS.find(x => x.name === b.name);
          if (kind === "close" && bin.discard !== false && level > 0) {
            stmts.push({
              sql: "INSERT INTO waste_log (id, location_id, scenario, day, item_type, item_key, level, amount, unit, source, ref_id, device_id, created_at) VALUES (?, ?, 'demo', ?, 'topping', ?, ?, ?, 'pans', 'simulated', ?, ?, ?)",
              args: [`topping:${checkId}:${ids[b.name]}`, LOCATION, h.day, ids[b.name], level, level, checkId, SIM_DEVICE, now()]
            });
          }
          rows++;
        }
      }
      for (const b of h.bins.filter(x => x.refill > 0)) {
        stmts.push({
          sql: "INSERT INTO refills (id, location_id, scenario, day, bin_id, amount, at_min, source, device_id, created_at) VALUES (?, ?, 'demo', ?, ?, ?, 900, 'staff', ?, ?)",
          args: [`demo-refill-${h.day}-${ids[b.name]}`, LOCATION, h.day, ids[b.name], b.refill, SIM_DEVICE, now()]
        });
      }
    }
  }
  await db.batch(stmts, "write");
  return { bins: DEMO_BINS.length, levels: rows };
}

// Table demo: one cup of strawberries (or the cups asked for), no history. Only touches rows
// with scenario 'bowls'.
async function seedBowls(db, names) {
  const cups = cupBins(names);
  const stmts = [
    ...["waste_log", "refills", "photos", "topping_checks", "suggestions"].map(tbl =>
      ({ sql: `DELETE FROM ${tbl} WHERE location_id = ? AND scenario = 'bowls'`, args: [LOCATION] })),
    { sql: "DELETE FROM check_levels WHERE location_id = ? AND check_id LIKE 'bowls:%'", args: [LOCATION] },
    { sql: "DELETE FROM bins WHERE location_id = ? AND scenario = 'bowls'", args: [LOCATION] }
  ];
  for (const b of cups) {
    stmts.push({
      sql: "INSERT INTO bins (id, location_id, scenario, name, row_no, col_no, discard_at_close, pan_label, pan_cost, active, created_at, updated_at) VALUES (?, ?, 'bowls', ?, ?, ?, ?, ?, ?, 1, ?, ?)",
      args: [`bowl-${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, LOCATION, b.name, b.row, b.col, b.discard ? 1 : 0, b.panLabel, b.panCost, now(), now()]
    });
  }
  await db.batch(stmts, "write");
  return { bins: cups.length };
}

export default async function handler(req, res) {
  try {
    if (!(await requireDevice(req))) return sendError(res, 401, "This device isn't paired");
    const db = await ready();
    if (req.method === "GET") {
      const r = await db.execute({ sql: "SELECT COUNT(*) AS n FROM bins WHERE location_id = ? AND scenario = 'demo' AND active = 1", args: [LOCATION] });
      return res.status(200).json({ seeded: Number(r.rows[0].n) > 0, days: DEMO_DAYS });
    }
    if (req.method === "POST" && req.body?.action === "reset" && req.body.scenario === "bowls") return res.status(200).json({ reset: true, ...(await seedBowls(db, req.body.cups)) });
    if (req.method === "POST" && req.body?.action === "reset") return res.status(200).json({ reset: true, ...(await seed(db)) });
    return sendError(res, 400, "Use GET, or POST { action: \"reset\" }");
  } catch (err) {
    console.error("demo", err);
    return sendError(res, 500, "Server error");
  }
}

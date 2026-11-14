// Batch clock actions. Live times come from the server clock in the shop's time zone;
// demo mode (scenario "demo") passes its own simulated day and minute.
//   GET  /api/boba?day=&scenario=                    -> { now, batches, lows, waste }
//   POST /api/boba { action: "cooked", frac, recommended }
//   POST /api/boba { action: "low" }                 "Running low"
//   POST /api/boba { action: "leftover", batchId, level }   level 0 / 0.25 / 0.5 / 0.75
//   POST /api/boba { action: "undo", batchId }       remove a batch tapped by mistake
//   POST /api/boba { action: "reset", scenario: "demo" }    clear demo rows
import { ready, LOCATION, now } from "./_lib/db.js";
import { requireDevice, sendError } from "./_lib/auth.js";
import { shopNow, isDay, isMin } from "./_lib/shop-time.js";

const FRACS = [0.25, 0.5, 0.75, 1];
const LEVELS = [0, 0.25, 0.5, 0.75, 1];
const DEFAULT_BATCH = 20;

function when(req) {
  const b = req.method === "GET" ? req.query || {} : req.body || {};
  const scenario = b.scenario === "demo" ? "demo" : "live";
  const live = shopNow();
  if (scenario === "demo") {
    const min = Number(b.min);
    return { scenario, day: isDay(b.day) ? b.day : live.day, min: isMin(min) ? min : live.min };
  }
  return { scenario, day: isDay(b.day) ? b.day : live.day, min: live.min, today: live.day };
}

// Demo replays as a pure function of the slider: only what happened up to `upTo` is returned,
// so dragging back hides later taps and dragging forward shows them again.
async function dayData(db, scenario, day, upTo = 24 * 60) {
  const args = [LOCATION, scenario, day, upTo];
  const [b, e, w] = await Promise.all([
    db.execute({ sql: "SELECT id, ready_min, frac, servings, recommended_frac, leftover_level, source FROM batches WHERE location_id = ? AND scenario = ? AND day = ? AND ready_min <= ? ORDER BY ready_min, created_at", args }),
    db.execute({ sql: "SELECT at_min FROM batch_events WHERE location_id = ? AND scenario = ? AND day = ? AND type = 'low' AND at_min <= ? ORDER BY at_min", args }),
    db.execute({ sql: "SELECT w.id, w.item_type, w.item_key, w.level, w.amount, w.unit, w.source, w.ref_id FROM waste_log w JOIN batches b ON b.id = w.ref_id WHERE w.location_id = ? AND w.scenario = ? AND w.day = ? AND b.ready_min <= ? AND w.item_type = 'boba'", args })
  ]);
  return {
    batches: b.rows.map(r => ({ id: r.id, readyMin: Number(r.ready_min), frac: Number(r.frac), servings: Number(r.servings),
      recommendedFrac: r.recommended_frac == null ? null : Number(r.recommended_frac), source: r.source || "staff",
      leftoverLevel: r.leftover_level == null ? null : Number(r.leftover_level), leftoverLogged: r.leftover_level != null })),
    lows: e.rows.map(r => Number(r.at_min)),
    waste: w.rows.map(r => ({ ...r, level: Number(r.level), amount: Number(r.amount) }))
  };
}

export default async function handler(req, res) {
  try {
    const device = await requireDevice(req);
    if (!device) return sendError(res, 401, "This device isn't paired");
    const db = await ready();
    const t = when(req);

    if (req.method === "GET") {
      return res.status(200).json({ now: { day: t.day, min: t.min, scenario: t.scenario }, ...(await dayData(db, t.scenario, t.day, t.scenario === "demo" ? t.min : 24 * 60)) });
    }
    if (req.method !== "POST") return sendError(res, 405, "Use GET or POST");
    const { action, frac, recommended, batchId, level, batchSize } = req.body || {};

    if (action === "cooked") {
      if (!FRACS.includes(Number(frac))) return sendError(res, 400, "Size must be ¼, ½, ¾ or full");
      const size = Number(batchSize) > 0 && Number(batchSize) <= 500 ? Number(batchSize) : DEFAULT_BATCH;
      const id = crypto.randomUUID();
      const source = t.scenario === "demo" && req.body.source === "demo-auto" ? "demo-auto" : "staff";
      await db.execute({
        sql: "INSERT INTO batches (id, location_id, scenario, day, ready_min, frac, servings, recommended_frac, source, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [id, LOCATION, t.scenario, t.day, t.min, Number(frac), Number(frac) * size, FRACS.includes(Number(recommended)) ? Number(recommended) : null, source, device.id, now()]
      });
      return res.status(200).json({ id, readyMin: t.min, day: t.day });
    }
    if (action === "low") {
      await db.execute({
        sql: "INSERT INTO batch_events (id, location_id, scenario, day, at_min, type, device_id, created_at) VALUES (?, ?, ?, ?, ?, 'low', ?, ?)",
        args: [crypto.randomUUID(), LOCATION, t.scenario, t.day, t.min, device.id, now()]
      });
      return res.status(200).json({ atMin: t.min });
    }
    if (action === "leftover") {
      if (!LEVELS.includes(Number(level))) return sendError(res, 400, "Level must be 0, ¼, ½, ¾ or full");
      const r = await db.execute({ sql: "SELECT id, day, servings FROM batches WHERE id = ? AND location_id = ? AND scenario = ?", args: [String(batchId || ""), LOCATION, t.scenario] });
      const batch = r.rows[0];
      if (!batch) return sendError(res, 404, "No such batch");
      const amount = Number(level) * Number(batch.servings);
      await db.batch([
        { sql: "UPDATE batches SET leftover_level = ?, leftover_at = ? WHERE id = ?", args: [Number(level), now(), batch.id] },
        { sql: "INSERT INTO waste_log (id, location_id, scenario, day, item_type, item_key, level, amount, unit, source, ref_id, device_id, created_at) VALUES (?, ?, ?, ?, 'boba', 'boba', ?, ?, 'drinks', ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET level = excluded.level, amount = excluded.amount, source = excluded.source, created_at = excluded.created_at",
          args: [`boba-${batch.id}`, LOCATION, t.scenario, batch.day, Number(level), amount, t.scenario === "demo" && req.body.source === "demo-auto" ? "demo-auto" : "staff", batch.id, device.id, now()] }
      ], "write");
      return res.status(200).json({ batchId: batch.id, level: Number(level), amount });
    }
    if (action === "undo") {
      await db.batch([
        { sql: "DELETE FROM batches WHERE id = ? AND location_id = ? AND scenario = ?", args: [String(batchId || ""), LOCATION, t.scenario] },
        { sql: "DELETE FROM waste_log WHERE id = ? AND location_id = ?", args: [`boba-${String(batchId || "")}`, LOCATION] }
      ], "write");
      return res.status(200).json({ removed: String(batchId || "") });
    }
    if (action === "reset") {
      if (t.scenario !== "demo") return sendError(res, 400, "Only demo data can be reset");
      await db.batch(["batches", "batch_events", "waste_log"].map(tbl => ({ sql: `DELETE FROM ${tbl} WHERE location_id = ? AND scenario = 'demo'`, args: [LOCATION] })), "write");
      return res.status(200).json({ reset: true });
    }
    return sendError(res, 400, "Unknown action");
  } catch (err) {
    console.error("boba", err);
    return sendError(res, 500, err.message?.includes("not set") ? err.message : "Server error");
  }
}

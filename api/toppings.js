// Topping bar check (feature flag TOPPING_CAMERA).
//   GET  /api/toppings?flags=1                 -> { enabled }
//   GET  /api/toppings?day=&scenario=          -> { bins, checks: { open, close }, refills, waste, usage }
//   GET  /api/toppings?photo=<id>              -> the JPEG (paired devices only)
//   POST { action: "saveBin", bin }            (owner) add or edit a bin
//   POST { action: "deleteBin", id }           (owner) hide a bin
//   POST { action: "refill", binId, amount, source?, min? }   amount 1 (full pan) or 0.5
//   POST { action: "undoRefill", id }
//   POST { action: "confirm", kind, levels: [{ binId, level, estimate? }], photoId?, estimator?, model?, problems? }
//        Close checks write the close level of "discarded" bins to the waste log (pans).
import { ready, LOCATION, now } from "./_lib/db.js";
import { requireDevice, requireOwner, sendError } from "./_lib/auth.js";
import { toppingsEnabled } from "./_lib/photos.js";
import { shopNow, isDay, isMin } from "./_lib/shop-time.js";
import { isLevel, REFILLS, usage, discards, outcome } from "../js/toppings-math.js";

function when(src) {
  const scenario = src.scenario === "demo" ? "demo" : "live";
  const live = shopNow();
  const min = Number(src.min);
  return {
    scenario,
    day: isDay(src.day) && scenario === "demo" ? src.day : (isDay(src.day) && src.day <= live.day ? src.day : live.day),
    min: scenario === "demo" && isMin(min) ? min : live.min
  };
}

const num = v => (v == null ? null : Number(v));

async function loadBins(db, scenario = "live") {
  const r = await db.execute({ sql: "SELECT id, name, row_no, col_no, discard_at_close, pan_label, pan_cost FROM bins WHERE location_id = ? AND scenario = ? AND active = 1 ORDER BY row_no, col_no, name", args: [LOCATION, scenario] });
  return r.rows.map(b => ({ id: b.id, name: b.name, row_no: Number(b.row_no), col_no: Number(b.col_no),
    discard_at_close: b.discard_at_close == null ? null : Number(b.discard_at_close), pan_label: b.pan_label, pan_cost: num(b.pan_cost) }));
}

async function dayData(db, t) {
  const args = [LOCATION, t.scenario, t.day];
  const [bins, checks, levels, refills, waste, devices, photos] = await Promise.all([
    loadBins(db, t.scenario),
    db.execute({ sql: "SELECT * FROM topping_checks WHERE location_id = ? AND scenario = ? AND day = ?", args }),
    db.execute({ sql: "SELECT l.* FROM check_levels l JOIN topping_checks c ON c.id = l.check_id WHERE c.location_id = ? AND c.scenario = ? AND c.day = ?", args }),
    db.execute({ sql: "SELECT id, bin_id, amount, at_min, source, device_id FROM refills WHERE location_id = ? AND scenario = ? AND day = ? ORDER BY at_min", args }),
    db.execute({ sql: "SELECT id, item_key, level, amount, unit, source, ref_id FROM waste_log WHERE location_id = ? AND scenario = ? AND day = ? AND item_type = 'topping'", args }),
    db.execute({ sql: "SELECT id, name FROM devices WHERE location_id = ?", args: [LOCATION] }),
    db.execute({ sql: "SELECT id, kind, created_at FROM photos WHERE location_id = ? AND scenario = ? AND day = ?", args })
  ]);
  const names = Object.fromEntries(devices.rows.map(d => [d.id, d.name]));
  const photoIds = new Set(photos.rows.map(p => p.id));
  const out = { open: null, close: null };
  for (const c of checks.rows) {
    out[c.kind] = {
      id: c.id, kind: c.kind, confirmedAt: c.confirmed_at, confirmedBy: names[c.device_id] || "a staff device",
      photoId: c.photo_id && photoIds.has(c.photo_id) ? c.photo_id : null, photoDeleted: !!c.photo_id && !photoIds.has(c.photo_id),
      estimator: c.estimator, model: c.model, problems: c.problems_json ? JSON.parse(c.problems_json) : [], levels: {}
    };
  }
  for (const l of levels.rows) {
    const c = Object.values(out).find(x => x && x.id === l.check_id);
    if (c) c.levels[l.bin_id] = { level: Number(l.level), estimated: num(l.estimated_level), confidence: l.confidence, visible: l.visible == null ? null : !!l.visible, outcome: l.outcome };
  }
  const refillRows = refills.rows.map(r => ({ id: r.id, binId: r.bin_id, amount: Number(r.amount), atMin: Number(r.at_min), source: r.source, by: names[r.device_id] || "a staff device" }));
  const use = bins.map(b => ({
    binId: b.id,
    ...usage({ open: out.open?.levels[b.id]?.level ?? null, close: out.close?.levels[b.id]?.level ?? null, refills: refillRows.filter(r => r.binId === b.id) })
  }));
  return { bins, checks: out, refills: refillRows, waste: waste.rows.map(w => ({ ...w, level: Number(w.level), amount: Number(w.amount) })), usage: use };
}

export default async function handler(req, res) {
  try {
    const device = await requireDevice(req);
    if (!device) return sendError(res, 401, "This device isn't paired");
    if (req.method === "GET" && req.query?.flags) return res.status(200).json({ enabled: toppingsEnabled() });
    if (!toppingsEnabled()) return sendError(res, 404, "Topping check is turned off");
    const db = await ready();

    if (req.method === "GET") {
      if (req.query?.photo) {
        const r = await db.execute({ sql: "SELECT mime, data FROM photos WHERE id = ? AND location_id = ?", args: [String(req.query.photo), LOCATION] });
        if (!r.rows[0]) return sendError(res, 404, "Photo deleted or not found");
        res.setHeader("content-type", r.rows[0].mime);
        res.setHeader("cache-control", "private, no-store");
        return res.end(Buffer.from(r.rows[0].data));
      }
      return res.status(200).json({ ...(await dayData(db, when(req.query || {}))), owner: !!(await requireOwner(req)) });
    }
    if (req.method !== "POST") return sendError(res, 405, "Use GET or POST");
    const body = req.body || {};
    const t = when(body);

    if (body.action === "saveBin" || body.action === "deleteBin") {
      if (!(await requireOwner(req))) return sendError(res, 403, "Owner PIN required");
      if (body.action === "deleteBin") {
        await db.execute({ sql: "UPDATE bins SET active = 0, updated_at = ? WHERE id = ? AND location_id = ?", args: [now(), String(body.id || ""), LOCATION] });
        return res.status(200).json({ removed: String(body.id || "") });
      }
      const b = body.bin || {};
      const name = String(b.name || "").trim().slice(0, 40);
      const row = Math.round(Number(b.row)), col = Math.round(Number(b.col));
      if (!name || !(row >= 1 && row <= 6) || !(col >= 1 && col <= 20)) return sendError(res, 400, "Give the bin a name, a row (1-6) and a column (1-20)");
      const discard = b.discard === true ? 1 : b.discard === false ? 0 : null;
      const label = b.panLabel ? String(b.panLabel).trim().slice(0, 40) : null;
      const cost = b.panCost === "" || b.panCost == null || !(Number(b.panCost) >= 0) ? null : Math.round(Number(b.panCost) * 100) / 100;
      const id = b.id ? String(b.id) : crypto.randomUUID();
      await db.execute({
        sql: `INSERT INTO bins (id, location_id, scenario, name, row_no, col_no, discard_at_close, pan_label, pan_cost, active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
              ON CONFLICT (id) DO UPDATE SET name = excluded.name, row_no = excluded.row_no, col_no = excluded.col_no,
                discard_at_close = excluded.discard_at_close, pan_label = excluded.pan_label, pan_cost = excluded.pan_cost, active = 1, updated_at = excluded.updated_at`,
        args: [id, LOCATION, t.scenario, name, row, col, discard, label, cost, now(), now()]
      });
      return res.status(200).json({ id });
    }

    if (body.action === "refill") {
      if (!REFILLS.includes(Number(body.amount))) return sendError(res, 400, "Refill is a full or half pan");
      const id = crypto.randomUUID();
      await db.execute({
        sql: "INSERT INTO refills (id, location_id, scenario, day, bin_id, amount, at_min, source, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [id, LOCATION, t.scenario, t.day, String(body.binId || ""), Number(body.amount), t.min, body.source === "missed" ? "missed" : "staff", device.id, now()]
      });
      return res.status(200).json({ id, atMin: t.min });
    }
    if (body.action === "undoRefill") {
      await db.execute({ sql: "DELETE FROM refills WHERE id = ? AND location_id = ?", args: [String(body.id || ""), LOCATION] });
      return res.status(200).json({ removed: String(body.id || "") });
    }

    if (body.action === "confirm") {
      if (!["open", "close"].includes(body.kind)) return sendError(res, 400, "kind must be open or close");
      const bins = await loadBins(db, t.scenario);
      const given = new Map((body.levels || []).map(l => [String(l.binId), l]));
      const missing = bins.filter(b => !given.has(b.id) || !isLevel(given.get(b.id).level));
      if (missing.length) return sendError(res, 400, `Set a level for every bin (missing: ${missing.map(b => b.name).join(", ")})`);
      const checkId = `${t.scenario}:${t.day}:${body.kind}`;
      const est = body.estimator === "vision";
      const stmts = [
        { sql: "DELETE FROM check_levels WHERE check_id = ? AND location_id = ?", args: [checkId, LOCATION] },
        { sql: "DELETE FROM waste_log WHERE ref_id = ? AND location_id = ?", args: [checkId, LOCATION] },
        {
          sql: `INSERT INTO topping_checks (id, location_id, scenario, day, kind, photo_id, estimator, model, photo_usable, problems_json, confirmed_at, device_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET photo_id = excluded.photo_id, estimator = excluded.estimator, model = excluded.model, photo_usable = excluded.photo_usable,
                  problems_json = excluded.problems_json, confirmed_at = excluded.confirmed_at, device_id = excluded.device_id`,
          args: [checkId, LOCATION, t.scenario, t.day, body.kind, body.photoId ? String(body.photoId) : null, est ? "vision" : "none",
            est && body.model ? String(body.model).slice(0, 60) : null, est ? (body.photoUsable ? 1 : 0) : null,
            JSON.stringify(Array.isArray(body.problems) ? body.problems.slice(0, 10).map(String) : []), now(), device.id]
        }
      ];
      for (const b of bins) {
        const l = given.get(b.id);
        const e = est && l.estimate && isLevel(l.estimate.level) ? l.estimate : null;
        stmts.push({
          sql: "INSERT INTO check_levels (check_id, location_id, bin_id, level, estimated_level, confidence, visible, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          args: [checkId, LOCATION, b.id, Number(l.level), e ? Number(e.level) : null, e ? String(e.confidence) : null, e ? (e.visible ? 1 : 0) : null, outcome(e, l.level)]
        });
        if (body.kind === "close" && discards(b) && Number(l.level) > 0) {
          stmts.push({
            sql: "INSERT INTO waste_log (id, location_id, scenario, day, item_type, item_key, level, amount, unit, source, ref_id, device_id, created_at) VALUES (?, ?, ?, ?, 'topping', ?, ?, ?, 'pans', ?, ?, ?, ?)",
            args: [`topping:${checkId}:${b.id}`, LOCATION, t.scenario, t.day, b.id, Number(l.level), Number(l.level), est ? "photo" : "staff", checkId, device.id, now()]
          });
        }
      }
      await db.batch(stmts, "write");
      const data = await dayData(db, t);
      return res.status(200).json({ checkId, usage: data.usage, negatives: data.usage.filter(u => u.negative).map(u => u.binId) });
    }
    return sendError(res, 400, "Unknown action");
  } catch (err) {
    console.error("toppings", err);
    return sendError(res, 500, err.message?.includes("not set") ? err.message : "Server error");
  }
}

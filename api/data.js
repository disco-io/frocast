// Shared app data in Turso, so every paired device sees the same settings, events and logs.
//   GET /api/data            -> { state: { s, events, logs, showSample }, updated: { key: iso } }
//   PUT /api/data { state }  -> saves any of those keys (last write wins per key)
import { ready, LOCATION, now } from "./_lib/db.js";
import { requireDevice, sendError } from "./_lib/auth.js";

export const KEYS = ["s", "events", "logs", "showSample"];
const MAX_BYTES = 512 * 1024;

export default async function handler(req, res) {
  try {
    if (!(await requireDevice(req))) return sendError(res, 401, "This device isn't paired");
    const db = await ready();

    if (req.method === "GET") {
      const r = await db.execute({ sql: "SELECT key, value_json, updated_at FROM app_state WHERE location_id = ?", args: [LOCATION] });
      const state = {}, updated = {};
      r.rows.forEach(row => {
        if (!KEYS.includes(row.key)) return;
        state[row.key] = JSON.parse(row.value_json);
        updated[row.key] = row.updated_at;
      });
      return res.status(200).json({ state, updated });
    }

    if (req.method === "PUT") {
      const incoming = req.body?.state;
      if (!incoming || typeof incoming !== "object") return sendError(res, 400, "Send { state }");
      const t = now(), stmts = [];
      for (const key of KEYS) {
        if (!(key in incoming)) continue;
        const json = JSON.stringify(incoming[key]);
        if (json === undefined || json.length > MAX_BYTES) return sendError(res, 413, `${key} is too large`);
        stmts.push({
          sql: "INSERT INTO app_state (location_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (location_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
          args: [LOCATION, key, json, t]
        });
      }
      if (stmts.length) await db.batch(stmts, "write");
      return res.status(200).json({ saved: stmts.length, updated_at: t });
    }
    return sendError(res, 405, "Use GET or PUT");
  } catch (err) {
    console.error("data", err);
    return sendError(res, 500, err.message?.includes("not set") ? err.message : "Server error");
  }
}

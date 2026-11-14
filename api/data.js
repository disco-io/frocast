// Shared app data in Turso, so every paired device sees the same settings, events and logs.
//   GET /api/data                  -> { state: { s, events, logs, showSample }, updated: { key: iso } }
//   PUT /api/data { base, state }  -> merges this device's changes (state vs. base) into the
//                                     server copy and returns the merged { state }
// Without `base`, the sent state replaces the server copy (old clients).
import { ready, LOCATION, now } from "./_lib/db.js";
import { requireDevice, sendError } from "./_lib/auth.js";
import { mergeState } from "../js/merge.js";

export const KEYS = ["s", "events", "logs", "showSample"];
const MAX_BYTES = 512 * 1024;

async function readState(q) {
  const r = await q.execute({ sql: "SELECT key, value_json, updated_at FROM app_state WHERE location_id = ?", args: [LOCATION] });
  const state = {}, updated = {};
  r.rows.forEach(row => {
    if (!KEYS.includes(row.key)) return;
    state[row.key] = JSON.parse(row.value_json);
    updated[row.key] = row.updated_at;
  });
  return { state, updated };
}

export default async function handler(req, res) {
  try {
    if (!(await requireDevice(req))) return sendError(res, 401, "This device isn't paired");
    const db = await ready();

    if (req.method === "GET") return res.status(200).json(await readState(db));

    if (req.method === "PUT") {
      const incoming = req.body?.state;
      if (!incoming || typeof incoming !== "object") return sendError(res, 400, "Send { state }");
      const tx = await db.transaction("write");
      try {
        const current = (await readState(tx)).state;
        const base = req.body.base && typeof req.body.base === "object" ? req.body.base : current;
        const merged = mergeState(base, incoming, current);
        const t = now();
        let saved = 0;
        for (const key of KEYS) {
          if (!(key in merged) || JSON.stringify(merged[key]) === JSON.stringify(current[key])) continue;
          const json = JSON.stringify(merged[key]);
          if (json.length > MAX_BYTES) { await tx.rollback(); return sendError(res, 413, `${key} is too large`); }
          await tx.execute({
            sql: "INSERT INTO app_state (location_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (location_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
            args: [LOCATION, key, json, t]
          });
          saved++;
        }
        await tx.commit();
        return res.status(200).json({ state: merged, saved, updated_at: t });
      } finally {
        tx.close();
      }
    }
    return sendError(res, 405, "Use GET or PUT");
  } catch (err) {
    console.error("data", err);
    return sendError(res, 500, err.message?.includes("not set") ? err.message : "Server error");
  }
}

// Topping photos live in Turso (downscaled JPEGs) and are deleted after the retention period.
import { LOCATION } from "./db.js";

export const DEFAULT_PHOTO_DAYS = 14;
export const MAX_PHOTO_BYTES = 2.5 * 1024 * 1024;

export const toppingsEnabled = () => ["1", "true", "on", "yes"].includes(String(process.env.TOPPING_CAMERA || "").toLowerCase());

// Retention in days, from the shared settings (Settings tab: photoDays).
export async function photoDays(db) {
  const r = await db.execute({ sql: "SELECT value_json FROM app_state WHERE location_id = ? AND key = 's'", args: [LOCATION] });
  const days = Number(r.rows[0] ? JSON.parse(r.rows[0].value_json).photoDays : NaN);
  return Number.isFinite(days) && days >= 1 && days <= 365 ? days : DEFAULT_PHOTO_DAYS;
}

export async function purgeOld(db) {
  const days = await photoDays(db);
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const r = await db.execute({ sql: "DELETE FROM photos WHERE location_id = ? AND created_at < ?", args: [LOCATION, cutoff] });
  return { days, deleted: r.rowsAffected };
}

// "data:image/jpeg;base64,...." -> { mime, base64, bytes } or null
export function parseDataUrl(url) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(url || ""));
  if (!m) return null;
  const bytes = Math.floor((m[2].length * 3) / 4);
  return bytes > MAX_PHOTO_BYTES ? { tooBig: true } : { mime: m[1], base64: m[2], bytes };
}

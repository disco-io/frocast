// Device pairing and owner PIN checks for the api functions.
import { ready, LOCATION, now } from "./db.js";
import { deviceFromCookie, ownerFromCookie, sign, secret } from "./token.js";

const DEV_PIN = "0000";
export const MAX_FAILS = 5;
export const FAIL_WINDOW_MIN = 15;

export function ownerPin() {
  const pin = process.env.OWNER_PIN;
  if (pin) return pin;
  if (process.env.VERCEL) throw new Error("OWNER_PIN is not set");
  return DEV_PIN;
}

export const isSecure = req => (req.headers["x-forwarded-proto"] || "").includes("https") || !!process.env.VERCEL;

export function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

// Pairing (the PIN screen) is off for local runs so the app opens straight away.
// It turns on when deployed on Vercel, or locally with REQUIRE_PAIRING=1. (middleware.js repeats this one-liner.)
export const pairingOn = () => process.env.REQUIRE_PAIRING === "1" || !!process.env.VERCEL;

// A paired, non-revoked device for this location, or null. With pairing off, every browser counts as paired.
export async function requireDevice(req) {
  if (!pairingOn()) return { id: "local", name: "This device" };
  const tok = await deviceFromCookie(req.headers.cookie);
  if (!tok || tok.location !== LOCATION) return null;
  const db = await ready();
  const r = await db.execute({ sql: "SELECT id, name, last_seen_at, revoked_at FROM devices WHERE id = ? AND location_id = ?", args: [tok.id, LOCATION] });
  const row = r.rows[0];
  if (!row || row.revoked_at) return null;
  if (!row.last_seen_at || Date.now() - Date.parse(row.last_seen_at) > 10 * 60 * 1000) {
    await db.execute({ sql: "UPDATE devices SET last_seen_at = ? WHERE id = ?", args: [now(), tok.id] });
  }
  return { id: row.id, name: row.name };
}

export async function requireOwner(req) {
  const tok = await ownerFromCookie(req.headers.cookie);
  return tok && tok.location === LOCATION ? tok : null;
}

// Hash the IP so raw addresses never reach the database.
export async function ipHash(req) {
  return (await sign(clientIp(req), secret())).split(".").pop().slice(0, 22);
}

export async function tooManyFails(db, hash) {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60 * 1000).toISOString();
  const r = await db.execute({ sql: "SELECT COUNT(*) AS n FROM pin_attempts WHERE location_id = ? AND ip_hash = ? AND ok = 0 AND at > ?", args: [LOCATION, hash, since] });
  return Number(r.rows[0].n) >= MAX_FAILS;
}

export async function recordAttempt(db, hash, ok) {
  await db.execute({ sql: "INSERT INTO pin_attempts (location_id, ip_hash, at, ok) VALUES (?, ?, ?, ?)", args: [LOCATION, hash, now(), ok ? 1 : 0] });
}

// Constant-time PIN comparison (compare HMACs, not the raw strings).
export async function pinMatches(pin) {
  const a = (await sign(String(pin ?? ""), secret())).split(".").pop();
  const b = (await sign(ownerPin(), secret())).split(".").pop();
  return a === b;
}

export function sendError(res, status, error) {
  res.status(status).json({ error });
}

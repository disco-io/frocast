// Turso / libSQL schema. Every table carries location_id so one deployment can serve
// more than one shop later. Statements are idempotent and run once per cold start.
// Kept as a JS string (not a .sql file) so Vercel bundles it with the api functions.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS pin_attempts (
  location_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  at TEXT NOT NULL,
  ok INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pin_attempts_ip ON pin_attempts (location_id, ip_hash, at);
CREATE TABLE IF NOT EXISTS app_state (
  location_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (location_id, key)
);
`;

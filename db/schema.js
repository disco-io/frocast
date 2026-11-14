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
-- Boba batches from the batch clock. scenario = 'live' or 'demo' (demo rows never mix with live).
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'live',
  day TEXT NOT NULL,
  ready_min INTEGER NOT NULL,
  frac REAL NOT NULL,
  servings REAL NOT NULL,
  recommended_frac REAL,
  leftover_level REAL,
  leftover_at TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS batches_day ON batches (location_id, scenario, day);
CREATE TABLE IF NOT EXISTS batch_events (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'live',
  day TEXT NOT NULL,
  at_min INTEGER NOT NULL,
  type TEXT NOT NULL,
  batch_id TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS batch_events_day ON batch_events (location_id, scenario, day);
-- One waste entry per thing thrown out: a boba batch's leftovers, or a topping bin at close.
-- level = how full it was (0, 0.25, 0.5, 0.75, 1); amount in unit (drinks for boba, pans for toppings).
CREATE TABLE IF NOT EXISTS waste_log (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'live',
  day TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_key TEXT NOT NULL,
  level REAL NOT NULL,
  amount REAL NOT NULL,
  unit TEXT NOT NULL,
  source TEXT NOT NULL,
  ref_id TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS waste_day ON waste_log (location_id, scenario, day);
`;

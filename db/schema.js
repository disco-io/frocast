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
-- Topping bar photo check (feature flag TOPPING_CAMERA).
-- discard_at_close / pan_label / pan_cost are NULL until the owner sets them ("assumed").
CREATE TABLE IF NOT EXISTS bins (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  row_no INTEGER NOT NULL,
  col_no INTEGER NOT NULL,
  discard_at_close INTEGER,
  pan_label TEXT,
  pan_cost REAL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- One open and one close check per day; confirming again replaces it.
CREATE TABLE IF NOT EXISTS topping_checks (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'live',
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  photo_id TEXT,
  estimator TEXT,
  model TEXT,
  photo_usable INTEGER,
  problems_json TEXT,
  confirmed_at TEXT NOT NULL,
  device_id TEXT
);
CREATE INDEX IF NOT EXISTS topping_checks_day ON topping_checks (location_id, scenario, day);
-- outcome: accepted (kept the estimate), corrected (changed it), filled (staff set a "needs a look" bin), manual (no estimate)
CREATE TABLE IF NOT EXISTS check_levels (
  check_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  bin_id TEXT NOT NULL,
  level REAL NOT NULL,
  estimated_level REAL,
  confidence TEXT,
  visible INTEGER,
  outcome TEXT NOT NULL,
  PRIMARY KEY (check_id, bin_id)
);
CREATE TABLE IF NOT EXISTS refills (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'live',
  day TEXT NOT NULL,
  bin_id TEXT NOT NULL,
  amount REAL NOT NULL,
  at_min INTEGER NOT NULL,
  source TEXT NOT NULL,
  device_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS refills_day ON refills (location_id, scenario, day);
-- Downscaled JPEGs, only stored when the photo check passed (never with a person in frame).
-- Deleted after the retention period; the confirmed numbers stay.
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'live',
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  width INTEGER,
  height INTEGER,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_age ON photos (location_id, created_at);
-- Owner-approved suggestions (e.g. "try a smaller pan"). Approving never changes settings by itself.
CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT 'live',
  bin_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
);
`;

// Columns added after the first release (run once each; "duplicate column" means already done).
export const MIGRATIONS = [
  // who/what logged a batch: staff, or the demo's auto-play ('demo-auto')
  "ALTER TABLE batches ADD COLUMN source TEXT NOT NULL DEFAULT 'staff'",
  // demo bins live beside the shop's real bins without mixing
  "ALTER TABLE bins ADD COLUMN scenario TEXT NOT NULL DEFAULT 'live'"
];

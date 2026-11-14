// Shared Turso client for the api functions (files under api/_lib are not routes).
// Production: set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.
// Local: falls back to a SQLite file (local.db, gitignored).
import { createClient } from "@libsql/client";
import { SCHEMA } from "../../db/schema.js";

export const LOCATION = process.env.LOCATION_ID || "nassau-st";

let client = null;
let migrated = null;

export function db() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL || (process.env.VERCEL ? "" : "file:local.db");
    if (!url) throw new Error("TURSO_DATABASE_URL is not set");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}

// Create tables on first use in each cold start.
export async function ready() {
  if (!migrated) migrated = db().executeMultiple(SCHEMA).catch(err => { migrated = null; throw err; });
  await migrated;
  return db();
}

export const now = () => new Date().toISOString();

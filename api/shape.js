// Serves the cached hourly shape (weights only) to the page, on paired devices.
// This NEVER calls BestTime: it only reads what scripts/besttime.js saved in .cache/besttime/.
// No cache (or no key, or a failed fetch) → { source: "baseline" } and the page uses the baseline curve.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOURS } from "../js/config.js";
import { parse, weights } from "../js/shape.js";
import { requireDevice, sendError } from "./_lib/auth.js";

const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".cache",
  "besttime",
);

const read = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));
  } catch {
    return null;
  }
};

export function shape() {
  const cache = read("forecast.json");
  if (cache?.response && cache.confirmedAt) {
    try {
      const p = parse(cache.response);
      return {
        source: "besttime",
        fetched: cache.fetchedAt,
        venue: { name: p.venue.name, address: p.venue.address },
        weights: weights(p.busy, HOURS),
      };
    } catch {
      return { source: "baseline", reason: "error", checked: cache.fetchedAt };
    }
  }
  const fail = read("state.json")?.lastFailure;
  return fail
    ? { source: "baseline", reason: fail.reason, checked: fail.at }
    : { source: "baseline", reason: "no-cache" };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return sendError(res, 405, "Use GET");
    // BestTime's terms allow showing the data in the app, not handing it out: staff devices only.
    if (!(await requireDevice(req)))
      return sendError(res, 401, "This device isn't paired");
    return res.status(200).json(shape());
  } catch (err) {
    console.error("shape", err);
    return sendError(res, 500, "Server error");
  }
}

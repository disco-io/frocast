// Fetches the BestTime.app foot traffic forecast for the shop and caches it. Run by hand, never by the site.
//
//   npm run besttime -- status     show credits used, cache age, anything waiting for confirmation (no API call)
//   npm run besttime -- fetch      first forecast by name + address (2 credits, 1 if it fails)
//   npm run besttime -- confirm    you checked the resolved venue is the right shop: start using it (no API call)
//   npm run besttime -- reject     wrong shop: throw the pending result away (no API call)
//   npm run besttime -- refresh    re-forecast the confirmed venue, at most once a week (2 credits)
//
// Rules this script enforces:
// - The key comes from BESTTIME_PRIVATE_API_KEY (.env). It is never printed, logged or written to disk.
// - Hard cap of CAP credits for the whole project. Every call is written to data/besttime/credits.jsonl
//   (commit that file so teammates share the cap).
// - No retry loops: one retry, only when the connection failed before any reply. Never on an error reply.
// - BestTime's response stays in .cache/besttime/ (git-ignored): their terms forbid redistributing the data.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOURS } from "../js/config.js";
import { parse, weights } from "../js/shape.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, ".cache", "besttime");
const LEDGER = path.join(ROOT, "data", "besttime", "credits.jsonl");
const URL_NEW = "https://besttime.app/api/v1/forecasts";

export const CAP = 20; // forecast credits, total, for this project
export const COST = { ok: 2, failed: 1, serverError: 0 }; // API reference: 2 per successful forecast, 1 if unsuccessful, server errors free
export const REFRESH_DAYS = 7;
// Connection errors that happen before the request leaves this machine
const NOT_SENT = [
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
];
const VENUE = {
  name: "Fruity Yogurt",
  address: "166 Nassau St, Princeton, NJ 08542",
};

// ---------- pure helpers (tested) ----------
export const spent = (entries) =>
  entries.reduce((a, e) => a + (e.credits || 0), 0);
export const canSpend = (entries, cost = COST.ok) =>
  spent(entries) + cost <= CAP;
export const daysSince = (isoTime, now = new Date()) =>
  (now - new Date(isoTime)) / 864e5;

// What a reply cost, and what it means for the app
export function outcome(http, body) {
  if (http >= 500)
    return { ok: false, credits: COST.serverError, reason: "error" };
  if (http === 200 && body?.status === "OK")
    return { ok: true, credits: COST.ok };
  const msg = String(body?.message || "");
  const reason = /not\s+(be\s+)?found|find|geocod/i.test(msg)
    ? "not-found"
    : /forecast|data|enough|visit/i.test(msg)
      ? "no-data"
      : "error";
  return { ok: false, credits: COST.failed, reason };
}

// ---------- files ----------
function loadEnv() {
  try {
    for (const line of fs
      .readFileSync(path.join(ROOT, ".env"), "utf8")
      .split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env))
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env file
  }
}

const read = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));
  } catch {
    return null;
  }
};
const write = (name, data) => {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, name), JSON.stringify(data, null, 1));
};
const remove = (name) => fs.rmSync(path.join(DIR, name), { force: true });

function ledger() {
  try {
    return fs
      .readFileSync(LEDGER, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw new Error(
      "Can't read the credit log (data/besttime/credits.jsonl). Fix it before spending credits.",
    );
  }
}
function record(entry) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.appendFileSync(
    LEDGER,
    JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n",
  );
}

// ---------- the one place that talks to BestTime ----------
async function forecast(params, action) {
  const key = process.env.BESTTIME_PRIVATE_API_KEY;
  if (!key || key === "paste-your-key-here") {
    throw new Error(
      "BESTTIME_PRIVATE_API_KEY is not set. Put it in .env (never commit it). The site keeps using the baseline curve.",
    );
  }
  // BestTime echoes the private key back in its reply (top-level `api_key_private`).
  // Replace it before anything is parsed, printed or saved, so the cache never holds the key.
  const redact = (s) => String(s).split(key).join("[key]");
  const url = `${URL_NEW}?${new URLSearchParams({ api_key_private: key, ...params })}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const log = ledger();
    if (!canSpend(log)) {
      throw new Error(
        `Credit cap reached: ${spent(log)} of ${CAP} credits used. Not calling BestTime.`,
      );
    }
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
      // Never connected (offline, DNS, refused): the request was not sent, so nothing was charged.
      // Anything else with no reply: we can't know, so count the worst case against the cap.
      const unsent = NOT_SENT.includes(err.cause?.code);
      record({
        action,
        outcome: timedOut ? "timeout" : "network-error",
        ...(unsent
          ? { credits: 0, note: "could not connect; request not sent" }
          : {
              credits: COST.ok,
              unconfirmed: true,
              note: "no reply; counted as charged, check the BestTime dashboard",
            }),
      });
      if (timedOut || attempt === 2) {
        throw new Error(
          timedOut
            ? "BestTime did not answer in time. Not retrying."
            : "Network error twice. Not retrying again.",
        );
      }
      console.log("Network error before any reply. Retrying once…");
      continue;
    }
    let body = null;
    try {
      body = JSON.parse(redact(await res.text()));
    } catch {
      // not JSON
    }
    const out = outcome(res.status, body);
    record({
      action,
      http: res.status,
      outcome: out.ok ? "ok" : out.reason,
      credits: out.credits,
      ...(out.ok ? {} : { message: String(body?.message || "").slice(0, 200) }),
    });
    return { ...out, http: res.status, body };
  }
}

// ---------- commands ----------
const fmtH = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;

function describe(resp) {
  const p = parse(resp);
  const w = weights(p.busy, HOURS);
  console.log(
    `Hour mapping from: ${p.hourSource === "hour_analysis" ? "hour_analysis.hour fields" : "documented 6 AM day window"}`,
  );
  for (const dow of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
    if (!w[dow]) {
      console.log(
        `  ${dow}: no busyness in open hours → baseline curve that day`,
      );
      continue;
    }
    const peak = HOURS[w[dow].indexOf(Math.max(...w[dow]))];
    console.log(
      `  ${dow}: busiest open hour ${fmtH(peak)} (${Math.round(Math.max(...w[dow]) * 100)}% of the day)`,
    );
  }
  return p;
}

function fail(out) {
  write("state.json", {
    lastFailure: {
      at: new Date().toISOString(),
      reason: out.reason,
      message: String(out.body?.message || ""),
    },
  });
  console.log(
    `BestTime could not forecast this venue (HTTP ${out.http}${out.body?.message ? `: ${out.body.message}` : ""}).`,
  );
  console.log(
    `Cost: ${out.credits} credit(s). The site keeps using the baseline curve and says so.`,
  );
}

function status() {
  const log = ledger();
  console.log(
    `Credits used: ${spent(log)} of ${CAP} (${log.length} call${log.length === 1 ? "" : "s"} logged)`,
  );
  const pending = read("pending.json");
  const cache = read("forecast.json");
  if (pending)
    console.log(
      `Waiting for your confirmation: "${pending.response.venue_info?.venue_name}", ${pending.response.venue_info?.venue_address}`,
    );
  if (cache)
    console.log(
      `Cached forecast: "${cache.response.venue_info?.venue_name}", fetched ${cache.fetchedAt} (${Math.floor(daysSince(cache.fetchedAt))} days ago)`,
    );
  if (!pending && !cache)
    console.log("No cached forecast: the site uses the baseline curve.");
}

async function fetchNew(args) {
  if (read("pending.json"))
    throw new Error(
      "A result is already waiting for confirmation. Run `confirm` or `reject` first.",
    );
  if (read("forecast.json"))
    throw new Error(
      "A confirmed forecast is already cached. Use `refresh` (at most once a week).",
    );
  const venue = {
    venue_name: args.name || VENUE.name,
    venue_address: args.address || VENUE.address,
  };
  console.log(
    `Asking BestTime for "${venue.venue_name}", ${venue.venue_address} (up to ${COST.ok} credits)…`,
  );
  const out = await forecast(venue, "new-forecast");
  if (!out.ok) return fail(out);
  write("pending.json", {
    fetchedAt: new Date().toISOString(),
    request: venue,
    response: out.body,
  });
  remove("state.json");
  const info = out.body.venue_info || {};
  console.log(
    `\nBestTime matched:\n  name:    ${info.venue_name}\n  address: ${info.venue_address}`,
  );
  console.log(
    `You asked for:\n  name:    ${venue.venue_name}\n  address: ${venue.venue_address}\n`,
  );
  try {
    describe(out.body);
  } catch (err) {
    // Usually: venue found, but no hourly forecast in the reply. `confirm` will refuse it.
    write("state.json", {
      lastFailure: {
        at: new Date().toISOString(),
        reason: "no-data",
        message: err.message,
      },
    });
    console.log(
      `Warning: the reply has no usable hourly forecast (${err.message}). It can't be confirmed; run reject. The site keeps the baseline curve.`,
    );
  }
  console.log(
    `\nCost: ${out.credits} credits (${spent(ledger())} of ${CAP} used). NOT in use yet.`,
  );
  console.log(
    "If that is the right shop: npm run besttime -- confirm     Wrong shop: npm run besttime -- reject",
  );
}

function confirm() {
  const pending = read("pending.json");
  if (!pending) throw new Error("Nothing is waiting for confirmation.");
  parse(pending.response); // refuse to adopt a response we can't read
  write("forecast.json", { ...pending, confirmedAt: new Date().toISOString() });
  remove("pending.json");
  console.log(
    `Confirmed "${pending.response.venue_info?.venue_name}". The site now uses this hourly shape (restart not needed).`,
  );
}

function reject() {
  if (!read("pending.json"))
    throw new Error("Nothing is waiting for confirmation.");
  remove("pending.json");
  console.log(
    "Pending result thrown away. The credits it cost stay in the log.",
  );
}

async function refresh() {
  const cache = read("forecast.json");
  const id = cache?.response?.venue_info?.venue_id;
  if (!cache?.confirmedAt || !id)
    throw new Error("No confirmed forecast to refresh. Run `fetch` first.");
  const age = daysSince(cache.fetchedAt);
  if (age < REFRESH_DAYS) {
    throw new Error(
      `Last fetch was ${age.toFixed(1)} days ago. Refresh at most once every ${REFRESH_DAYS} days.`,
    );
  }
  console.log(
    `Refreshing the forecast for "${cache.response.venue_info.venue_name}" (up to ${COST.ok} credits)…`,
  );
  const out = await forecast({ venue_id: id }, "refresh");
  if (!out.ok) {
    console.log(
      `Refresh failed (HTTP ${out.http}${out.body?.message ? `: ${out.body.message}` : ""}). Cost: ${out.credits} credit(s). Keeping the old cached forecast.`,
    );
    return;
  }
  if (out.body.venue_info?.venue_id !== id) {
    write("pending.json", {
      fetchedAt: new Date().toISOString(),
      request: cache.request,
      response: out.body,
    });
    console.log(
      `BestTime answered with a different venue ("${out.body.venue_info?.venue_name}", ${out.body.venue_info?.venue_address}). Saved as pending: confirm or reject it.`,
    );
    return;
  }
  describe(out.body);
  write("forecast.json", {
    ...cache,
    fetchedAt: new Date().toISOString(),
    response: out.body,
  });
  console.log(
    `Refreshed. Cost: ${out.credits} credits (${spent(ledger())} of ${CAP} used).`,
  );
}

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i];
  }
  return out;
}

async function main() {
  loadEnv();
  const [cmd = "status", ...rest] = process.argv.slice(2);
  const run = {
    status,
    fetch: () => fetchNew(flags(rest)),
    confirm,
    reject,
    refresh,
  }[cmd];
  if (!run)
    throw new Error(
      `Unknown command "${cmd}". Use: status, fetch, confirm, reject, refresh.`,
    );
  await run();
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

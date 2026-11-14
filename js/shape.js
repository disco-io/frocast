// Hourly shape of the day from a cached BestTime.app foot traffic forecast.
// BestTime gives RELATIVE busyness (0–100, where 100 is the venue's busiest hour of the week),
// never customer counts. We only use it to split a day's total across the open hours.
// Pure functions here run in the browser, in api/shape.js and in the tests.
// Nothing in this file calls BestTime: the forecast is fetched by scripts/besttime.js and cached.

// BestTime numbers days 0 = Monday … 6 = Sunday (API reference, day_info.day_int)
const BT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// A "BestTime day" runs 6 AM → 5 AM the next morning (API reference, "Forecast day window")
export const WINDOW_START = 6;
export const STALE_DAYS = 30;

// Which clock hour each day_raw value belongs to.
// Preferred: the `hour` field of hour_analysis, which lists the same day window hour by hour.
// Otherwise: the documented window (index 0 = 6 AM).
function hourOrder(entry) {
  const ha = entry.hour_analysis;
  const fromFields =
    Array.isArray(ha) &&
    ha.length === 24 &&
    ha.every((x) => Number.isInteger(x?.hour));
  const order = fromFields
    ? ha.map((x) => x.hour)
    : Array.from({ length: 24 }, (_, i) => (WINDOW_START + i) % 24);
  const ok = order.every(
    (h, i) => h >= 0 && h <= 23 && (i === 0 || h === (order[i - 1] + 1) % 24),
  );
  if (!ok) throw new Error("BestTime hours are not 24 consecutive hours");
  return { order, source: fromFields ? "hour_analysis" : "documented-window" };
}

// Turn a "new forecast" response into busyness per calendar day and clock hour:
// { busy: { Mon: [24 values, index = clock hour], … }, hourSource, venue, epoch }
// Hours after midnight in a BestTime day (12 AM – 5 AM) belong to the NEXT calendar day.
export function parse(resp) {
  if (!resp || resp.status !== "OK")
    throw new Error("BestTime response is not OK");
  if (!Array.isArray(resp.analysis) || resp.analysis.length !== 7)
    throw new Error("BestTime response has no 7-day analysis");
  const busy = Object.fromEntries(
    BT_DAYS.map((d) => [d, Array(24).fill(null)]),
  );
  let hourSource = "hour_analysis";
  for (const entry of resp.analysis) {
    const n = entry?.day_info?.day_int;
    const name = BT_DAYS[n];
    if (!name) throw new Error("BestTime day_int missing or out of range");
    const text = entry.day_info.day_text;
    if (text && !String(text).startsWith(name))
      throw new Error(`BestTime day_int ${n} does not match day_text ${text}`);
    const raw = entry.day_raw;
    if (
      !Array.isArray(raw) ||
      raw.length !== 24 ||
      !raw.every((v) => typeof v === "number" && v >= 0)
    ) {
      throw new Error(`BestTime day_raw for ${name} is not 24 hourly values`);
    }
    const { order, source } = hourOrder(entry);
    if (source !== "hour_analysis") hourSource = source;
    let nextDay = false;
    order.forEach((h, i) => {
      if (i > 0 && h < order[i - 1]) nextDay = true; // passed midnight
      busy[nextDay ? BT_DAYS[(n + 1) % 7] : name][h] = raw[i];
    });
  }
  const v = resp.venue_info || {};
  return {
    busy,
    hourSource,
    venue: {
      id: v.venue_id || null,
      name: v.venue_name || "",
      address: v.venue_address || "",
    },
    epoch: resp.epoch_analysis ?? null,
  };
}

// weight(d, h) = busyness(d, h) / sum of busyness over that day's open hours.
// A day with no busyness in the open hours gets null (the caller falls back to the baseline curve).
export function weights(busy, hours) {
  const out = {};
  for (const [dow, row] of Object.entries(busy)) {
    const vals = hours.map((h) => row[h]);
    const sum = vals.reduce((a, b) => a + (b || 0), 0);
    out[dow] =
      vals.every((v) => typeof v === "number") && sum > 0
        ? vals.map((v) => v / sum)
        : null;
  }
  return out;
}

// The weights for one day of the week ("Sun" … "Sat"), or null to use the baseline curve
export function dayWeights(shape, dow, hours) {
  const w = shape?.source === "besttime" ? shape.weights?.[dow] : null;
  return Array.isArray(w) && w.length === hours.length ? w : null;
}

export const isStale = (shape, now = new Date()) =>
  shape?.source === "besttime" &&
  now - new Date(shape.fetched) > STALE_DAYS * 864e5;

export const fmtDate = (t) =>
  new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });

// Where one day's hourly shape comes from. `when` is the date being forecast.
//   besttime: the cached forecast (stale: true when it was fetched over 30 days ago)
//   seasonal: the cached shape applied to a date far from both today and the fetch (a demo
//             comparison day in another season). BestTime's forecast describes recent weeks only,
//             so for that date the shape is OUR assumption and must not be labeled BestTime data.
//   baseline: our hand-made curve (no cache, a failed fetch, or no open-hours traffic that weekday)
export function source(shape, dow, hours, now = new Date(), when = now) {
  if (shape?.source !== "besttime")
    return { kind: "baseline", reason: shape?.reason || "no-cache", checked: shape?.checked };
  if (!dayWeights(shape, dow, hours)) return { kind: "baseline", reason: "closed-day" };
  const far = (a, b) => Math.abs(a - b) > STALE_DAYS * 864e5;
  const fetched = new Date(shape.fetched);
  if (far(when, fetched) && far(when, now)) return { kind: "seasonal", date: fmtDate(fetched) };
  return { kind: "besttime", date: fmtDate(fetched), stale: isStale(shape, now) };
}

// One-line source label for a day's hourly numbers. Never calls this Google data: it is BestTime's.
export function label(shape, dow, hours, now = new Date(), when = now) {
  const src = source(shape, dow, hours, now, when);
  if (src.kind === "besttime") {
    return (
      `Hourly shape: BestTime forecast fetched ${src.date}. Relative busyness, not customer counts.` +
      (src.stale ? " Shape may be stale (fetched over 30 days ago)." : "")
    );
  }
  if (src.kind === "seasonal") {
    return `Hourly shape: our seasonal assumption. The BestTime forecast (fetched ${src.date}) describes recent weeks, not this date.`;
  }
  const why = {
    "closed-day": `The BestTime forecast has no open-hours traffic for ${dow}.`,
    "not-found": "BestTime could not find this shop",
    "no-data": "BestTime has too little foot traffic data for this shop",
    error: "The last BestTime fetch failed",
    "no-cache": "No BestTime forecast is cached.",
  }[src.reason];
  const checked = src.checked ? ` (checked ${fmtDate(src.checked)}).` : ".";
  return (
    "Hourly shape: our baseline curve (an estimate). " +
    (/\.$/.test(why) ? why : why + checked)
  );
}

// Browser: read the cached shape from our own server. Any failure means the baseline curve.
export async function loadShape() {
  try {
    const res = await fetch("/api/shape");
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return data && data.source
      ? data
      : { source: "baseline", reason: "no-cache" };
  } catch {
    return { source: "baseline", reason: "no-cache" };
  }
}

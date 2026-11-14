// "Now" in the shop's time zone (Vercel runs in UTC): local date and minutes after midnight.
export const SHOP_TZ = process.env.SHOP_TZ || "America/New_York";

export function shopNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Which data set a request works on: the shop's real data, the simulated demo day, or the
// table demo (one cup of strawberries). Anything unknown is "live".
export const scen = v => (v === "demo" || v === "bowls" ? v : "live");

export const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
export const isMin = v => Number.isInteger(v) && v >= 0 && v < 24 * 60;

// Demo mode data. Everything here is SIMULATED except the weather, which is the real
// Open-Meteo record for each day at Nassau St (fetched Nov 14, 2026). Shared by the demo
// page, the clock and topping screens in demo mode, and api/demo.js (seeding).

// The two days the demo contrasts.
export const DEMO_DAYS = {
  nov: {
    key: "2026-11-14", label: "Sat, Nov 14 · cold", short: "Cold Saturday",
    weather: { temp: 44, rain: false, cond: "Cloudy" }, // real: high 44°F, feels like 31–36°F
    events: [], // HackPrinceton comes from FIXED_EVENTS in config.js
    note: "Thanksgiving recess starts after classes Tue, Nov 24."
  },
  sep: {
    key: "2026-09-05", label: "Sat, Sep 5 · warm", short: "First weekend of term",
    weather: { temp: 80, rain: false, cond: "Partly cloudy" }, // real: high 80°F
    events: [{ id: "demo-term-start", from: "2026-09-05", to: "2026-09-06", label: "First weekend of fall term", type: "student", when: "all", source: "Princeton calendar (inferred)" }],
    note: "Students are back; fall classes began Wed, Sep 2 (inferred)."
  }
};

export const demoDay = key => Object.values(DEMO_DAYS).find(d => d.key === key) || null;

// Placeholder photos of the topping bar. Swap in real shop photos here (same 6 bins).
export const DEMO_PHOTOS = {
  open: "demo/topping-bar-open-placeholder.svg",
  close: "demo/topping-bar-close-placeholder.svg",
  real: false // set to true once these are real photos
};

// Simulated topping bar (row 1 = back of the bar).
export const DEMO_BINS = [
  { name: "Strawberries", row: 1, col: 1, discard: true, panLabel: "1/6 pan", panCost: 9 },
  { name: "Mango", row: 1, col: 2, discard: true, panLabel: "1/6 pan", panCost: 8 },
  { name: "Kiwi", row: 1, col: 3, discard: true, panLabel: "1/9 pan", panCost: null },
  { name: "Mochi", row: 2, col: 1, discard: false, panLabel: "1/6 pan", panCost: 6 },
  { name: "Rainbow sprinkles", row: 2, col: 2, discard: false, panLabel: null, panCost: null },
  { name: "Popping boba", row: 2, col: 3, discard: null, panLabel: null, panCost: null }
];

// Table demo (toppings.html?demo=bowls): one real cup of cut strawberries, photographed with
// the phone. Nothing here is simulated: the photos and the estimates are real.
// (The "bowls" name is from when this demo used two bowls.)
export const BOWL_BINS = [
  { name: "Strawberries", row: 1, col: 1, discard: true, panLabel: "cup", panCost: null }
];

// The table demo's cups: the fruit named in the link, left to right, up to four
// (toppings.html?demo=bowls&cups=Strawberries,Mango), or the one cup above.
export function cupBins(names) {
  const seen = new Set(), out = [];
  for (const raw of Array.isArray(names) ? names : []) {
    const name = String(raw).trim().slice(0, 40), slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!slug || seen.has(slug) || out.length >= 4) continue;
    seen.add(slug);
    out.push({ name, row: 1, col: out.length + 1, discard: true, panLabel: "cup", panCost: null });
  }
  return out.length ? out : BOWL_BINS;
}

// What the "sample photo" returns in demo mode (matches the placeholder pair). Kiwi at close
// is deliberately unsure so the demo shows a "needs a look" bin.
export const DEMO_ESTIMATES = {
  open: {
    "Strawberries": [1, "high"], "Mango": [1, "high"], "Kiwi": [0.75, "medium"],
    "Mochi": [0.5, "high"], "Rainbow sprinkles": [0.75, "high"], "Popping boba": [1, "medium"]
  },
  close: {
    "Strawberries": [0.75, "high"], "Mango": [0.25, "high"], "Kiwi": [0.25, "low"],
    "Mochi": [0.25, "medium"], "Rainbow sprinkles": [0.5, "high"], "Popping boba": [0.5, "medium"]
  }
};

// Two weeks of simulated history before a demo day (deterministic). Strawberries end most
// days three-quarters full, so step 4's "try a smaller pan" suggestion has something to find.
export function demoHistory(dayKey, days = 14) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const pattern = {
    "Strawberries": { open: 1, close: [0.75, 0.75, 1, 0.75, 0.5, 0.75, 0.75], refill: [0, 0, 0, 1, 0, 0, 0] },
    "Mango": { open: 1, close: [0.25, 0.5, 0.25, 0.25, 0, 0.5, 0.25], refill: [0, 0, 0, 0, 1, 0, 0] },
    "Kiwi": { open: 0.75, close: [0.25, 0.25, 0.5, 0.25, 0.25, 0, 0.25], refill: [0, 0, 0, 0, 0, 0, 0] },
    "Mochi": { open: 0.5, close: [0.25, 0.25, 0.25, 0, 0.25, 0.25, 0.5], refill: [0, 0, 0.5, 0, 0, 0, 0] },
    "Rainbow sprinkles": { open: 0.75, close: [0.5, 0.5, 0.75, 0.5, 0.5, 0.5, 0.75], refill: [0, 0, 0, 0, 0, 0, 0] },
    "Popping boba": { open: 1, close: [0.5, 0.25, 0.5, 0.5, 0.25, 0.5, 0.5], refill: [0, 0, 0, 0, 0, 0, 0] }
  };
  const out = [];
  for (let i = days; i >= 1; i--) {
    const date = new Date(y, m - 1, d - i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const k = (days - i) % 7;
    out.push({
      day: key,
      bins: Object.entries(pattern).map(([name, p]) => ({ name, open: p.open, close: p.close[k], refill: p.refill[k] }))
    });
  }
  return out;
}

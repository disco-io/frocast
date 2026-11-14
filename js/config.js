// Shop settings: placeholders until the shop confirms them (editable in Settings)
export const DEFAULTS = {
  // Typical day's total in recent weeks, students on campus. Until the owner sets a day in Settings these are
  // ILLUSTRATIVE figures from franchise benchmarks (125 weekday, 185 weekend day), not this shop's data.
  base: { Sun: 185, Mon: 125, Tue: 125, Wed: 125, Thu: 125, Fri: 125, Sat: 185 },
  baseSet: {},          // days whose total the owner has set (the rest show "assumed, tap to set")
  froyoShare: 0.6,      // share of those customers buying froyo (the rest buy tea)
  bobaShareTea: 0.7,    // share of tea drinks with boba
  bobaShareFroyo: 0.05, // share of froyo cups with boba as a topping
  drinksPerBatch: 20,   // drinks one full batch makes
  cookLead: 45,         // minutes from starting a batch to ready to serve
  bobaHours: 4,         // hours cooked pearls stay good (set by the shop)
  oldBatches: 2,        // current routine: full batches per day
  fruitShare: 0.4,      // share of froyo cups with fresh fruit
  cupsPerContainer: 25, // fruit cups one cut container covers
  cushion: 0.2,         // how much busier than forecast the backup plan covers (0.2 = 20% more customers)
  bobaMargin: 0.25,     // batch clock cooks this much extra so the shop doesn't run out
  photoDays: 14,        // days to keep topping-bar photos (the confirmed numbers stay)
  calib: 1.0            // learned correction from closing logs
};

// Saved settings on top of the defaults. A typical-day total counts only if the owner set it (baseSet);
// every other day stays the labeled placeholder, whatever an older save holds. Every screen uses this.
export function settings(src = {}) {
  const set = src?.baseSet || {};
  const own = Object.fromEntries(Object.entries(src?.base || {}).filter(([d]) => set[d]));
  return { ...structuredClone(DEFAULTS), ...(src || {}), base: { ...DEFAULTS.base, ...own }, baseSet: { ...set } };
}

export const SETTING_FIELDS = [
  ["froyoShare", "Share of customers buying froyo (rest buy tea)", 0.05, 0, 1],
  ["bobaShareTea", "Share of tea drinks with boba", 0.05, 0, 1],
  ["bobaShareFroyo", "Share of froyo cups with boba topping", 0.05, 0, 1],
  ["drinksPerBatch", "Drinks per full boba batch", 1, 1, 200],
  ["cookLead", "Minutes to cook a batch (start to ready)", 5, 5, 180],
  ["bobaHours", "Hours cooked boba stays good", 1, 1, 12],
  ["oldBatches", "Current routine: full batches per day", 1, 1, 10],
  ["fruitShare", "Share of froyo cups with fresh fruit", 0.05, 0, 1],
  ["cupsPerContainer", "Fruit cups per cut container", 1, 1, 200],
  ["cushion", "Busy-day backup: how much busier to plan for (0.2 = 20% more)", 0.05, 0, 1],
  ["bobaMargin", "Extra boba to cook so you don't run out (0.25 = 25%)", 0.05, 0, 1],
  ["photoDays", "Days to keep topping-bar photos", 1, 1, 90]
];

// Shop hours (10 AM – 11 PM) and our hand-made baseline shape of a day (evening-heavy).
// The baseline is used when no BestTime forecast is cached (see js/shape.js).
export const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
export const HOUR_W = [2, 4, 6, 6, 5, 5, 6, 7, 9, 11, 12, 10, 6];

// How temperature changes demand ([°F, multiplier] points, straight lines between them).
// The forecast uses these as a ratio (the day vs. the recent norm), not as an absolute cold penalty.
// Froyo drops hard in the cold; tea (many drinks are hot) drops much less. Placeholders.
export const TEMP = {
  froyo: [[20, 0.4], [30, 0.45], [40, 0.55], [55, 0.75], [70, 1], [85, 1.2], [95, 1.3]],
  tea:   [[20, 0.7], [30, 0.75], [40, 0.8], [55, 0.9], [70, 1], [85, 1.05], [95, 1.05]]
};
export const RAIN = { froyo: 0.75, tea: 0.9 }; // rain or snow

// Event types: default effect on customers
export const TYPES = {
  break:       { name: "Break (students away)", mult: 0.45, icon: "🧳" },
  exams:       { name: "Reading period / exams", mult: 1.1,  icon: "📚" },
  athletics:   { name: "Athletics",              mult: 1.15, icon: "🏈" },
  town:        { name: "Town event",             mult: 1.2,  icon: "🎄" },
  student:     { name: "Student event",          mult: 1.1,  icon: "🎤" },
  competition: { name: "Club competition",       mult: 1.1,  icon: "💻" }
};

// How much of each event type's boost counts when several types fall on one day, biggest first:
// the biggest in full, the second at half, the rest not at all. (Several events of ONE type already count once.)
export const EVENT_STACK = [1, 0.5, 0];

// Events to name first when several share a day (big draws before small meets)
export const isMajor = e => /\b(football|basketball|hockey|lacrosse|soccer)\b/i.test(e.label || "");

// When in the day an event brings extra customers
export const WHEN = {
  all:       { name: "All day",    hours: [] },
  afternoon: { name: "Afternoon",  hours: [12, 13, 14, 15, 16] },
  evening:   { name: "Evening",    hours: [17, 18, 19, 20] },
  late:      { name: "Late night", hours: [20, 21, 22] }
};

// No hardcoded events: they are read from these sources by "Sync" (feeds are parsed, web pages are read by AI).
// hint "athletics" keeps home games only. Add sources here; a source can be removed on the Events tab.
export const DEFAULT_SOURCES = [
  { id: "athletics", name: "Princeton Athletics", url: "https://goprincetontigers.com/calendar.ashx/calendar.ics", hint: "athletics" },
  { id: "palmer", name: "Palmer Square events", url: "https://palmersquare.com/events/?ical=1", hint: "town" },
  { id: "planet", name: "Planet Princeton events", url: "https://planetprinceton.com/events/?ical=1", hint: "town" },
  { id: "acad", name: "Academic calendar (third-party, unverified)", url: "https://acadcalendar.com/princeton-academic-calendar/", hint: "academic" }
];

// Fixed events: always present, not read by Sync, can't be deleted on the Events tab. Edit them here.
export const FIXED_EVENTS = [
  { id: "hackprinceton", from: "2026-11-13", to: "2026-11-15", label: "HackPrinceton", type: "competition", when: "late",
    source: "HackPrinceton", url: "https://www.hackprinceton.com/" }
];

// Put the fixed events first and drop any saved copy of them (older versions saved HackPrinceton as a normal event)
// Game names without poll rankings: "Men's Ice Hockey vs No. 11/11 Dartmouth" -> "Men's Ice Hockey vs Dartmouth"
export const noRank = label => String(label ?? "").replace(/(?:\bNo\.|#)\s*\d+(?:\/\d+)?\s+/gi, "");

export const withFixed = list => [
  ...FIXED_EVENTS.map(e => ({ ...e, fixed: true })),
  ...list.filter(e => !e.fixed && !FIXED_EVENTS.some(f => f.id === e.id || (f.from === e.from && f.label.toLowerCase() === e.label.toLowerCase())))
    .map(e => (e.type === "athletics" ? { ...e, label: noRank(e.label) } : e))   // also cleans games saved before this rule
];

// What a screen uses before any events are saved or synced
export const DEFAULT_EVENTS = withFixed([]);

// Old hardcoded starter events: dropped from browsers that saved them
export const LEGACY_LABELS = ["HackPrinceton", "A cappella concert (sample)", "Home football game (sample)",
  "Holiday market downtown (sample)", "Thanksgiving recess", "Thanksgiving recess (verify with Registrar)"];

// Shop location (Nassau St, Princeton) for the weather forecast
export const LOCATION = { lat: 40.3508, lon: -74.6565 };

// Shop settings: placeholders until the shop confirms them (editable in Settings)
export const DEFAULTS = {
  base: { Sun: 70, Mon: 45, Tue: 45, Wed: 50, Thu: 58, Fri: 80, Sat: 85 }, // typical warm (70°F) day, students on campus
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
  calib: 1.0            // learned correction from closing logs
};

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
  ["cushion", "Busy-day backup: how much busier to plan for (0.2 = 20% more)", 0.05, 0, 1]
];

// Shop hours (10 AM – 11 PM) and the usual shape of a day (evening-heavy)
export const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
export const HOUR_W = [2, 4, 6, 6, 5, 5, 6, 7, 9, 11, 12, 10, 6];

// How temperature changes demand ([°F, multiplier] points, straight lines between them).
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

// When in the day an event brings extra customers
export const WHEN = {
  all:       { name: "All day",    hours: [] },
  afternoon: { name: "Afternoon",  hours: [12, 13, 14, 15, 16] },
  evening:   { name: "Evening",    hours: [17, 18, 19, 20] },
  late:      { name: "Late night", hours: [20, 21, 22] }
};

// No hardcoded events: they are read from these sources by "Sync" (feeds are parsed, web pages are read by AI).
// hint "athletics" keeps home games only. Add or remove sources on the Events tab.
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

// Old hardcoded starter events: dropped from browsers that saved them
export const LEGACY_LABELS = ["HackPrinceton", "A cappella concert (sample)", "Home football game (sample)",
  "Holiday market downtown (sample)", "Thanksgiving recess", "Thanksgiving recess (verify with Registrar)"];

// Shop location (Nassau St, Princeton) for the weather forecast
export const LOCATION = { lat: 40.3508, lon: -74.6565 };

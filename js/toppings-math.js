// Topping bin math, shared by api/toppings.js and toppings.js. Levels are fractions of a pan.
export const LEVELS = [0, 0.25, 0.5, 0.75, 1];
export const isLevel = v => LEVELS.includes(Number(v));
export const REFILLS = [0.5, 1];

// usage = open level + refills - close level (pans). A negative result means a refill was
// probably missed: it is reported, never clamped.
export function usage({ open, close, refills = [] }) {
  if (open == null || close == null) return { used: null, negative: false, refilled: refills.reduce((a, r) => a + r.amount, 0) };
  const refilled = refills.reduce((a, r) => a + r.amount, 0);
  const used = open + refilled - close;
  return { used, refilled, negative: used < -1e-9 };
}

// Bins whose close level is waste. An unset choice counts as "discarded" (assumed) until the owner sets it.
export const discards = bin => bin.discard_at_close == null ? true : !!bin.discard_at_close;

// Map a vision estimate to what the grid shows: low confidence or not visible stays blank ("needs a look").
export function prefill(estimate) {
  if (!estimate || !estimate.visible || estimate.confidence === "low" || !isLevel(estimate.level)) return null;
  return Number(estimate.level);
}

// How a confirmed value relates to the estimate, for "how often was the model right".
export function outcome(estimate, level) {
  if (!estimate) return "manual";
  const pre = prefill(estimate);
  if (pre === null) return "filled";
  return pre === Number(level) ? "accepted" : "corrected";
}

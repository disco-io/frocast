// Three-way merge for shared app state, so one device's save never erases another's.
// base   = the copy this device last got from the server
// local  = this device's copy now
// remote = the server's copy now
// Only what this device changed since `base` is applied on top of `remote`.
// Used by api/data.js (on every save) and js/store.js (when it re-checks the server).
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);

export function mergeValue(base, local, remote) {
  if (same(local, base)) return remote === undefined ? local : remote; // unchanged here: take theirs
  if (remote === undefined || same(remote, base)) return local;        // unchanged there: take ours
  if (isObj(local) && isObj(remote)) {                                  // both changed: field by field
    const out = {};
    const keys = new Set([...Object.keys(isObj(base) ? base : {}), ...Object.keys(local), ...Object.keys(remote)]);
    for (const k of keys) {
      const v = mergeValue(isObj(base) ? base[k] : undefined, local[k], remote[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return local; // both changed the same single value: the latest save wins
}

// Lists merge item by item: additions on either side are kept, a deletion on either side sticks.
export function mergeList(base, local, remote, idOf) {
  const B = new Map((base || []).map(x => [idOf(x), x]));
  const L = new Map((local || []).map(x => [idOf(x), x]));
  const R = new Map((remote || []).map(x => [idOf(x), x]));
  const out = new Map();
  for (const [id, r] of R) {
    if (B.has(id) && !L.has(id)) continue; // deleted on this device
    out.set(id, L.has(id) ? mergeValue(B.get(id), L.get(id), r) : r);
  }
  for (const [id, l] of L) {
    if (out.has(id) || (B.has(id) && !R.has(id))) continue; // already merged, or deleted elsewhere
    out.set(id, l);                                          // added on this device
  }
  return [...out.values()];
}

// Events have no id, so an event is identified by what it says (exact duplicates collapse).
export const eventId = e => [e.from, e.to, e.label, e.type, e.when, e.source].join("|");
export const logId = l => l.key;

export function mergeState(base, local, remote) {
  const b = base || {}, l = local || {}, r = remote || {};
  const out = {};
  const s = mergeValue(b.s, l.s, r.s);
  if (s !== undefined) out.s = s;
  if (l.events || r.events) out.events = mergeList(b.events, l.events, r.events, eventId);
  if (l.logs || r.logs) out.logs = mergeList(b.logs, l.logs, r.logs, logId);
  const show = mergeValue(b.showSample, l.showSample, r.showSample);
  if (show !== undefined) out.showSample = show;
  return out;
}

export const sameState = same;

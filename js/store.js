// Saves settings, events and closing logs in this browser, and syncs them to the shared
// Turso database (api/data.js) so every paired device sees the same data.
// Saves send only this device's changes: the server merges them with what other devices
// saved meanwhile (js/merge.js). The shared copy is re-checked every minute and whenever
// the page comes back into view. With no server (plain static hosting) it stays
// browser-only, as before.
import { mergeState, sameState } from "./merge.js";

const KEY = "frocast-v1";
const BASE_KEY = "frocast-v1-base"; // the last copy this device got from the server
const POLL_MS = 60 * 1000;

let timer = null;
let pending = null;
let inFlight = false;
let base = readJson(BASE_KEY);
let apply = null;

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: the app still works for this visit
  }
}

function setBase(state) {
  base = state;
  writeJson(BASE_KEY, state);
}

async function getShared() {
  try {
    const res = await fetch("/api/data", { credentials: "same-origin", headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const { state } = await res.json();
    return state || null;
  } catch {
    return null;
  }
}

// Latest shared data at startup, or null when offline / not paired. The app uses it as is,
// so it becomes this device's starting point for merges.
export async function pull() {
  const state = await getShared();
  if (!state) return null;
  setBase(state);
  return Object.keys(state).length ? state : null;
}

async function push() {
  timer = null;
  const state = pending;
  pending = null;
  if (!state) return;
  inFlight = true;
  try {
    const res = await fetch("/api/data", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base, state })
    });
    if (res.ok) {
      const merged = (await res.json()).state;
      setBase(merged);
      // Show what other devices added, unless this device has changed again meanwhile.
      if (!pending && !timer && apply && !sameState(merged, state)) apply(merged);
    }
  } catch {
    // offline: the browser copy is kept; the next save or re-check retries
  } finally {
    inFlight = false;
  }
}

// Re-check the shared copy and fold in other devices' changes.
async function sync() {
  if (timer || inFlight || pending) return;
  const remote = await getShared();
  if (!remote || timer || inFlight || pending) return;
  const local = load();
  const merged = mergeState(base, local, remote);
  setBase(remote);
  if (apply && !sameState(merged, local)) apply(merged);
  if (!sameState(merged, remote)) save(merged);
}

// apply(state) updates the app's copy and redraws without saving back to the server.
export function watch(onChange) {
  apply = onChange;
  setInterval(sync, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync();
  });
}

export function load() {
  return readJson(KEY) || {};
}

// push: false saves only in this browser (used when applying the shared copy).
export function save(state, { push: send = true } = {}) {
  writeJson(KEY, state);
  if (!send) return;
  pending = state;
  clearTimeout(timer);
  timer = setTimeout(push, 500);
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// Saves settings, events and closing logs in this browser, and syncs them to the shared
// Turso database (api/data.js) so every paired device sees the same data.
// With no server (plain static hosting) it stays browser-only, as before.
const KEY = "frocast-v1";
let timer = null;
let pending = null;

// Latest shared data, or null when offline / not paired.
export async function pull() {
  try {
    const res = await fetch("/api/data", { credentials: "same-origin", headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const { state } = await res.json();
    return state && Object.keys(state).length ? state : null;
  } catch {
    return null;
  }
}

async function push() {
  const state = pending;
  pending = null;
  try {
    await fetch("/api/data", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state })
    });
  } catch {
    // offline: the browser copy is kept and the next save retries
  }
}

export function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage unavailable: the app still works for this visit
  }
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

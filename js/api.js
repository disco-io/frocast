// Small fetch wrapper for the api functions. Returns { ok, status, data }; never throws,
// so a missing server (plain static hosting) just means "offline".
export async function call(path, { method = "GET", body } = {}) {
  try {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

// Only same-site paths, so ?next= can't send people to another website.
export function safeNext(raw) {
  const p = String(raw || "/");
  return p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : "/";
}

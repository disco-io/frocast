// Signed cookie tokens (HMAC-SHA256 via Web Crypto). Used by middleware.js and the api
// functions, so it must not import anything Node-only.
const enc = new TextEncoder();
const DEV_SECRET = "dev-only-secret-change-me";

export const DEVICE_COOKIE = "fc_device";
export const OWNER_COOKIE = "fc_owner";
export const DEVICE_DAYS = 365;
export const OWNER_HOURS = 12;

export function secret() {
  const s = process.env.DEVICE_SECRET;
  if (s) return s;
  if (process.env.VERCEL) throw new Error("DEVICE_SECRET is not set");
  return DEV_SECRET;
}

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(value, key) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(value)));
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sign(value, key = secret()) {
  return `${value}.${await hmac(value, key)}`;
}

// Returns the signed value, or null if the token was tampered with.
export async function verify(token, key = secret()) {
  if (!token || typeof token !== "string") return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const value = token.slice(0, i);
  return same(token.slice(i + 1), await hmac(value, key)) ? value : null;
}

export function cookies(header) {
  const out = {};
  String(header || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

// device token value: "d|<location>|<deviceId>"
export async function deviceFromCookie(header) {
  const v = await verify(cookies(header)[DEVICE_COOKIE]);
  if (!v) return null;
  const [kind, location, id] = v.split("|");
  return kind === "d" && location && id ? { location, id } : null;
}

// owner token value: "o|<location>|<expires epoch ms>"
export async function ownerFromCookie(header) {
  const v = await verify(cookies(header)[OWNER_COOKIE]);
  if (!v) return null;
  const [kind, location, exp] = v.split("|");
  return kind === "o" && Number(exp) > Date.now() ? { location } : null;
}

export function cookieHeader(name, value, maxAgeSec, secure) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

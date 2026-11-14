// Local dev server: serves the site, runs the api/ functions and the device-pairing check
// (middleware.js, same pages as vercel.json). No Vercel needed.
// Run: npm start   (reads ANTHROPIC_API_KEY, OWNER_PIN, TURSO_* from .env)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 8000;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"
};
// Never serve the local database or installed packages
const PRIVATE = /^\/(node_modules|tests)(\/|$)|\.db(-journal|-wal|-shm)?$/;

// Load .env (KEY=value lines) without overriding variables already set
function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env file: fine
  }
}
loadEnv();

const body = req => new Promise(done => {
  let raw = "";
  req.on("data", c => { raw += c; });
  req.on("end", () => {
    try { done(JSON.parse(raw || "{}")); } catch { done({}); }
  });
});

// Make Node's response look like Vercel's (res.status(n).json(x))
function shim(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(data));
  };
  return res;
}

async function api(req, res, name) {
  const file = path.join(ROOT, "api", `${name}.js`);
  if (!/^[a-z0-9-]+$/i.test(name) || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const { default: handler } = await import(pathToFileURL(file));
  req.query = Object.fromEntries(new URL(req.url, "http://x").searchParams);
  req.body = await body(req);
  await handler(req, shim(res));
}

// Run middleware.js on the pages vercel.json lists. Returns a redirect, or null to continue.
async function gate(req, url) {
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")).proxy; } catch { return null; }
  if (!cfg || !(cfg.matcher || []).includes(url.pathname)) return null;
  const { default: mw } = await import(pathToFileURL(path.join(ROOT, cfg.entrypoint)));
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const out = await mw(new Request(new URL(req.url, `http://${req.headers.host || "localhost"}`), { headers }));
  return out && !out.headers.get("x-middleware-next") ? out : null;
}

function serve(req, res) {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  const ok = file.startsWith(ROOT + path.sep) && !p.split("/").some(s => s.startsWith(".")) && !PRIVATE.test(p);
  if (!ok || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      if (url.pathname.startsWith("/api/")) {
        await api(req, res, url.pathname.slice(5).replace(/\/$/, ""));
        return;
      }
      const blocked = await gate(req, url);
      if (blocked) {
        res.writeHead(blocked.status, Object.fromEntries(blocked.headers));
        res.end();
        return;
      }
      serve(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
}

// Start only when run directly (tests import createServer instead)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(PORT, () => {
    const k = process.env.ANTHROPIC_API_KEY;
    const set = k && k !== "paste-your-key-here";
    console.log(`FroCast running at http://localhost:${PORT}`);
    console.log(set ? "AI import: key found" : "AI import: no key yet (edit .env), everything else works");
    const dbUrl = process.env.TURSO_DATABASE_URL || "";
    const pairing = process.env.REQUIRE_PAIRING === "1" || process.env.VERCEL;
    console.log(`Data: ${dbUrl && !dbUrl.startsWith("file:") ? "Turso" : "local file"} · device PIN: ${pairing ? "required" : "off (local)"}`);
  });
}

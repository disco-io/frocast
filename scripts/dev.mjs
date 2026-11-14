// Local stand-in for `vercel dev` (no Vercel login needed): serves the static site,
// routes /api/<name> to api/<name>.js with Vercel-style req/res helpers, and runs
// middleware.js on the pages listed in vercel.json. Uses local.db unless TURSO_* is set.
//   npm run dev:local        -> http://localhost:3000  (owner PIN 0000 unless OWNER_PIN is set)
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8" };
const BLOCKED = /^\/(node_modules|\.git|\.vercel|scripts|tests)(\/|$)|\.(db|db-journal|db-wal|env)$|^\/\.env/;

function loadEnvFile() {
  const f = path.join(ROOT, ".env.local");
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function vercelConfig() {
  try { return JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8")); } catch { return {}; }
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  if ((req.headers["content-type"] || "").includes("application/json")) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function vercelRes(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json"); res.end(JSON.stringify(obj)); return res; };
  res.send = body => { res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); return res; };
  return res;
}

const apiCache = new Map();
async function apiHandler(name) {
  if (!apiCache.has(name)) {
    const file = path.join(ROOT, "api", `${name}.js`);
    if (!existsSync(file)) return null;
    apiCache.set(name, (await import(pathToFileURL(file).href)).default);
  }
  return apiCache.get(name);
}

async function runMiddleware(req, url) {
  const cfg = vercelConfig().proxy;
  if (!cfg || !(cfg.matcher || []).includes(url.pathname)) return null;
  const mw = (await import(pathToFileURL(path.join(ROOT, cfg.entrypoint)).href)).default;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const out = await mw(new Request(url, { headers }));
  if (!out || out.headers.get("x-middleware-next")) return null;
  return out;
}

async function serveStatic(res, pathname) {
  let file = path.join(ROOT, decodeURIComponent(pathname));
  if (!file.startsWith(ROOT)) return false;
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

export function createServer() {
  loadEnvFile();
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    try {
      if (BLOCKED.test(url.pathname)) { res.writeHead(404).end("Not found"); return; }
      const api = url.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/i);
      if (api) {
        const handler = await apiHandler(api[1]);
        if (!handler) { res.writeHead(404, { "content-type": "application/json" }).end('{"error":"No such api route"}'); return; }
        req.query = Object.fromEntries(url.searchParams);
        req.body = await readBody(req);
        await handler(req, vercelRes(res));
        return;
      }
      const blocked = await runMiddleware(req, url);
      if (blocked) {
        res.writeHead(blocked.status, Object.fromEntries(blocked.headers));
        res.end(await blocked.text());
        return;
      }
      if (!(await serveStatic(res, url.pathname))) res.writeHead(404).end("Not found");
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Dev server error" }));
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => {
    console.log(`FroCast dev server: http://localhost:${port}`);
    console.log(`DB: ${process.env.TURSO_DATABASE_URL || "file:local.db"} · owner PIN: ${process.env.OWNER_PIN ? "from env" : "0000 (dev default)"}`);
  });
}

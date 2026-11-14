// Local dev server: serves the site and runs the api/ functions. No dependencies, no Vercel needed.
// Run: npm start   (reads ANTHROPIC_API_KEY from .env)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 8000;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"
};

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
  req.body = await body(req);
  await handler(req, shim(res));
}

function serve(req, res) {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  const ok = file.startsWith(ROOT + path.sep) && !p.split("/").some(s => s.startsWith("."));
  if (!ok || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) await api(req, res, url.pathname.slice(5));
    else serve(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(PORT, () => {
  const k = process.env.ANTHROPIC_API_KEY;
  const set = k && k !== "paste-your-key-here";
  console.log(`FroCast running at http://localhost:${PORT}`);
  console.log(set ? "AI import: key found" : "AI import: no key yet (edit .env), everything else works");
});

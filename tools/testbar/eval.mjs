// Score the photo check against the generated answer key.
//   npm start                      (in another terminal; ANTHROPIC_API_KEY in .env, TOPPING_CAMERA=1)
//   node tools/testbar/generate.mjs
//   node tools/testbar/eval.mjs [--base http://localhost:8000] [--keep]
// Sends every photo through the real /api/vision route using the demo bins, then reports how
// often the levels were right, how well "confidence" held up, and whether bad photos were
// caught. Writes tools/testbar/results/latest.md and latest.json. Afterwards it resets the demo
// data (which drops the test photos it stored) unless --keep is given.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prefill } from "../../js/toppings-math.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "out"), RES = path.join(DIR, "results");
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const BASE = arg("--base", "http://localhost:8000"), DAY = "2026-11-14", KEEP = process.argv.includes("--keep");
const LV = [0, 0.25, 0.5, 0.75, 1], LABEL = { 0: "empty", 0.25: "¼", 0.5: "½", 0.75: "¾", 1: "full" };

async function api(route, body) {
  const r = await fetch(`${BASE}${route}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(`${route}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "–");

async function main() {
  const key = JSON.parse(readFileSync(path.join(OUT, "key.json"), "utf8"));
  if (!(await api("/api/demo")).seeded) await api("/api/demo", { action: "reset" });
  const bins = (await api(`/api/toppings?scenario=demo&day=${DAY}`)).bins;
  const idOf = Object.fromEntries(bins.map(b => [b.name, b.id]));
  const nameOf = Object.fromEntries(bins.map(b => [b.id, b.name]));

  console.log(`Sending ${key.images.length} photos to ${BASE}/api/vision …`);
  const runs = await pool(key.images, 3, async img => {
    const data = readFileSync(path.join(OUT, img.file)).toString("base64");
    const t0 = Date.now();
    const res = await api("/api/vision", { scenario: "demo", day: DAY, kind: "close", image: `data:image/jpeg;base64,${data}` });
    const ms = Date.now() - t0;
    process.stdout.write(res.available ? "." : "x");
    return { ...img, ms, res, est: Object.fromEntries((res.bins || []).map(b => [nameOf[b.id], b])) };
  });
  console.log("");
  if (runs.every(r => !r.res.available)) throw new Error(`Photo check unavailable (${runs[0].res.reason}). Is ANTHROPIC_API_KEY set and the server restarted?`);

  // ---- clean photos: level accuracy ----
  const clean = runs.filter(r => r.variant === "clean" && r.res.available);
  const rows = [];
  for (const r of clean) for (const [name, truth] of Object.entries(r.levels)) {
    const e = r.est[name];
    if (!e || !idOf[name]) continue;
    rows.push({ file: r.file, name, truth, level: e.level, conf: e.confidence, visible: e.visible, pre: prefill(e) });
  }
  const exact = rows.filter(x => x.level === x.truth).length;
  const near = rows.filter(x => Math.abs(x.level - x.truth) <= 0.25).length;
  const pre = rows.filter(x => x.pre !== null);
  const preExact = pre.filter(x => x.pre === x.truth).length;
  const preNear = pre.filter(x => Math.abs(x.pre - x.truth) <= 0.25).length;
  const byConf = ["high", "medium", "low"].map(c => {
    const g = rows.filter(x => x.conf === c);
    return { conf: c, n: g.length, exact: g.filter(x => x.level === x.truth).length };
  });
  const falseAlarms = clean.filter(r => !r.res.photo_usable);
  const confusion = LV.map(t => LV.map(p => rows.filter(x => x.truth === t && x.level === p).length));
  const perBin = Object.keys(idOf).map(name => {
    const g = rows.filter(x => x.name === name);
    return { name, n: g.length, exact: g.filter(x => x.level === x.truth).length };
  });

  // ---- bad photos: were they caught? ----
  const bad = runs.filter(r => r.variant !== "clean").map(r => {
    const { res, expect } = r;
    const flagged = expect.problems.filter(p => (res.problems || []).includes(p));
    const hiddenOk = expect.hidden.filter(n => r.est[n] && prefill(r.est[n]) === null);
    let caught, how;
    if (r.variant === "hand") {
      caught = flagged.length > 0 && !res.photoId;
      how = caught ? "person flagged, photo not stored" : `problems=${JSON.stringify(res.problems)}, stored=${!!res.photoId}`;
    } else {
      caught = !res.photo_usable || flagged.length > 0 || (expect.hidden.length > 0 && hiddenOk.length === expect.hidden.length);
      how = !res.photo_usable ? `unusable: ${(res.problems || []).join(", ") || "no reason"}` : flagged.length ? `flagged ${flagged.join(", ")}` :
        hiddenOk.length === expect.hidden.length && expect.hidden.length ? `usable, but ${hiddenOk.join(" & ")} left as "needs a look"` : `missed (usable, problems=${JSON.stringify(res.problems)})`;
    }
    return { file: r.file, variant: r.variant, caught, how };
  });

  const ms = runs.map(r => r.ms);
  const summary = {
    when: new Date().toISOString(), base: BASE, model: runs.find(r => r.res.model)?.res.model, photos: runs.length,
    clean: { photos: clean.length, bins: rows.length, exact, near, prefilled: pre.length, preExact, preNear, needsLook: rows.length - pre.length, falseAlarms: falseAlarms.length, byConf, perBin, confusion },
    bad, latencyMs: { avg: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length), max: Math.max(...ms) }
  };

  // ---- report ----
  const L = [];
  L.push(`# Photo check accuracy (synthetic test bar)`, "");
  L.push(`${summary.when.slice(0, 16).replace("T", " ")} UTC · model \`${summary.model}\` · ${runs.length} photos (${clean.length} clean, ${bad.length} bad) · seed ${key.seed}`, "");
  L.push(`Synthetic images drawn by \`generate.mjs\` with a known answer key. They test the pipeline and catch regressions; real photos of the shop's bar are the real test.`, "");
  L.push(`## Clean photos: ${rows.length} bin readings`, "");
  L.push(`| | Share |`, `|---|---|`);
  L.push(`| Level exactly right (all readings) | ${pct(exact, rows.length)} (${exact}/${rows.length}) |`);
  L.push(`| Within one step (¼ pan) | ${pct(near, rows.length)} |`);
  L.push(`| **Pre-filled for staff** (visible, confidence not low) | ${pct(pre.length, rows.length)} of bins |`);
  L.push(`| **Pre-filled and exactly right** | ${pct(preExact, pre.length)} (${preExact}/${pre.length}) |`);
  L.push(`| Pre-filled and within one step | ${pct(preNear, pre.length)} |`);
  L.push(`| Left blank as "needs a look" | ${pct(rows.length - pre.length, rows.length)} |`);
  L.push(`| Clean photos wrongly called unusable | ${falseAlarms.length} of ${clean.length} |`, "");
  L.push(`**By confidence:** ` + byConf.map(c => `${c.conf} ${pct(c.exact, c.n)} right (n=${c.n})`).join(" · "), "");
  L.push(`**By bin:** ` + perBin.map(b => `${b.name} ${pct(b.exact, b.n)}`).join(" · "), "");
  L.push(`**Confusion** (rows = true level, columns = model's answer):`, "");
  L.push(`| true \\ model | ${LV.map(v => LABEL[v]).join(" | ")} |`, `|---|${LV.map(() => "---").join("|")}|`);
  LV.forEach((t, i) => L.push(`| ${LABEL[t]} | ${confusion[i].join(" | ")} |`));
  L.push("", `## Bad photos: ${bad.filter(b => b.caught).length} of ${bad.length} caught`, "");
  L.push(`| Photo | Problem | Caught? | What the check said |`, `|---|---|---|---|`);
  bad.forEach(b => L.push(`| ${b.file} | ${b.variant} | ${b.caught ? "✅" : "❌"} | ${b.how} |`));
  L.push("", `Latency: ${summary.latencyMs.avg} ms average, ${summary.latencyMs.max} ms slowest (3 at a time).`);
  mkdirSync(RES, { recursive: true });
  writeFileSync(path.join(RES, "latest.md"), L.join("\n") + "\n");
  writeFileSync(path.join(RES, "latest.json"), JSON.stringify({ summary, readings: rows }, null, 2));
  console.log(L.join("\n"));

  if (!KEEP) {
    await api("/api/demo", { action: "reset" });
    console.log("\nDemo data reset (test photos removed). Use --keep to keep them.");
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });

// Table demo test photos: one cup of strawberries drawn before and after some fruit is taken
// out, from the same camera spot, with a known answer key. Then score the
// photo check on them, with and without the earlier photo as a yardstick.
//   node tools/testbar/bowls.mjs make [seed=5]        -> tools/testbar/out-bowls/*.jpg + key.json
//   node tools/testbar/bowls.mjs score [--base http://localhost:8000]
// score needs the server running with ANTHROPIC_API_KEY and TOPPING_CAMERA=1. It uses the
// table-demo data set (scenario "bowls") on made-up days and resets it afterwards.
// These are drawings, not photos: they catch regressions. A real cup is the real test.
// (The file and folder keep the "bowls" name from when the demo used two bowls.)
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { W, H, F, CX, CY, CAM_H, rng, proj, pts, chunk, counter, defs } from "./generate.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "out-bowls"); // not inside out/: generate.mjs clears that folder
const LABEL = { 0: "empty", 0.25: "¼", 0.5: "½", 0.75: "¾", 1: "full" };

// before -> after levels. The first pair is the demo itself: strawberries full -> half.
const PAIRS = [
  [{ Strawberries: 1 }, { Strawberries: 0.5 }],
  [{ Strawberries: 1 }, { Strawberries: 0.25 }],
  [{ Strawberries: 1 }, { Strawberries: 0.75 }],
  [{ Strawberries: 0.75 }, { Strawberries: 0 }],
  [{ Strawberries: 1 }, { Strawberries: 1 }],
  [{ Strawberries: 0.5 }, { Strawberries: 0.25 }]
];

const FRUIT = {
  Strawberries: { base: "#a50f26", piece: (r, s) => chunk(r, s, ["#c8102e", "#d92b45", "#a30d25", "#e8455a"], "#f6d36b") }
};
const BOWL = { rim: 0.092, foot: 0.066, tall: 0.125, wall: 0.005 }; // a froyo cup: straight sides, taller than it is wide at the foot
const ring = (cx, cz, y, rad, n = 56) => Array.from({ length: n }, (_, k) => [cx + Math.cos((k / n) * 6.2832) * rad, y, cz + Math.sin((k / n) * 6.2832) * rad]);

// One white cup on the counter at (cx, cz), with fruit up to `level` of its height.
function bowl(r, name, level, cx, cz, id) {
  const y0 = -CAM_H, top = y0 + BOWL.tall;
  const radAt = f => BOWL.foot + (BOWL.rim - BOWL.foot) * f; // straight, slightly tapered sides
  let s = "";
  const [sx, sy, sz] = proj([cx + 0.02, y0, cz - 0.01]);
  s += `<ellipse cx="${sx.toFixed(0)}" cy="${sy.toFixed(0)}" rx="${((F * BOWL.rim * 1.15) / sz).toFixed(0)}" ry="${((F * BOWL.rim * 0.8) / sz).toFixed(0)}" fill="#000" opacity=".22" filter="url(#soft)"/>`;
  for (let k = 0; k <= 14; k++) { // outside, foot to rim
    const f = k / 14, shade = Math.round(205 + 40 * f);
    s += `<polygon points="${pts(ring(cx, cz, y0 + BOWL.tall * f, radAt(f)))}" fill="rgb(${shade},${shade},${shade - 4})"/>`;
  }
  s += `<polygon points="${pts(ring(cx, cz, top, BOWL.rim))}" fill="#fbfbf8" stroke="#c9c9c2" stroke-width="2"/>`;
  const mouth = ring(cx, cz, top, BOWL.rim - BOWL.wall);
  s += `<clipPath id="mouth${id}"><polygon points="${pts(mouth)}"/></clipPath><g clip-path="url(#mouth${id})">`;
  for (let k = 0; k <= 14; k++) { // inside, rim down to the floor: darker with depth
    const f = 1 - k / 14, shade = Math.round(150 + 85 * f);
    s += `<polygon points="${pts(ring(cx, cz, y0 + 0.006 + (BOWL.tall - 0.006) * f, radAt(f) - BOWL.wall))}" fill="rgb(${shade},${shade},${shade - 6})"/>`;
  }
  const fruit = FRUIT[name];
  if (level > 0) {
    const f = level * 0.94, y = y0 + 0.006 + (BOWL.tall - 0.006) * f, rad = radAt(f) - BOWL.wall - 0.002;
    const surf = ring(cx, cz, y, rad);
    s += `<clipPath id="fruit${id}"><polygon points="${pts(surf)}"/></clipPath><polygon points="${pts(surf)}" fill="${fruit.base}"/><g clip-path="url(#fruit${id})">`;
    const n = Math.round(60 + 150 * (rad / BOWL.rim) ** 2);
    const bits = Array.from({ length: n }, () => { const a = r() * 6.2832, d = Math.sqrt(r()) * rad; return { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d }; }).sort((p, q) => q.z - p.z);
    for (const b of bits) {
      const [px, py, pz] = proj([b.x, y + r() * 0.008, b.z]);
      s += `<g transform="translate(${px.toFixed(1)},${py.toFixed(1)})">${fruit.piece(r, (F * 0.0125) / pz)}</g>`;
    }
    s += `</g>`;
    const [nx, ny, nz] = proj([cx, y, cz - rad * 0.55]); // the near wall's shadow on the fruit grows as the level drops
    s += `<ellipse cx="${nx.toFixed(0)}" cy="${ny.toFixed(0)}" rx="${((F * rad) / nz).toFixed(0)}" ry="${((F * rad * 0.42) / nz).toFixed(0)}" fill="#000" opacity="${(0.1 + 0.3 * (1 - level)).toFixed(2)}" filter="url(#soft)"/>`;
  } else {
    for (let k = 0; k < 9; k++) { // a few bits and juice left on the floor
      const a = r() * 6.2832, d = Math.sqrt(r()) * (BOWL.foot - 0.01);
      const [px, py, pz] = proj([cx + Math.cos(a) * d, y0 + 0.007, cz + Math.sin(a) * d]);
      s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${((F * 0.004) / pz).toFixed(1)}" fill="${fruit.base}" opacity=".7"/>`;
    }
  }
  return s + `</g>`;
}

// Things that stay put between the two photos (what the line-up check holds on to).
function props() {
  const board = [[-0.42, -CAM_H + 0.002, 0.3], [-0.22, -CAM_H + 0.002, 0.27], [-0.2, -CAM_H + 0.002, 0.4], [-0.4, -CAM_H + 0.002, 0.43]];
  const napkin = [[0.3, -CAM_H + 0.001, 0.72], [0.44, -CAM_H + 0.001, 0.7], [0.46, -CAM_H + 0.001, 0.82], [0.32, -CAM_H + 0.001, 0.84]];
  const [k0x, k0y] = proj([-0.37, -CAM_H + 0.004, 0.33]), [k1x, k1y] = proj([-0.25, -CAM_H + 0.004, 0.38]);
  return `<polygon points="${pts(board)}" fill="#b98a55" stroke="#8a6238" stroke-width="3"/>` +
    `<line x1="${k0x.toFixed(0)}" y1="${k0y.toFixed(0)}" x2="${k1x.toFixed(0)}" y2="${k1y.toFixed(0)}" stroke="#d9dde2" stroke-width="12" stroke-linecap="round"/>` +
    `<polygon points="${pts(napkin)}" fill="#3f6fb5" stroke="#2f548b" stroke-width="3"/>`;
}

// move: [dx, dy, zoom] of the camera relative to the first photo (pixels, pixels, factor).
export function scene(levels, seed, move = [0, 0, 1]) {
  const r = rng(seed);
  const body = counter() + props() + bowl(r, "Strawberries", levels.Strawberries, 0, 0.5, `s${seed}`);
  const pad = (W - H) / 2; // square canvas: QuickLook renders SVGs square (see generate.mjs)
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 ${-pad} ${W} ${W}">${defs(7)}`;
  svg += `<rect y="${-pad}" width="${W}" height="${W}" fill="#ece9e4"/>`;
  svg += `<g transform="translate(${CX + move[0]},${CY + move[1]}) scale(${move[2]}) translate(${-CX},${-CY})">${body}</g>`;
  svg += `<rect width="${W}" height="${H}" fill="url(#light)"/><rect width="${W}" height="${H}" fill="url(#vignette)"/>`;
  return svg + `<rect width="${W}" height="${H}" filter="url(#grainF)" opacity=".10"/></svg>`;
}

export function render(dir, names) {
  if (process.platform !== "darwin") return console.log("SVGs written. Convert them to JPEG to score them (JPEG rendering uses macOS qlmanage + sips).");
  execFileSync("qlmanage", ["-t", "-s", String(W), "-o", dir, ...names.map(n => path.join(dir, `${n}.svg`))], { stdio: "ignore" });
  for (const n of names) {
    const png = path.join(dir, `${n}.svg.png`);
    execFileSync("sips", ["--cropToHeightWidth", String(H), String(W), png, "--out", png], { stdio: "ignore" });
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", png, "--out", path.join(dir, `${n}.jpg`)], { stdio: "ignore" });
    rmSync(png);
  }
}

function make() {
  const seed = Number(process.argv[3] || 5);
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const r = rng(seed), key = [], names = [];
  PAIRS.forEach(([before, after], i) => {
    const n = String(i + 1).padStart(2, "0");
    const nudge = [Math.round((r() - 0.5) * 40), Math.round((r() - 0.5) * 30), 1 + (r() - 0.5) * 0.04]; // a lined-up retake is never pixel-exact
    writeFileSync(path.join(OUT, `${n}-before.svg`), scene(before, seed * 100 + i));
    writeFileSync(path.join(OUT, `${n}-after.svg`), scene(after, seed * 100 + i + 50, nudge));
    names.push(`${n}-before`, `${n}-after`);
    key.push({ before: `${n}-before.jpg`, after: `${n}-after.jpg`, levels: { before, after } });
  });
  // The same "after" as pair 1 from wrong spots (sideways, too far, too near, too low), for trying the line-up lock.
  const off = { off: [190, 60, 1], far: [0, 0, 0.8], near: [0, 0, 1.22], low: [0, -150, 1] };
  for (const [name, move] of Object.entries(off)) {
    writeFileSync(path.join(OUT, `01-after-${name}.svg`), scene(PAIRS[0][1], seed * 100 + 50, move));
    names.push(`01-after-${name}`);
  }
  writeFileSync(path.join(OUT, "key.json"), JSON.stringify({ seed, made: new Date().toISOString(), pairs: key }, null, 2));
  render(OUT, names);
  console.log(`Made ${key.length} before/after pairs in ${OUT}`);
}

async function score() {
  const i = process.argv.indexOf("--base"), BASE = i > 0 ? process.argv[i + 1] : "http://localhost:8000";
  const api = async (route, body) => {
    const res = await fetch(`${BASE}${route}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
    if (!res.ok) throw new Error(`${route}: HTTP ${res.status} ${await res.text()}`);
    return res.json();
  };
  const key = JSON.parse(readFileSync(path.join(OUT, "key.json"), "utf8"));
  await api("/api/demo", { action: "reset", scenario: "bowls" });
  const bins = (await api("/api/toppings?scenario=bowls")).bins;
  const img = f => `data:image/jpeg;base64,${readFileSync(path.join(OUT, f)).toString("base64")}`;
  const read = res => Object.fromEntries(bins.map(b => [b.name, (res.bins || []).find(e => e.id === b.id)]));
  const rows = [];
  for (const [n, p] of key.pairs.entries()) {
    const B = { scenario: "bowls", day: `2020-01-${String(n + 1).padStart(2, "0")}` }; // one made-up day per pair
    const first = await api("/api/vision", { ...B, kind: "open", image: img(p.before) });
    const alone = await api("/api/vision", { ...B, kind: "close", image: img(p.after) }); // nothing confirmed yet: no yardstick
    if (!first.available) throw new Error(`Photo check unavailable (${first.reason}). Is ANTHROPIC_API_KEY set and the server restarted?`);
    // Staff confirm the true levels of the first photo, as they would after fixing the prefill.
    await api("/api/toppings", { ...B, action: "confirm", kind: "open", levels: bins.map(b => ({ binId: b.id, level: p.levels.before[b.name] })), estimator: "vision", photoId: first.photoId, photoUsable: true });
    const t0 = Date.now();
    const second = await api("/api/vision", { ...B, kind: "close", image: img(p.after) });
    const ms = Date.now() - t0;
    if (!second.compared) throw new Error("The second photo was not compared with the first (no stored first photo?)");
    for (const b of bins) {
      rows.push({ pair: n + 1, bin: b.name, before: p.levels.before[b.name], after: p.levels.after[b.name],
        first: read(first)[b.name]?.level, alone: read(alone)[b.name]?.level, compared: read(second)[b.name]?.level, ms, model: second.model,
        usable: first.photo_usable && second.photo_usable });
    }
    process.stdout.write(".");
  }
  await api("/api/demo", { action: "reset", scenario: "bowls" });
  const tally = (got, want) => {
    const ok = rows.filter(x => x[got] === x[want]).length, near = rows.filter(x => x[got] != null && Math.abs(x[got] - x[want]) <= 0.25).length;
    return `${ok}/${rows.length} exact, ${near}/${rows.length} within one step`;
  };
  console.log(`\n\nModel ${rows[0].model}; second-photo check took ${Math.round(rows.reduce((a, x) => a + x.ms, 0) / rows.length / 100) / 10} s on average\n`);
  console.log("pair  cup            truth        first photo   second alone   second compared");
  for (const x of rows) {
    const cell = (got, want) => `${LABEL[got] ?? "?"}${got === want ? "" : " ✗"}`.padEnd(13);
    console.log(`${String(x.pair).padEnd(5)} ${x.bin.padEnd(14)} ${`${LABEL[x.before]} → ${LABEL[x.after]}`.padEnd(12)} ${cell(x.first, x.before)} ${cell(x.alone, x.after)}  ${cell(x.compared, x.after)}${x.usable ? "" : " (photo flagged unusable)"}`);
  }
  console.log(`\nFirst photo (level alone):          ${tally("first", "before")}`);
  console.log(`Second photo, no earlier photo:     ${tally("alone", "after")}`);
  console.log(`Second photo, compared with first:  ${tally("compared", "after")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === "make") make();
  else if (cmd === "score") score().catch(err => { console.error(err.message); process.exit(1); });
  else console.log("Usage: node tools/testbar/bowls.mjs make [seed]   |   node tools/testbar/bowls.mjs score [--base URL]");
}

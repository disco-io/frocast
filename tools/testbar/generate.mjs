// Synthetic topping-bar photos with a known answer key, for testing the photo check.
// Draws the demo bar (2 rows x 3 pans, same names/positions as js/demo-data.js) in 3D
// perspective: steel pans, toppings at known fill levels, counter, light and grain. No labels.
//   node tools/testbar/generate.mjs [count=24] [seed=7]
// Writes tools/testbar/out/*.svg + key.json; on macOS also renders *.jpg (qlmanage + sips).
// Besides clean photos it makes bad ones the check should catch: glare, blur, too dark,
// a column cut off, and a hand in frame.
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_BINS } from "../../js/demo-data.js";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const W = 1600, H = 1200, F = 1250, CX = W / 2, CY = H / 2;
const CAM_H = 0.5, PITCH = (45 * Math.PI) / 180;
const LEVELS = [0, 0.25, 0.5, 0.75, 1];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// World: x right, y up (camera at 0, counter at -CAM_H), z forward. Returns [screenX, screenY, depth].
function proj([x, y, z]) {
  const s = Math.sin(PITCH), c = Math.cos(PITCH);
  const zc = -y * s + z * c, yc = y * c + z * s;
  return [CX + (F * x) / zc, CY - (F * yc) / zc, zc];
}
const pts = list => list.map(p => proj(p)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

// A pan's rectangle at height y, inset i (pans taper toward the bottom).
function rect(pan, y, i = 0) {
  const { x0, x1, z0, z1 } = pan;
  return [[x0 + i, y, z0 + i], [x1 - i, y, z0 + i], [x1 - i, y, z1 - i], [x0 + i, y, z1 - i]]; // near-left, near-right, far-right, far-left
}

function panGeom(row, col) {
  const xc = (col - 2) * 0.185, zc = row === 1 ? 0.62 : 0.42;
  return { x0: xc - 0.085, x1: xc + 0.085, z0: zc - 0.09, z1: zc + 0.09, rim: -CAM_H, depth: 0.1, taper: 0.012 };
}

// ---------- toppings: small pieces placed on the topping surface ----------
const TOPPING = {
  "Strawberries": { base: "#b5122b", bump: "#e2364d", piece: (r, s) => chunk(r, s, ["#c8102e", "#d92b45", "#a30d25", "#e8455a"], "#f6d36b") },
  "Mango": { base: "#e98b0c", bump: "#f7a928", piece: (r, s) => cube(r, s, ["#f5a020", "#f7b23b", "#ee9410", "#fbbf4a"]) },
  "Kiwi": { base: "#5d8f2a", bump: "#8bbf45", piece: (r, s) => kiwi(r, s) },
  "Mochi": { base: "#e9e1d2", bump: "#fbf7ef", piece: (r, s) => cube(r, s, ["#f6f1e7", "#fbe3ea", "#e5f2dc", "#f4ecdc"]) },
  "Rainbow sprinkles": { base: "#d9cfc2", bump: "#efe7dc", piece: (r, s) => sprinkle(r, s) },
  "Popping boba": { base: "#d9900f", bump: "#f2b736", piece: (r, s) => pearl(r, s, ["#f7c12e", "#f39c12", "#e8492f", "#ffd54d"]) }
};
const pick = (r, list) => list[Math.floor(r() * list.length)];

function chunk(r, s, cols, seed) {
  const n = 6, rad = s * (0.9 + r() * 0.6), rot = r() * 6.28;
  const p = Array.from({ length: n }, (_, k) => {
    const a = rot + (k / n) * 6.28, rr = rad * (0.7 + r() * 0.45);
    return `${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr * 0.75).toFixed(1)}`;
  }).join(" ");
  const seeds = Array.from({ length: 3 }, () => `<ellipse cx="${((r() - 0.5) * rad).toFixed(1)}" cy="${((r() - 0.5) * rad * 0.6).toFixed(1)}" rx="${(s * 0.08).toFixed(1)}" ry="${(s * 0.05).toFixed(1)}" fill="${seed}"/>`).join("");
  return `<polygon points="${p}" fill="${pick(r, cols)}" stroke="#7a0a1a" stroke-width="${(s * 0.06).toFixed(1)}" stroke-opacity=".5"/>${seeds}`;
}
function cube(r, s, cols) {
  const w = s * (1.1 + r() * 0.5), rot = (r() - 0.5) * 70;
  return `<g transform="rotate(${rot.toFixed(0)})"><rect x="${(-w / 2).toFixed(1)}" y="${(-w / 2 * 0.8).toFixed(1)}" width="${w.toFixed(1)}" height="${(w * 0.8).toFixed(1)}" rx="${(w * 0.18).toFixed(1)}" fill="${pick(r, cols)}" stroke="#00000033" stroke-width="${(s * 0.07).toFixed(1)}"/>` +
    `<rect x="${(-w / 2 + w * 0.12).toFixed(1)}" y="${(-w / 2 * 0.8 + w * 0.08).toFixed(1)}" width="${(w * 0.35).toFixed(1)}" height="${(w * 0.18).toFixed(1)}" rx="${(w * 0.08).toFixed(1)}" fill="#ffffff" opacity=".35"/></g>`;
}
function kiwi(r, s) {
  const rad = s * (1.2 + r() * 0.4), seeds = Array.from({ length: 10 }, (_, k) => {
    const a = (k / 10) * 6.28, rr = rad * 0.45;
    return `<ellipse cx="${(Math.cos(a) * rr).toFixed(1)}" cy="${(Math.sin(a) * rr * 0.7).toFixed(1)}" rx="${(rad * 0.06).toFixed(1)}" ry="${(rad * 0.04).toFixed(1)}" fill="#1b1b12"/>`;
  }).join("");
  return `<ellipse rx="${rad.toFixed(1)}" ry="${(rad * 0.7).toFixed(1)}" fill="#6fa72f" stroke="#5a4a2a" stroke-width="${(rad * 0.08).toFixed(1)}"/>` +
    `<ellipse rx="${(rad * 0.78).toFixed(1)}" ry="${(rad * 0.55).toFixed(1)}" fill="#8cc63f"/><ellipse rx="${(rad * 0.22).toFixed(1)}" ry="${(rad * 0.15).toFixed(1)}" fill="#e8f2c8"/>${seeds}`;
}
function sprinkle(r, s) {
  const l = s * (0.9 + r() * 0.5), rot = r() * 180;
  return `<rect x="${(-l / 2).toFixed(1)}" y="${(-s * 0.13).toFixed(1)}" width="${l.toFixed(1)}" height="${(s * 0.26).toFixed(1)}" rx="${(s * 0.13).toFixed(1)}" transform="rotate(${rot.toFixed(0)})" fill="${pick(r, ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6", "#ff7aa8", "#ffffff"])}"/>`;
}
function pearl(r, s, cols) {
  const rad = s * (0.55 + r() * 0.2);
  return `<circle r="${rad.toFixed(1)}" fill="${pick(r, cols)}" stroke="#00000030" stroke-width="${(rad * 0.15).toFixed(1)}"/><circle cx="${(-rad * 0.3).toFixed(1)}" cy="${(-rad * 0.3).toFixed(1)}" r="${(rad * 0.28).toFixed(1)}" fill="#fff" opacity=".7"/>`;
}

// ---------- one pan ----------
function drawPan(r, bin, level, id) {
  const pan = panGeom(bin.row, bin.col);
  const { rim, depth: D, taper } = pan;
  const open = rect(pan, rim), lip = rect(pan, rim + 0.004, -0.01), floor = rect(pan, rim - D, taper);
  const [nl, nr, fr, fl] = open, [bnl, bnr, bfr, bfl] = floor;
  let s = `<clipPath id="clip${id}"><polygon points="${pts(open)}"/></clipPath>`;
  s += `<polygon points="${pts(lip)}" fill="url(#rim)" stroke="#6d737a" stroke-width="2"/>`;
  s += `<g clip-path="url(#clip${id})">`;
  s += `<polygon points="${pts(floor)}" fill="#7d848c"/>`;
  s += `<polygon points="${pts([fl, fr, bfr, bfl])}" fill="url(#wallBack)"/>`;
  s += `<polygon points="${pts([nl, fl, bfl, bnl])}" fill="url(#wallSide)"/>`;
  s += `<polygon points="${pts([nr, fr, bfr, bnr])}" fill="url(#wallSide2)"/>`;
  const t = TOPPING[bin.name];
  if (level > 0) {
    const y = rim - D + level * D * 0.96, surf = rect(pan, y, taper * (1 - level));
    s += `<clipPath id="tclip${id}"><polygon points="${pts(surf)}"/></clipPath>`;
    s += `<polygon points="${pts(surf)}" fill="${t.base}"/>`;
    s += `<g clip-path="url(#tclip${id})">`;
    const [a, b, , d] = surf;
    const n = bin.name === "Rainbow sprinkles" ? 900 : bin.name === "Kiwi" ? 70 : bin.name === "Popping boba" ? 320 : 170;
    const pieces = Array.from({ length: n }, () => ({ u: r(), v: r() })).sort((p, q) => q.v - p.v);
    for (const { u, v } of pieces) {
      const wx = a[0] + (b[0] - a[0]) * u, wz = a[2] + (d[2] - a[2]) * v;
      const [sx, sy, zc] = proj([wx, y + r() * 0.006, wz]);
      const size = (F * (bin.name === "Rainbow sprinkles" ? 0.006 : bin.name === "Popping boba" ? 0.009 : 0.011)) / zc;
      s += `<g transform="translate(${sx.toFixed(1)},${sy.toFixed(1)})">${t.piece(r, size)}</g>`;
    }
    s += `<polygon points="${pts(surf)}" fill="url(#surfShade)"/></g>`;
    // a scoop dent on some pans, so not every surface is perfectly flat
    if (r() < 0.5 && level >= 0.5) {
      const [dx, dy, zc] = proj([(a[0] + b[0]) / 2 + (r() - 0.5) * 0.05, y, (a[2] + d[2]) / 2]);
      s += `<ellipse cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" rx="${(F * 0.035 / zc).toFixed(1)}" ry="${(F * 0.018 / zc).toFixed(1)}" fill="#000" opacity=".18" filter="url(#soft)"/>`;
    }
  } else {
    for (let k = 0; k < 14; k++) { // a few crumbs on the empty floor
      const [cx, cy, zc] = proj([bnl[0] + (bnr[0] - bnl[0]) * r(), rim - D + 0.001, bnl[2] + (bfl[2] - bnl[2]) * r()]);
      s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(F * 0.003 / zc).toFixed(1)}" fill="${t.bump}" opacity=".8"/>`;
    }
  }
  s += `<polygon points="${pts([[fl[0], rim - D, fl[2]], [fr[0], rim - D, fr[2]], fr, fl])}" fill="#000" opacity=".08"/>`; // depth shade at the back
  s += `</g>`;
  return s;
}

// ---------- scene ----------
function counter() {
  const c = [[-1.4, -CAM_H, 0.18], [1.4, -CAM_H, 0.18], [1.4, -CAM_H, 1.4], [-1.4, -CAM_H, 1.4]];
  const back = proj([0, -CAM_H, 1.4])[1];
  let s = `<rect x="-600" y="-200" width="${W + 1200}" height="${back + 220}" fill="url(#wall)"/>`;
  s += `<rect x="-600" y="-200" width="${W + 1200}" height="${back + 220}" fill="url(#tiles)" opacity=".5"/>`;
  s += `<polygon points="${pts(c)}" fill="#ece9e4"/><polygon points="${pts(c)}" fill="url(#quartz)" opacity=".55"/>`;
  s += `<rect x="-600" y="${H - 30}" width="${W + 1200}" height="260" fill="#ece9e4"/>`;
  return s;
}

function hand() {
  // an arm reaching in from the bottom right toward the front middle pan
  return `<g filter="url(#softEdge)">
    <path d="M 1500 1260 C 1380 1130 1250 1050 1120 990 L 1050 1080 C 1180 1140 1300 1200 1380 1290 Z" fill="#2f3b52"/>
    <path d="M 1130 995 C 1050 950 980 900 905 860 C 880 845 860 860 872 880 C 900 905 940 925 965 945
             C 920 935 870 930 830 925 C 805 922 800 948 822 955 C 870 968 920 975 960 985
             C 915 990 870 995 835 1003 C 812 1008 818 1033 840 1032 C 885 1028 930 1022 968 1018
             C 935 1030 905 1045 882 1058 C 862 1070 875 1092 896 1082 C 950 1058 1000 1045 1055 1078 Z"
          fill="url(#skin)" stroke="#9c6b4e" stroke-width="2"/>
  </g>`;
}

function defs(seed) {
  return `<defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3efe8"/><stop offset="1" stop-color="#ddd6ca"/></linearGradient>
    <pattern id="tiles" width="90" height="45" patternUnits="userSpaceOnUse"><rect width="90" height="45" fill="none" stroke="#c9c1b4" stroke-width="2"/></pattern>
    <filter id="quartzF"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="3" seed="${seed}"/><feColorMatrix values="0 0 0 0 .6  0 0 0 0 .6  0 0 0 0 .6  0 0 0 .5 0"/></filter>
    <pattern id="quartz" width="${W}" height="${H}" patternUnits="userSpaceOnUse"><rect width="${W}" height="${H}" filter="url(#quartzF)"/></pattern>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".45" stop-color="#a9afb6"/><stop offset=".7" stop-color="#d8dce0"/><stop offset="1" stop-color="#8f969d"/></linearGradient>
    <linearGradient id="wallBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3c8ce"/><stop offset="1" stop-color="#6f767e"/></linearGradient>
    <linearGradient id="wallSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa1a8"/><stop offset="1" stop-color="#7b828a"/></linearGradient>
    <linearGradient id="wallSide2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#868d95"/><stop offset="1" stop-color="#b3b9bf"/></linearGradient>
    <linearGradient id="surfShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".4" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient>
    <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8b796"/><stop offset="1" stop-color="#c98a63"/></linearGradient>
    <radialGradient id="vignette" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
    <linearGradient id="light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e8" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
    <radialGradient id="glare"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".55" stop-color="#fff" stop-opacity=".92"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="softEdge"><feGaussianBlur stdDeviation="1.2"/></filter>
    <filter id="blurAll"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="grainF"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="${seed + 1}"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .5 0"/></filter>
  </defs>`;
}

function scene(levels, variant, seed) {
  const r = rng(seed);
  let body = counter();
  const order = DEMO_BINS.slice().sort((a, b) => a.row - b.row); // back row first (painter's order)
  order.forEach((b, i) => { body += drawPan(r, b, levels[b.name], `${seed}-${i}`); });
  const shift = variant === "cutoff" ? 470 : (r() - 0.5) * 60; // small framing jitter; cutoff pushes column 3 out of frame
  const tilt = (r() - 0.5) * 3;
  // Square canvas with the 4:3 scene in the middle: macOS QuickLook renders SVGs into a square
  // and would otherwise zoom and crop. The renderer then keeps the middle H rows.
  const pad = (W - H) / 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 ${-pad} ${W} ${W}">${defs(seed)}`;
  svg += `<rect y="${-pad}" width="${W}" height="${W}" fill="#ece9e4"/>`;
  svg += `<g ${variant === "blur" ? 'filter="url(#blurAll)"' : ""}><g transform="translate(${shift.toFixed(0)},${((r() - 0.5) * 40).toFixed(0)}) rotate(${tilt.toFixed(2)} ${CX} ${CY})">${body}</g>`;
  if (variant === "hand") svg += hand();
  svg += `</g>`;
  if (variant === "glare") {
    const [gx, gy] = proj([0, -CAM_H, 0.55]);
    svg += `<ellipse cx="${(gx + shift).toFixed(0)}" cy="${gy.toFixed(0)}" rx="330" ry="250" fill="url(#glare)"/><polygon points="420,0 620,0 1180,${H} 980,${H}" fill="#fff" opacity=".35"/>`;
  }
  svg += `<rect width="${W}" height="${H}" fill="url(#light)"/><rect width="${W}" height="${H}" fill="url(#vignette)"/>`;
  svg += `<rect width="${W}" height="${H}" filter="url(#grainF)" opacity=".10"/>`;
  if (variant === "dark") svg += `<rect width="${W}" height="${H}" fill="#06070a" opacity=".86"/>`;
  return svg + "</svg>";
}

// What a correct photo check should say about each variant.
const EXPECT = {
  clean: { usable: true, problems: [], hidden: [] },
  glare: { usable: false, problems: ["glare"], hidden: ["Mango", "Rainbow sprinkles"] },
  blur: { usable: false, problems: ["blur"], hidden: [] },
  dark: { usable: false, problems: ["too_dark"], hidden: [] },
  cutoff: { usable: false, problems: ["bins_cut_off"], hidden: ["Kiwi", "Popping boba"] },
  hand: { usable: false, problems: ["person_in_frame"], hidden: [] }
};

function main() {
  const count = Number(process.argv[2] || 24), seed0 = Number(process.argv[3] || 7);
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const r = rng(seed0);
  const variants = [...Array(count).fill("clean"), "glare", "glare", "blur", "dark", "cutoff", "hand"];
  const key = [];
  variants.forEach((variant, i) => {
    // spread levels so every level shows up often across the set
    const levels = Object.fromEntries(DEMO_BINS.map((b, k) => [b.name, LEVELS[(i + k * 2 + Math.floor(r() * 5)) % 5]]));
    const file = `${String(i + 1).padStart(2, "0")}-${variant}`;
    writeFileSync(path.join(OUT, `${file}.svg`), scene(levels, variant, seed0 * 100 + i));
    key.push({ file: `${file}.jpg`, variant, levels, expect: EXPECT[variant] });
  });
  writeFileSync(path.join(OUT, "key.json"), JSON.stringify({ seed: seed0, made: new Date().toISOString(), images: key }, null, 2));
  if (process.platform === "darwin") {
    const svgs = key.map(k => path.join(OUT, k.file.replace(".jpg", ".svg")));
    execFileSync("qlmanage", ["-t", "-s", String(W), "-o", OUT, ...svgs], { stdio: "ignore" });
    for (const k of key) {
      const png = path.join(OUT, k.file.replace(".jpg", ".svg.png")), jpg = path.join(OUT, k.file);
      execFileSync("sips", ["--cropToHeightWidth", String(H), String(W), png, "--out", png], { stdio: "ignore" }); // centered crop
      execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", png, "--out", jpg], { stdio: "ignore" });
      rmSync(png);
    }
    console.log(`Made ${key.length} photos in ${OUT} (JPEG + SVG) with key.json`);
  } else {
    console.log(`Made ${key.length} SVGs in ${OUT} with key.json. Convert them to JPEG (e.g. open in a browser) to run eval.mjs.`);
  }
}

main();

// Photo line-up check: is the camera looking at the same spot as an earlier photo?
// Both pictures are shrunk to a small grayscale grid, lighting is taken out, and the live
// grid is slid and zoomed over the earlier one to find where they agree best. Plain math on
// small arrays, so it runs several times a second on a phone and in node tests.
// It measures framing only (left/right, up/down, distance). It never looks at fill levels.

export const GW = 64; // grid width; the height follows the frame's shape
export const gridH = (w, h) =>
  Math.max(24, Math.min(96, Math.round((GW * h) / w)));
export const MIN_SCORE = 0.42; // below this the two pictures don't show the same scene
export const TOL = 0.05; // lined up = within 5% of the frame, left/right and up/down
const SCALES = [0.8, 0.87, 0.93, 1, 1.07, 1.15, 1.25];
const SCALE_OK = [0.9, 1.1]; // one zoom step either way still counts as the same distance

// RGBA bytes (canvas ImageData) at k times the grid size -> grayscale grid, averaging k x k blocks.
export function gray(rgba, w, h, k = 1) {
  const out = new Float32Array(w * h),
    W = w * k;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) {
          const p = ((y * k + j) * W + x * k + i) * 4;
          sum += rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114;
        }
      }
      out[y * w + x] = sum / (k * k);
    }
  }
  return out;
}

// Take out lighting: each cell minus the average of its neighborhood. What is left is shape
// (rims, edges, the table's pattern), which is what stays put between the two photos.
// A small neighborhood (w/16) keeps a different scene with similar lighting from passing.
export function detail(g, w, h, r = Math.round(w / 16)) {
  const sat = new Float64Array((w + 1) * (h + 1)); // summed-area table
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += g[y * w + x];
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r),
      y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r),
        x1 = Math.min(w, x + r + 1);
      const sum =
        sat[y1 * (w + 1) + x1] -
        sat[y0 * (w + 1) + x1] -
        sat[y1 * (w + 1) + x0] +
        sat[y0 * (w + 1) + x0];
      out[y * w + x] = g[y * w + x] - sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

// Magnify a grid by s around its center (s < 1 shrinks; cells from outside the frame are 0).
function zoom(src, w, h, s) {
  if (s === 1) return src;
  const out = new Float32Array(w * h),
    cx = (w - 1) / 2,
    cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    const sy = cy + (y - cy) / s,
      y0 = Math.floor(sy),
      fy = sy - y0;
    if (y0 < 0 || y0 + 1 >= h) continue;
    for (let x = 0; x < w; x++) {
      const sx = cx + (x - cx) / s,
        x0 = Math.floor(sx),
        fx = sx - x0;
      if (x0 < 0 || x0 + 1 >= w) continue;
      const p = y0 * w + x0;
      out[y * w + x] =
        (src[p] * (1 - fx) + src[p + 1] * fx) * (1 - fy) +
        (src[p + w] * (1 - fx) + src[p + w + 1] * fx) * fy;
    }
  }
  return out;
}

// How well ref matches live moved by (dx, dy): 1 = same picture, 0 = unrelated.
function corr(ref, live, w, h, dx, dy) {
  let ab = 0,
    aa = 0,
    bb = 0;
  const x0 = Math.max(0, -dx),
    x1 = Math.min(w, w - dx),
    y0 = Math.max(0, -dy),
    y1 = Math.min(h, h - dy);
  for (let y = y0; y < y1; y++) {
    const ra = y * w,
      rb = (y + dy) * w + dx;
    for (let x = x0; x < x1; x++) {
      const a = ref[ra + x],
        b = live[rb + x];
      ab += a * b;
      aa += a * a;
      bb += b * b;
    }
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

// Best fit of the live grid onto the earlier one. Both are detail() grids of the same size.
//   dx, dy: how far the live picture sits to the right of / below the earlier one, in grid cells
//   scale:  how much the live picture must be magnified to match (> 1: the camera is too far away)
export function match(ref, live, w, h) {
  const mx = Math.round(w / 4),
    my = Math.round(h / 4);
  let best = { dx: 0, dy: 0, scale: 1, score: -1 },
    grid = live;
  for (const scale of SCALES) {
    const z = zoom(live, w, h, scale);
    for (let dy = -my; dy <= my; dy += 2) {
      for (let dx = -mx; dx <= mx; dx += 2) {
        const score = corr(ref, z, w, h, dx, dy);
        if (score > best.score) {
          best = { dx, dy, scale, score };
          grid = z;
        }
      }
    }
  }
  const c = { ...best };
  for (let dy = c.dy - 1; dy <= c.dy + 1; dy++) {
    for (let dx = c.dx - 1; dx <= c.dx + 1; dx++) {
      const score = corr(ref, grid, w, h, dx, dy);
      if (score > best.score) best = { dx, dy, scale: c.scale, score };
    }
  }
  return best;
}

// What to tell the person holding the phone. hint is one of:
//   ok | lost | turn | closer | back | left | right | up | down   (the way to move the phone)
// pct is a rough 0-100 "how close" for the meter.
// loose: for a photo taken without the live guide (plain camera app), where nobody can hit 5% blind.
export function verdict(m, w, h, { turned = false, loose = false } = {}) {
  const tol = loose ? 0.12 : TOL, zoomOk = loose ? [0.84, 1.2] : SCALE_OK;
  if (turned) return { ok: false, hint: "turn", pct: 0 };
  if (!m || m.score < MIN_SCORE) return { ok: false, hint: "lost", pct: 0 };
  const fx = m.dx / w,
    fy = m.dy / h,
    zoomOff = Math.abs(Math.log(m.scale));
  const off = Math.max(Math.abs(fx), Math.abs(fy), zoomOff * 0.6);
  const pct = Math.round(100 * Math.max(0, 1 - off / 0.25));
  if (m.scale > zoomOk[1]) return { ok: false, hint: "closer", pct };
  if (m.scale < zoomOk[0]) return { ok: false, hint: "back", pct };
  if (Math.abs(fx) > tol || Math.abs(fy) > tol) {
    // Picture sits too far right -> move the phone right, which slides the picture left.
    const hint =
      Math.abs(fx) >= Math.abs(fy)
        ? fx > 0
          ? "right"
          : "left"
        : fy > 0
          ? "down"
          : "up";
    return { ok: false, hint, pct };
  }
  return { ok: true, hint: "ok", pct: Math.max(pct, 80) };
}

// Browser only: an <img>, <video> or canvas -> detail grid, center-cropped to the grid's shape
// (the same crop as CSS object-fit: cover, so it matches what the overlay shows).
let pad = null;
export function grid(source, w, h) {
  const sw = source.videoWidth || source.naturalWidth || source.width,
    sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) return null;
  const k = 4;
  pad ||= document.createElement("canvas");
  pad.width = w * k;
  pad.height = h * k;
  const cw = Math.min(sw, (sh * w) / h),
    ch = Math.min(sh, (sw * h) / w);
  const ctx = pad.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(
    source,
    (sw - cw) / 2,
    (sh - ch) / 2,
    cw,
    ch,
    0,
    0,
    w * k,
    h * k,
  );
  return detail(gray(ctx.getImageData(0, 0, w * k, h * k).data, w, h, k), w, h);
}

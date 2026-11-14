// Photo line-up check: a made-up table scene (two bowls, a few objects) is "photographed"
// from slightly different camera positions and the hint must say which way to move the phone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GW, gridH, gray, detail, match, verdict } from "../js/align.js";

const W = GW, H = gridH(4, 3);

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

// A scene in table coordinates (0-1 across the reference frame): discs with a fill brightness.
function scene(seed, { leftFill = 0.25 } = {}) {
  const r = rng(seed);
  const things = Array.from({ length: 7 }, () => ({ x: -0.3 + r() * 1.6, y: -0.3 + r() * 1.6, rad: 0.03 + r() * 0.06, v: r() }));
  const bowls = [{ x: 0.3, y: 0.55, rad: 0.17, v: 0.95, fill: leftFill }, { x: 0.7, y: 0.55, rad: 0.17, v: 0.95, fill: 0.7 }];
  return (x, y) => {
    let v = 0.55 + 0.1 * Math.sin(x * 9) * Math.cos(y * 7); // table pattern
    for (const t of things) if (Math.hypot(x - t.x, y - t.y) < t.rad) v = t.v;
    for (const b of bowls) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.rad) v = d < b.rad * 0.8 ? b.fill : b.v; // rim, then what's inside
    }
    return v;
  };
}

// Photograph the scene: the camera is moved right/down by (cx, cy) frame widths and sits
// `dist` times as far away; light is `gain` times as bright. Returns a detail grid.
function shoot(sc, { cx = 0, cy = 0, dist = 1, gain = 1, noise = 0, seed = 1 } = {}) {
  const k = 3, r = rng(seed), rgba = new Uint8ClampedArray(W * k * H * k * 4);
  for (let y = 0; y < H * k; y++) {
    for (let x = 0; x < W * k; x++) {
      const u = 0.5 + cx + ((x + 0.5) / (W * k) - 0.5) * dist, v = 0.5 + cy + ((y + 0.5) / (H * k) - 0.5) * dist;
      const val = Math.max(0, Math.min(255, (sc(u, v) * gain + (r() - 0.5) * noise) * 255));
      rgba.set([val, val, val, 255], (y * W * k + x) * 4);
    }
  }
  return detail(gray(rgba, W, H, k), W, H);
}
const check = (ref, live, opts) => verdict(match(ref, live, W, H), W, H, opts);

test("same spot lines up, even in different light and with the left bowl half emptied", () => {
  const ref = shoot(scene(3));
  assert.equal(check(ref, shoot(scene(3), { noise: 0.05, seed: 9 })).hint, "ok");
  assert.equal(check(ref, shoot(scene(3), { gain: 0.7, noise: 0.05, seed: 4 })).hint, "ok", "dimmer light");
  const emptied = check(ref, shoot(scene(3, { leftFill: 0.9 }), { cx: 0.01, noise: 0.05, seed: 5 }));
  assert.equal(emptied.ok, true, "fruit removed from one bowl still lines up");
});

test("hints say which way to move the phone", () => {
  const sc = scene(3), ref = shoot(sc);
  assert.equal(check(ref, shoot(sc, { cx: 0.12 })).hint, "left", "camera drifted right -> move left");
  assert.equal(check(ref, shoot(sc, { cx: -0.12 })).hint, "right");
  assert.equal(check(ref, shoot(sc, { cy: 0.14 })).hint, "up", "camera drifted down -> move up");
  assert.equal(check(ref, shoot(sc, { cy: -0.14 })).hint, "down");
  assert.equal(check(ref, shoot(sc, { dist: 1.25 })).hint, "closer", "camera too far away");
  assert.equal(check(ref, shoot(sc, { dist: 0.8 })).hint, "back", "camera too close");
  assert.equal(check(ref, shoot(sc, { cx: 0.12 })).ok, false);
});

test("a different scene, or a phone turned sideways, never unlocks", () => {
  const ref = shoot(scene(3));
  for (const seed of [11, 12, 13, 14, 15]) {
    const other = (x, y) => scene(seed)(y * 1.3 + 2, x * 0.7 - 1); // unrelated objects, no bowls where the reference has them
    const v = check(ref, shoot(other, { seed }));
    assert.equal(v.ok, false, `scene ${seed} must not line up`);
  }
  const blank = shoot(() => 0.5);
  assert.equal(check(ref, blank).hint, "lost", "a blank wall is not the scene");
  assert.deepEqual(check(ref, ref, { turned: true }), { ok: false, hint: "turn", pct: 0 });
});

test("small hand shake stays inside the tolerance", () => {
  const sc = scene(8), ref = shoot(sc);
  for (const [cx, cy] of [[0.02, 0], [-0.02, 0.02], [0, -0.03], [0.03, 0.03]]) {
    assert.equal(check(ref, shoot(sc, { cx, cy, noise: 0.04, seed: 2 })).ok, true, `shake ${cx},${cy}`);
  }
});

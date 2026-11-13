// Draws the topographic lines used as backgrounds on the home page.
//
//   node scripts/topo/generate.mjs
//
// static/topo-hero.svg  behind the hero: a wave of lines that starts just under the header.
// static/topo-tile.svg  the rest of the page: repeats top to bottom without a seam
//                       (the height field wraps around vertically), with blank patches
//                       where the terrain is flat.
//
// Each picture is a smooth height field traced with d3-contour and smoothed with a
// B-spline. The field is computed on a grid larger than the picture so the contour rings
// close outside it and no line runs along an edge. Same seeds, same pictures.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contours } from "d3-contour";
import { line, curveBasisClosed } from "d3-shape";

const PAD = 120; // grid overhang on every side
const CELL = 8; // grid spacing in viewBox units
const STEP = 2; // keep every 2nd contour point; the B-spline smooths over the gaps

// Seeded PRNG (mulberry32).
function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D value noise summed over octaves. With `periodY` set, the lattice wraps every
// `periodY` units of y (and every octave doubles, so the sum wraps too).
function makeNoise(seed, periodY = 0) {
  const rand = rng(seed);
  const perm = Array.from({ length: 1024 }, () => rand());
  const mod = (n, m) => ((n % m) + m) % m;
  const fade = (t) => t * t * (3 - 2 * t);
  function noise(x, y, p) {
    const hash = (i, j) => perm[(((i * 73856093) ^ ((p ? mod(j, p) : j) * 19349663)) >>> 0) % 1024];
    const i = Math.floor(x), j = Math.floor(y);
    const u = fade(x - i), v = fade(y - j);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  return function fbm(x, y, octaves = 3) {
    let sum = 0, amp = 0.5, f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * f + o * 17.3, y * f, periodY * f);
      amp *= 0.5; f *= 2;
    }
    return sum;
  };
}

// Lines every `spacing` of height from `from` up to `to` (default: the highest point).
function trace({ W, H, height, spacing, from, to = Infinity, opacity }) {
  const gw = Math.ceil((W + 2 * PAD) / CELL) + 1;
  const gh = Math.ceil((H + 2 * PAD) / CELL) + 1;
  const values = new Float64Array(gw * gh);
  let max = -Infinity;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const v = height(i * CELL - PAD, j * CELL - PAD);
    values[j * gw + i] = v;
    if (v > max) max = v;
  }
  const thresholds = [];
  for (let t = from; t <= Math.min(to, max); t += spacing) thresholds.push(t);

  const toView = ([gx, gy]) => [gx * CELL - PAD, gy * CELL - PAD];
  const smooth = line().curve(curveBasisClosed);
  const paths = [];
  for (const c of contours().size([gw, gh]).thresholds(thresholds)(values)) {
    for (const polygon of c.coordinates) {
      for (const ring of polygon) {
        const pts = ring.slice(0, -1).filter((_, k) => k % STEP === 0).map(toView);
        if (pts.length < 6) continue;
        // Skip rings that sit wholly outside the picture.
        if (pts.every(([x, y]) => x < 0 || x > W || y < 0 || y > H)) continue;
        paths.push(smooth(pts).replace(/-?\d+\.\d+/g, (m) => String(Math.round(+m))));
      }
    }
  }
  // Opacity is baked in so the files work as CSS backgrounds.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<path fill="none" stroke="#fff" stroke-opacity="${opacity}" stroke-width="1.1" vector-effect="non-scaling-stroke" d="${paths.join("")}"/>
</svg>
`;
}

// ── Hero: lines hang from a wavy crest just under the header and fill the rest. ──
function hero() {
  const W = 1600, H = 1300;
  const fbm = makeNoise(7);
  // Hills (positive) and hollows (negative): [x, y, radius, height].
  const bumps = [
    [1320, 980, 150, 0.95],
    [230, 1120, 140, -1.3],
    [620, 1200, 110, 1.1],
    [360, 640, 120, 0.6],
    [1150, 420, 120, -0.45],
  ];
  const crest = (x) => H * (0.1 - 0.06 * Math.sin((x / W) * Math.PI * 2.1 + 0.55) - 0.03 * Math.sin((x / W) * Math.PI * 5.3 + 1.7));
  const height = (x, y) => {
    const below = (y - crest(x)) / 1250; // < 0 above the crest
    // Steeper on the slopes of the wave, which bunches the lines there.
    const slope = 3.4 + 2.2 * Math.cos((x / W) * Math.PI * 2.1 + 0.2);
    let h = below * slope;
    h += 0.55 * (fbm(x / 420 + 3.1, y / 420 + 1.7) - 0.5) * Math.min(1, Math.max(0, below * 4 + 0.3));
    for (const [bx, by, r, a] of bumps) h += a * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (2 * r * r));
    return h;
  };
  return trace({ W, H, height, spacing: 0.085, from: 0.02, opacity: 0.2 });
}

// ── Tile: wraps vertically. Lines only between two heights, so flat ground stays blank. ──
function tile() {
  const W = 1600, H = 3200;
  const S = 640; // feature size
  const period = H / S; // noise lattice cells per tile height (must be a whole number)
  const fbm = makeNoise(21, period);
  const warp = makeNoise(5, period);
  const height = (x, y) => {
    // Domain warp bends the lines so they flow rather than blob.
    const wx = x / S + 0.8 * (warp(x / S, y / S, 1) - 0.25);
    const wy = y / S + 0.8 * (warp(x / S + 9.2, y / S, 1) - 0.25);
    return fbm(wx, wy, 2);
  };
  return trace({ W, H, height, spacing: 0.016, from: 0.33, to: 0.62, opacity: 0.12 });
}

for (const [name, svg] of [["topo-hero.svg", hero()], ["topo-tile.svg", tile()]]) {
  const out = fileURLToPath(new URL(`../../static/${name}`, import.meta.url));
  writeFileSync(out, svg);
  console.log(`${name}: ${(svg.length / 1024).toFixed(0)} KB`);
}

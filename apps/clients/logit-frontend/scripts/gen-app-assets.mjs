// Generates the @capacitor/assets source images in ./assets from the LogIt
// staircase mark (a stepped zig-zag line + three detached tread dashes).
//
//   node scripts/gen-app-assets.mjs
//   npx @capacitor/assets generate --android --ios
//
// Re-run whenever the mark changes. Outputs are committed.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets");
mkdirSync(outDir, { recursive: true });

const BG = "#1D2035";
const FG = "#F7F7F8";

// The mark, drawn in its own 1000x1000 box. Stepped line rising left→right with a
// slight rightward lean on the risers, plus one floating tread per step.
function markSvg({ stroke = 74 } = {}) {
  const zig = "150,795 190,795 380,795 430,505 470,505 620,505 670,215 710,215 880,215"
    .split(" ")
    .map((p) => p)
    .join(" ");
  return `
  <g transform="translate(-15 73)" fill="none" stroke="${FG}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="${zig}" />
    <line x1="205" y1="640" x2="355" y2="640" />
    <line x1="450" y1="350" x2="600" y2="350" />
    <line x1="695" y1="60"  x2="845" y2="60" />
  </g>`;
}

// Compose an SVG: the mark scaled to `markFrac` of the canvas, centred.
function composed({ size, markFrac, bg }) {
  const m = size * markFrac;
  const off = (size - m) / 2;
  const scale = m / 1000;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ""}
    <g transform="translate(${off} ${off}) scale(${scale})">${markSvg()}</g>
  </svg>`);
}

const jobs = [
  // @capacitor/assets adds its own padding (legacy icons) and a 16.7% inset
  // (adaptive foreground), so the source marks are drawn large here.
  { file: "icon-only.png",       size: 1024, markFrac: 0.78, bg: BG },
  { file: "icon-foreground.png", size: 1024, markFrac: 0.74, bg: null },
  { file: "icon-background.png", size: 1024, markFrac: 0.0001, bg: BG },
  { file: "splash.png",          size: 2732, markFrac: 0.19, bg: BG },
  { file: "splash-dark.png",     size: 2732, markFrac: 0.19, bg: BG },
  { file: "logo.png",            size: 1024, markFrac: 0.78, bg: BG },
];

for (const j of jobs) {
  await sharp(composed(j)).png().toFile(join(outDir, j.file));
  console.log("wrote", j.file);
}

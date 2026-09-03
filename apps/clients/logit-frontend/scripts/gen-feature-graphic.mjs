// Google Play feature graphic: exactly 1024x500, no transparency.
//   node scripts/gen-feature-graphic.mjs  ->  store/play/feature-graphic.png
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "store", "play", "feature-graphic.png");

const BG = "#1D2035";
const FG = "#F7F7F8";
const MUTED = "#9AA0B4";

const mark = `
  <g transform="translate(96 150) scale(0.2)" fill="none" stroke="${FG}" stroke-width="74"
     stroke-linecap="round" stroke-linejoin="round">
    <polyline points="150,795 380,795 430,505 620,505 670,215 880,215" />
    <line x1="205" y1="640" x2="355" y2="640" />
    <line x1="450" y1="350" x2="600" y2="350" />
    <line x1="695" y1="60"  x2="845" y2="60" />
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="${BG}"/>
  ${mark}
  <text x="330" y="230" font-family="Inter, Arial, sans-serif" font-size="86" font-weight="700" fill="${FG}">LogIt</text>
  <text x="332" y="292" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="400" fill="${MUTED}">Offline-first workout, nutrition &amp; habit tracker</text>
</svg>`;

await sharp(Buffer.from(svg)).png().flatten({ background: BG }).toFile(out);
console.log("wrote", out);

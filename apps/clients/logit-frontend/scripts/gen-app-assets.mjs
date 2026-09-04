// Generates the @capacitor/assets source images in ./assets from the LogIt staircase mark
// (../../../../scripts/brand-mark.png — the canonical raster, shared with gen-favicons.mjs
// so mobile and web can't drift apart the way they did before).
//
//   node scripts/gen-app-assets.mjs
//   npx @capacitor/assets generate --android --ios
//
// Re-run whenever the mark changes. Outputs are committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { backgroundColor, backgroundFill, composedOnBg } from "../../../../scripts/brandMark.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "assets");
mkdirSync(outDir, { recursive: true });

const BG = await backgroundColor();

const jobs = [
  // @capacitor/assets adds its own padding (legacy icons) and a 16.7% inset
  // (adaptive foreground), so the source marks are drawn large here.
  { file: "icon-only.png",       make: () => composedOnBg({ size: 1024, markFrac: 0.78, bg: BG }) },
  { file: "icon-foreground.png", make: () => composedOnBg({ size: 1024, markFrac: 0.74, bg: null }) },
  { file: "icon-background.png", make: () => backgroundFill(1024) },
  { file: "splash.png",          make: () => composedOnBg({ size: 2732, markFrac: 0.19, bg: BG }) },
  { file: "splash-dark.png",     make: () => composedOnBg({ size: 2732, markFrac: 0.19, bg: BG }) },
  { file: "logo.png",            make: () => composedOnBg({ size: 1024, markFrac: 0.78, bg: BG }) },
];

for (const j of jobs) {
  writeFileSync(join(outDir, j.file), await j.make());
  console.log("wrote", j.file);
}

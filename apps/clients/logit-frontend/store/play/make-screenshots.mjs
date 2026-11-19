// Play listing screenshots: 1080 × 1920 (9:16), a short caption above a real app screen.
// The app screens come from the website's capture pipeline (sample data, dark mode):
//   apps/clients/website/scripts/screenshots/README.md, captured at 390 × 844 @3x.
// Usage: node make-screenshots.mjs <dir with home.png, workout.png, …>
// Writes phone-screenshots/NN-name.png next to this file.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../package.json"));
const { chromium } = require("@playwright/test");

const SHOTS = [
  ["workout", "Know what to lift, every set", "Weights and reps planned from your last session"],
  ["home", "Your week, planned", "Pick your days. The workouts are ready when you are."],
  ["progress", "Goals you can see coming", "Streaks, goals and when you'll reach them"],
  ["sessions", "Every session, kept", "Your history, PRs and what went up"],
  ["nutrition", "Food that fits your training", "Big offline food list, barcode scanning, targets that adapt"],
  ["habits", "Habits next to your training", "Steps, sleep, supplements: tick them off"],
];

const src = resolve(process.argv[2] ?? ".");
const out = join(here, "phone-screenshots");
mkdirSync(out, { recursive: true });
const font = pathToFileURL(resolve(here, "../../../../../packages/ui/fonts/Inter-VariableFont_opsz,wght.ttf")).href;

const html = (img, title, sub) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url("${font}");font-weight:100 900}
html,body{margin:0}
body{width:1080px;height:1920px;overflow:hidden;font-family:Inter;color:#F2F4F7;
 background:radial-gradient(900px 800px at 0% 100%, rgba(37,75,160,.45), transparent 70%),
  radial-gradient(800px 700px at 100% 0%, rgba(150,100,20,.22), transparent 70%), #080A0E;
 display:flex;flex-direction:column;align-items:center}
.cap{padding:120px 80px 0;text-align:center;display:flex;flex-direction:column;gap:22px}
h1{margin:0;font-size:76px;line-height:1.08;font-weight:700;letter-spacing:-.03em}
p{margin:0;font-size:36px;line-height:1.35;color:#9AA3B2}
.phone{margin-top:84px;width:700px;height:1515px;border-radius:64px;overflow:hidden;
 border:10px solid #1A1F28;box-shadow:0 40px 120px rgba(0,0,0,.6);background:#000}
.phone img{width:100%;display:block}
</style></head><body>
<div class="cap"><h1>${title}</h1><p>${sub}</p></div>
<div class="phone"><img src="${img}"></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
let n = 0;
for (const [name, title, sub] of SHOTS) {
  const img = join(src, `${name}.png`);
  if (!existsSync(img)) { console.warn("missing", img); continue; }
  const file = join(out, `.frame-${name}.html`);
  writeFileSync(file, html(pathToFileURL(img).href, title, sub));
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  const dest = join(out, `${String(++n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: dest });
  console.log("wrote", dest);
}
await browser.close();

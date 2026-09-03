// Play Store phone screenshots, captured from the running app at a phone viewport.
//
//   npm run dev -- --port 5199          # in one terminal
//   node scripts/capture-screenshots.mjs   # in another
//
// Writes PNGs to store/play/phone-screenshots/. These are placeholders — real
// device captures look better on the listing. The onboarding gate is skipped by
// seeding the stores the app checks on boot; adjust SEED if that logic changes.
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:5199";
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "store", "play", "phone-screenshots");
mkdirSync(outDir, { recursive: true });

// Pixel-6-ish portrait; Play wants 1080–3840px on the long edge, 16:9 or 9:16.
const viewport = { width: 1080, height: 2160 };
const deviceScaleFactor = 1;

// Mark onboarding complete so the app boots straight to the home screen.
const SEED = () => {
  localStorage.setItem(
    "logit:onboarding:v1",
    JSON.stringify({ completed: true, step: 0 }),
  );
};

const SHOTS = [
  { path: "/", name: "01-home" },
  { path: "/splits", name: "02-splits" },
  { path: "/session/current", name: "03-session" },
  { path: "/sessions", name: "04-history" },
  { path: "/progress", name: "05-progress" },
  { path: "/nutrition", name: "06-nutrition" },
  { path: "/habits", name: "07-habits" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport, deviceScaleFactor, isMobile: true });
await ctx.addInitScript(SEED);
const page = await ctx.newPage();

for (const shot of SHOTS) {
  try {
    await page.goto(BASE + shot.path, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(outDir, `${shot.name}.png`) });
    console.log("captured", shot.name);
  } catch (e) {
    console.warn("skipped", shot.name, "-", e.message);
  }
}

await browser.close();
console.log("done ->", outDir);

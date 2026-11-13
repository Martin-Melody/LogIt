// node capture.mjs <outDir> "path|name|steps" ...
// Seeds localStorage from seed.json (or $SEED) and screenshots each path at a phone viewport
// (390 × 844 at 3×, dark mode) from the app's dev server ($APP_URL, default localhost:5199).
// Steps (";"-separated): click:<text> clickx:<exact text> role:<button name> scroll:<px>
//   see:<text> top:<text> fill:<selector>::<value> submit goto:<path> wait:<ms>. See README.md.
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const require = createRequire(new URL("../../../logit-frontend/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const [outDir, ...targets] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const seed = JSON.parse(readFileSync(new URL(process.env.SEED || "./seed.json", import.meta.url), "utf8"));
const BASE = process.env.APP_URL || "http://localhost:5199";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  colorScheme: "dark", timezoneId: "Europe/Dublin", locale: "en-IE",
});
await ctx.addInitScript((s) => {
  if (sessionStorage.getItem("seeded")) return;
  for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  sessionStorage.setItem("seeded", "1");
}, seed);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.warn("pageerror", e.message));
for (const t of targets) {
  const [path, name, action] = t.split("|");
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  if (action) {
    for (const step of action.split(";")) {
      if (step.startsWith("click:")) await page.getByText(step.slice(6), { exact: false }).first().click();
      if (step.startsWith("clickx:")) await page.getByText(step.slice(7), { exact: true }).first().click();
      if (step.startsWith("role:")) await page.getByRole("button", { name: step.slice(5) }).first().click();
      if (step.startsWith("scroll:")) await page.mouse.wheel(0, Number(step.slice(7)));
      if (step.startsWith("see:")) await page.getByText(step.slice(4), { exact: false }).first().scrollIntoViewIfNeeded();
      if (step.startsWith("top:")) await page.getByText(step.slice(4), { exact: false }).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
      if (step.startsWith("fill:")) { const [sel, val] = step.slice(5).split("::"); await page.fill(sel, val); }
      if (step.startsWith("submit")) await page.locator('button[type="submit"]').first().click();
      if (step.startsWith("goto:")) await page.goto(BASE + step.slice(5), { waitUntil: "networkidle" });
      if (step.startsWith("wait:")) await page.waitForTimeout(Number(step.slice(5)));
      await page.waitForTimeout(900);
    }
  }
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("shot", name);
}
await browser.close();

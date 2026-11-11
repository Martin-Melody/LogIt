import { test, expect } from "@playwright/test";

// Every control on the main screens is at least 40px tall (44px for the
// workout screen, checked in session-flow.spec.ts). Links inside a sentence
// ("No active split. Set one up") are exempt, as in WCAG 2.5.8.

const ROUTES = [
  "/", "/sessions", "/settings", "/exercises", "/splits", "/profile", "/progress",
  "/habits", "/habits/new", "/plugins", "/settings/navbar",
  "/nutrition", "/nutrition/log", "/nutrition/weight", "/nutrition/goal", "/nutrition/insights",
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem(
      "logit:tours:v1",
      JSON.stringify(Object.fromEntries(["home", "session", "splits", "progress", "exercises", "nutrition", "sessions", "settings", "profile", "habits", "plugins"].map((k) => [k, true]))),
    );
  });
});

for (const route of ROUTES) {
  test(`no control under 40px on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const small = await page.evaluate(() =>
      [...document.querySelectorAll("button, a[href], input, select, [role=button], [role=switch], [role=tab]")]
        .filter((el) => {
          if (el.closest("nav[aria-label='Main navigation']")) return false;
          // Links (or link-styled buttons) inside running text.
          if (el.parentElement?.tagName === "P" && getComputedStyle(el).display.startsWith("inline")) return false;
          return true;
        })
        .map((el) => {
          // Segments and tabs: the tap area covers their whole track.
          const inTrack = (el.hasAttribute("aria-pressed") || el.getAttribute("role") === "tab") && el.parentElement?.classList.contains("p-[3px]");
          const r = (inTrack ? el.parentElement! : el).getBoundingClientRect();
          return { label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40), h: Math.round(r.height), w: r.width };
        })
        .filter((x) => x.w > 0 && x.h > 0 && x.h < 40)
        .map((x) => `${x.label} (${x.h}px)`),
    );
    expect(small).toEqual([]);
  });
}

import { test, expect, type Page } from "@playwright/test";

// Bottom-nav pages: the Start tab doesn't start a workout by itself, and swiping moves
// between the bar pages in bar order. Signed out, the default bar is Home, Exercises (in
// place of Social), Profile, so the order is Home ↔ Exercises ↔ Start ↔ Profile.

async function seed(page: Page, opts: { swipe?: boolean } = {}) {
  await page.addInitScript(({ swipe }) => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem(
      "logit:tours:v1",
      JSON.stringify({ home: true, session: true, splits: true, splitDetail: true, splitDay: true, exercises: true, profile: true }),
    );
    if (swipe === false) {
      localStorage.setItem(
        "logit:nav-config:v1",
        JSON.stringify({
          bar: ["home", "social", "profile"],
          more: ["messages", "sessions", "splits", "progress", "exercises", "nutrition", "habits", "settings", "plugins"],
          swipe: false,
        }),
      );
    }
  }, opts);
}

/** A one-finger horizontal swipe across the middle of the page content. */
async function swipe(page: Page, direction: "left" | "right") {
  // Let the previous page slide finish: during a view transition touches hit the
  // transition layer, not the page. The URL changes a frame before the slide starts.
  await page.waitForTimeout(250);
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.evaluate((direction) => {
    const main = document.querySelector("main")!;
    const rect = main.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    const [from, to] = direction === "left" ? [0.8, 0.2] : [0.2, 0.8];
    const x0 = rect.width * from;
    const x1 = rect.width * to;
    const target = document.elementFromPoint(x0, y) ?? main;
    const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: y });
    const fire = (type: string, x: number, active: boolean) =>
      target.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: active ? [touch(x)] : [],
          changedTouches: [touch(x)],
        }),
      );
    fire("touchstart", x0, true);
    for (let i = 1; i <= 5; i++) fire("touchmove", x0 + ((x1 - x0) * i) / 5, true);
    fire("touchend", x1, false);
  }, direction);
}

test("the Start tab shows an idle screen and only starts a workout when asked", async ({ page }) => {
  await seed(page);
  await page.goto("/session/current");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("No workout running.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("logit:draft:v1"))).toBeNull();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page.getByText("Nothing logged yet.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("logit:draft:v1"))).not.toBeNull();
});

test("swiping moves between the bar pages in bar order", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await swipe(page, "right"); // already the leftmost page
  await expect(page).toHaveURL(/\/$/);

  await swipe(page, "left");
  await expect(page).toHaveURL(/\/exercises$/);

  await swipe(page, "left");
  await expect(page).toHaveURL(/\/session\/current$/);
  await expect(page.getByText("No workout running.")).toBeVisible();

  await swipe(page, "left");
  await expect(page).toHaveURL(/\/profile$/);

  await swipe(page, "right");
  await expect(page).toHaveURL(/\/session\/current$/);
});

test("swiping does nothing when turned off", async ({ page }) => {
  await seed(page, { swipe: false });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await swipe(page, "left");
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/$/);
});

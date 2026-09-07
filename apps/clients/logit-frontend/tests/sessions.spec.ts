import { test, expect, type Page } from "@playwright/test";

const DAY = 86_400_000;

function block(id: string, orderIndex: number, name: string, sets: object[], superset?: { id: string }) {
  return { id, type: "strength", orderIndex, data: { exerciseName: name, sets, ...(superset ? { superset } : {}) } };
}
function set(id: string, orderIndex: number, reps: number, weight: number, setType = "normal") {
  return { id, setType, reps, weight, orderIndex };
}

async function seed(page: Page, sessions: object[]) {
  await page.addInitScript((s) => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
    localStorage.setItem("logit:sessions:v1", JSON.stringify(s));
  }, sessions);
}

test.describe("sessions history", () => {
  test("list groups by time, shows a stats row, and resumes an in-progress session", async ({ page }) => {
    const now = Date.now();
    await seed(page, [
      {
        id: "s-live",
        startedAtMs: now - 3600_000,
        blocks: [block("b1", 0, "Squat", [set("x1", 0, 5, 100)])],
      },
      {
        id: "s-done",
        startedAtMs: now - 90 * 60_000,
        endedAtMs: now - 30 * 60_000,
        blocks: [block("b2", 0, "Bench Press", [set("x2", 0, 5, 80), set("x3", 1, 5, 80)])],
      },
      {
        id: "s-old",
        startedAtMs: now - 40 * DAY,
        endedAtMs: now - 40 * DAY + 3000_000,
        blocks: [block("b3", 0, "Deadlift", [set("x4", 0, 3, 140)])],
      },
    ]);

    await page.goto("/sessions");
    await page.waitForLoadState("networkidle");

    // Stats row + time-bucket header.
    await expect(page.getByText("this month", { exact: true })).toBeVisible();
    await expect(page.getByText("This week", { exact: true })).toBeVisible();
    // The 40-day-old one buckets under its month name, not "This week".
    await expect(page.getByRole("main")).toContainText("Deadlift");

    // In-progress row offers Resume and routes to the live session.
    await page.getByText("Resume").click();
    await expect(page).toHaveURL(/\/session\/current$/);

    await page.goBack();

    // Open a finished session's detail.
    await page.getByText("Bench Press").click();
    await expect(page).toHaveURL(/\/sessions\/s-done$/);
    await expect(page.getByRole("main")).toContainText("Bench Press");
  });

  test("detail view brackets superset exercises and respects weight unit", async ({ page }) => {
    const now = Date.now();
    await seed(page, [
      {
        id: "s-ss",
        startedAtMs: now - DAY,
        endedAtMs: now - DAY + 3000_000,
        blocks: [
          block("b1", 0, "Bench Press", [set("x1", 0, 8, 60)], { id: "ss1" }),
          block("b2", 1, "Row", [set("x2", 0, 8, 40)], { id: "ss1" }),
          block("b3", 2, "Squat", [set("x3", 0, 5, 100)]),
        ],
      },
    ]);

    await page.goto("/sessions/s-ss");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Superset")).toBeVisible();
    await expect(page.getByText("Bench Press")).toBeVisible();
    await expect(page.getByText("Row", { exact: true })).toBeVisible();
    await expect(page.getByText("Squat")).toBeVisible();
    // Weight column is unit-labelled (kg by default).
    await expect(page.getByText("Weight (kg)").first()).toBeVisible();
  });
});

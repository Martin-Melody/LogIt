import { test, expect, type Page } from "@playwright/test";

const DAY = 86_400_000;

function block(id: string, orderIndex: number, name: string, sets: object[], superset?: { id: string }) {
  return { id, type: "strength", orderIndex, data: { exerciseName: name, sets, ...(superset ? { superset } : {}) } };
}
function set(id: string, orderIndex: number, reps: number, weight: number, setType = "normal") {
  return { id, setType, reps, weight, orderIndex };
}

async function seed(page: Page, sessions: object[], draft?: object) {
  await page.addInitScript(({ s, d }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
    localStorage.setItem("logit:sessions:v1", JSON.stringify(s));
    // The workout running now (an unfinished session that isn't this is a leftover).
    if (d) localStorage.setItem("logit:draft:v1", JSON.stringify(d));
  }, { s: sessions, d: draft });
}

test.describe("sessions history", () => {
  test("list groups by time, shows a stats row, and resumes an in-progress session", async ({ page }) => {
    const now = Date.now();
    const live = { id: "s-live", startedAtMs: now - 3600_000, blocks: [block("b1", 0, "Squat", [set("x1", 0, 5, 100)])] };
    await seed(page, [
      live,
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
    ], live);

    await page.goto("/sessions");
    await page.waitForLoadState("networkidle");

    // Month count under the calendar + time-bucket header (the live session isn't counted).
    await expect(page.getByText(/· 1 this month$/)).toBeVisible();
    await expect(page.getByText("This week · 1 workout", { exact: true })).toBeVisible();
    // The 40-day-old one buckets under its month name, not "This week".
    await expect(page.getByRole("main")).toContainText("Deadlift");

    // In-progress row offers Resume and routes to the live session.
    await page.getByRole("main").getByText("Resume").click();
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
    // Weight column is headed with the unit (kg by default).
    await expect(page.getByText("kg", { exact: true }).first()).toBeVisible();
  });
});

test("leftover unfinished workouts can be finished or deleted from the list", async ({ page }) => {
  const now = Date.now();
  await seed(page, [
    { id: "s-empty1", startedAtMs: now - 30 * DAY, blocks: [] },
    { id: "s-empty2", startedAtMs: now - 20 * DAY, blocks: [] },
    {
      id: "s-half",
      startedAtMs: now - 10 * DAY,
      blocks: [block("b1", 0, "Dips", [{ ...set("x1", 0, 8, 10), completed: true }, { ...set("x2", 1, 0, 0), target: { reps: 8, weight: 10 } }])],
    },
  ]);
  await page.goto("/sessions");
  await page.waitForLoadState("networkidle");

  // None of them is the running workout: no Resume, each marked Unfinished.
  await expect(page.getByRole("main").getByText("Resume")).toHaveCount(0);
  await expect(page.getByText("Unfinished", { exact: true })).toHaveCount(3);

  // Both empty ones go in one go.
  await page.getByRole("button", { name: "Delete 2 empty" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Unfinished", { exact: true })).toHaveCount(1);

  // The one with a logged set is finished: it ends at its last activity, not now.
  await page.getByRole("main").getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText("Unfinished", { exact: true })).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("logit:sessions:v1")!));
  expect(stored.map((x: { id: string }) => x.id)).toEqual(["s-half"]);
  expect(stored[0].endedAtMs).toBe(stored[0].startedAtMs);
  // The planned set that was never done is dropped.
  expect(stored[0].blocks[0].data.sets).toHaveLength(1);
});

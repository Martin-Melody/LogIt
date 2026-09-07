import { test, expect, type Page } from "@playwright/test";

const SPLIT_ID = "split-pw";

async function seed(page: Page, opts: { withDraft?: boolean } = {}) {
  await page.addInitScript(
    ({ splitId, withDraft }) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
      localStorage.setItem(
        "logit:tours:v1",
        JSON.stringify({ home: true, session: true, splits: true, splitDetail: true, splitDay: true }),
      );
      localStorage.setItem(
        "logit:splits:v1",
        JSON.stringify([
          {
            id: splitId,
            name: "PPL",
            archived: false,
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
            days: [
              {
                id: "d1",
                orderIndex: 0,
                name: "Push",
                blocks: [
                  { type: "strength", id: "p1", orderIndex: 0, exerciseName: "Bench Press", targets: {} },
                  { type: "strength", id: "p2", orderIndex: 1, exerciseName: "Overhead Press", targets: {} },
                ],
              },
            ],
          },
        ]),
      );
      if (withDraft) {
        localStorage.setItem(
          "logit:draft:v1",
          JSON.stringify({
            id: "old-sess",
            startedAtMs: Date.now() - 60_000,
            blocks: [{ id: "b0", type: "strength", orderIndex: 0, data: { exerciseName: "Squat", sets: [] } }],
          }),
        );
      }
    },
    { splitId: SPLIT_ID, withDraft: !!opts.withDraft },
  );
}

test.describe("start a session from a split day", () => {
  test("Start button on a day row opens a session with that day's exercises", async ({ page }) => {
    await seed(page);
    await page.goto(`/splits/${SPLIT_ID}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /Start a workout from Push/ }).click();

    await expect(page).toHaveURL(/\/session\/current$/);
    await expect(page.getByRole("main")).toContainText("Bench Press");
    await expect(page.getByRole("main")).toContainText("Overhead Press");
  });

  test("confirms before replacing an in-progress workout", async ({ page }) => {
    await seed(page, { withDraft: true });
    await page.goto(`/splits/${SPLIT_ID}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /Start a workout from Push/ }).click();
    await expect(page.getByText("Replace your current workout?")).toBeVisible();

    await page.getByRole("button", { name: "Keep current" }).click();
    await expect(page).toHaveURL(/\/splits\//);

    await page.getByRole("button", { name: /Start a workout from Push/ }).click();
    await page.getByRole("button", { name: "Start this day" }).click();
    await expect(page).toHaveURL(/\/session\/current$/);
    await expect(page.getByRole("main")).toContainText("Bench Press");
  });
});

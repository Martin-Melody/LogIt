/**
 * A set 2+ reps short of its aim re-plans the untouched sets after it, and the card's
 * "Keep the plan" / "Use lighter" button swaps between the two as often as wanted.
 */
import { test, expect, type Page } from "@playwright/test";

async function seed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
    localStorage.setItem("logit:profile:v1", JSON.stringify({ blocksCollapsedByDefault: false }));
    const t = (reps: number, weight: number) => ({ reps, weight });
    localStorage.setItem(
      "logit:draft:v1",
      JSON.stringify({
        id: "current-sess",
        startedAtMs: Date.now() - 600_000,
        blocks: [{
          id: "b-now", type: "strength", orderIndex: 0,
          data: {
            exerciseName: "Lateral Raise",
            sets: [
              { id: "s1", setType: "normal", orderIndex: 0, reps: 12, weight: 17.5, completed: true, target: t(12, 17.5) },
              { id: "s2", setType: "normal", orderIndex: 1, reps: 7, weight: 17.5, target: t(10, 17.5) },
              { id: "s3", setType: "normal", orderIndex: 2, reps: 0, weight: 17.5, target: t(8, 17.5) },
              { id: "s4", setType: "normal", orderIndex: 3, reps: 0, weight: 12.5, target: t(8, 12.5) },
            ],
          },
        }],
      }),
    );
  });
}

const placeholders = (page: Page) =>
  page.getByTestId("set-weight").evaluateAll((els) => els.slice(2).map((e) => (e as HTMLInputElement).placeholder));

test("a short set makes the rest lighter, and the plan can be kept and un-kept", async ({ page }) => {
  await seed(page);
  await page.goto("/session/current");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => placeholders(page)).toEqual(["17.5", "12.5"]);

  await page.getByRole("button", { name: "Mark complete" }).first().click();
  const line = page.getByTestId("replan-line");
  await expect(line).toContainText("Set 2 was 3 reps short, so sets 3 and 4 are lighter.");
  await expect.poll(() => placeholders(page)).toEqual(["15", "10"]);
  await page.screenshot({ path: "test-results/live-replan-lighter.png" });

  await line.getByRole("button", { name: "Keep the plan" }).click();
  await expect(line).toContainText("Kept your plan for sets 3 and 4.");
  await expect.poll(() => placeholders(page)).toEqual(["17.5", "12.5"]);

  await line.getByRole("button", { name: "Use lighter" }).click();
  await expect.poll(() => placeholders(page)).toEqual(["15", "10"]);
});

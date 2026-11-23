/**
 * LogIt Adaptive on the session screen: every set planned from the strength estimate, so
 * last session's light back-off sets don't set today's weights.
 */
import { test, expect, type Page } from "@playwright/test";

async function seed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
    localStorage.setItem("logit:profile:v1", JSON.stringify({ blocksCollapsedByDefault: false }));
    localStorage.setItem("logit:progression:config:v1", JSON.stringify({ algorithmId: "logit-adaptive" }));
    const day = 86_400_000;
    localStorage.setItem(
      "logit:sessions:v1",
      JSON.stringify([
        {
          id: "past",
          startedAtMs: Date.now() - 3 * day,
          endedAtMs: Date.now() - 3 * day + 3_600_000,
          // 7 × 95, then two lighter sets: the case from Martin's notes.
          blocks: [
            {
              id: "b-past",
              type: "strength",
              orderIndex: 0,
              data: {
                exerciseName: "Bench Press",
                sets: [
                  { id: "p1", setType: "normal", reps: 7, weight: 95, orderIndex: 0, completed: true },
                  { id: "p2", setType: "normal", reps: 9, weight: 68, orderIndex: 1, completed: true },
                  { id: "p3", setType: "normal", reps: 6, weight: 60, orderIndex: 2, completed: true },
                ],
              },
            },
          ],
        },
      ]),
    );
    localStorage.setItem(
      "logit:draft:v1",
      JSON.stringify({
        id: "current-sess",
        startedAtMs: Date.now() - 600_000,
        blocks: [{ id: "b-now", type: "strength", orderIndex: 0, data: { exerciseName: "Bench Press", sets: [] } }],
      }),
    );
  });
}

async function plannedSets(page: Page): Promise<string> {
  const reps = page.getByTestId("set-reps");
  await expect(reps.first()).toBeVisible({ timeout: 5_000 });
  const weights = page.getByTestId("set-weight");
  const out: string[] = [];
  for (let i = 0; i < (await reps.count()); i++) {
    const r = (await reps.nth(i).inputValue()) || (await reps.nth(i).getAttribute("placeholder")) || "";
    const w = (await weights.nth(i).inputValue()) || (await weights.nth(i).getAttribute("placeholder")) || "";
    out.push(`${r}×${w}kg`);
  }
  return out.join("|");
}

test("plans every set from the strength estimate, not last session's light sets", async ({ page }) => {
  await seed(page);
  await page.goto("/session/current");
  await page.waitForLoadState("networkidle");

  await expect.poll(() => plannedSets(page)).toBe("7×95kg|6×95kg|5×95kg");
  await expect(page.getByText("Same weight").first()).toBeVisible();

  await page.getByTestId("reason-line").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Your strength estimate is 117 kg");
  await expect(dialog).toContainText("68 kg and 60 kg sets were well under");
});

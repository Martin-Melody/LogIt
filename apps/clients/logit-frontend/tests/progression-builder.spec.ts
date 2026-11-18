/**
 * Build an algorithm from blocks: the preview runs it on real history, saving adds it to
 * the algorithm lists, and an exercise set to it gets its plan in a workout.
 */
import { test, expect, type Page } from "@playwright/test";

async function seed(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
    localStorage.setItem("logit:profile:v1", JSON.stringify({ blocksCollapsedByDefault: false }));
    localStorage.setItem("logit:progression:config:v1", JSON.stringify({ algorithmId: "logit-adaptive" }));
    const day = 86_400_000;
    const bench = (id: string, sets: object[]) => ({
      id,
      type: "strength",
      orderIndex: 0,
      data: { exerciseName: "Bench Press", exerciseId: "core_bench_press", sets },
    });
    localStorage.setItem(
      "logit:sessions:v1",
      JSON.stringify([
        {
          id: "past",
          startedAtMs: Date.now() - 3 * day,
          endedAtMs: Date.now() - 3 * day + 3_600_000,
          blocks: [
            bench("b-past", [
              { id: "p1", setType: "normal", reps: 7, weight: 95, orderIndex: 0, completed: true },
              { id: "p2", setType: "normal", reps: 9, weight: 68, orderIndex: 1, completed: true },
              { id: "p3", setType: "normal", reps: 6, weight: 60, orderIndex: 2, completed: true },
            ]),
          ],
        },
      ]),
    );
    localStorage.setItem(
      "logit:draft:v1",
      JSON.stringify({ id: "current-sess", startedAtMs: Date.now() - 600_000, blocks: [bench("b-now", [])] }),
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

test("build an algorithm, preview it, and use it on one exercise", async ({ page }) => {
  await seed(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Build an algorithm" }).click();
  await page.waitForURL(/\/settings\/progression\/build\/new/);

  const preview = page.getByTestId("recipe-preview");
  await expect(preview).toContainText("Your next Bench Press");
  await expect(preview).toContainText("95 kg × 7");

  await page.getByRole("radio", { name: "Top set + back-offs" }).click();
  await expect(preview).toContainText("85 kg × 8");
  await expect(preview).toContainText("One top set at 95 kg");

  await page.getByLabel("Name").fill("Top and back-offs");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/settings/);
  await expect(page.getByText("Top and back-offs", { exact: true })).toBeVisible(); // not the "Saved …" toast

  await page.goto("/exercises/core_bench_press");
  const section = page.getByRole("region", { name: "How it progresses" });
  await section.getByRole("radio", { name: "Top and back-offs" }).click();
  await expect(section.getByRole("radio", { name: "Top and back-offs" })).toHaveAttribute("aria-checked", "true");

  await page.goto("/session/current");
  await expect.poll(() => plannedSets(page)).toBe("7×95kg|8×85kg|8×85kg");
});

test("a 5/3/1 wave shows week 1 and its percentages", async ({ page }) => {
  await seed(page);
  await page.goto("/settings/progression/build/new");
  await page.getByRole("radio", { name: "Weekly wave (5/3/1)" }).click();
  const preview = page.getByTestId("recipe-preview");
  // e1RM 117 → training max 105 → 65/75/85%.
  await expect(preview).toContainText("Week 1 of 4 (5s): 65%, 75%, 85% of the training max.");
  await expect(preview).toContainText("90 kg × 5+");
});

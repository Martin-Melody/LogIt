/**
 * Exercise › How it progresses: a rep range set on one exercise changes that exercise's
 * plan in a workout, and the exercise shows up under Settings › Progression.
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
              { id: "p1", setType: "normal", reps: 5, weight: 100, orderIndex: 0, completed: true },
              { id: "p2", setType: "normal", reps: 4, weight: 100, orderIndex: 1, completed: true },
              { id: "p3", setType: "normal", reps: 3, weight: 100, orderIndex: 2, completed: true },
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

test("a rep range set on bench changes its plan and shows in Settings", async ({ page }) => {
  await seed(page);

  // (The default plan, 7/6/5 × 95 kg, is covered in adaptive-progression.spec.ts. Opening the
  // workout here first would write that plan into the draft before the setting changes.)
  await page.goto("/exercises/core_bench_press");
  await page.getByRole("tab", { name: "Settings" }).click();
  const section = page.getByRole("region", { name: "How it progresses" });
  await expect(section.getByRole("radio", { name: "Default 5–8" })).toHaveAttribute("aria-checked", "true");
  await section.getByRole("radio", { name: "3–6" }).click();
  await expect(section.getByRole("radio", { name: "3–6" })).toHaveAttribute("aria-checked", "true");

  await page.goto("/session/current");
  await expect.poll(() => plannedSets(page)).toBe("5×100kg|4×100kg|3×100kg");

  await page.goto("/settings/progression");
  await expect(page.getByTestId("exercise-overrides")).toContainText("Bench Press");
  await expect(page.getByTestId("exercise-overrides")).toContainText("3–6 reps");

  // Back to default removes it again.
  await page.goto("/exercises/core_bench_press");
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("region", { name: "How it progresses" }).getByRole("radio", { name: /^Default/ }).click();
  await page.goto("/settings/progression");
  await expect(page.getByTestId("exercise-overrides")).toContainText("None yet");
});

test("no suggestions for one exercise only", async ({ page }) => {
  await seed(page);
  await page.goto("/exercises/core_bench_press");
  await page.getByRole("tab", { name: "Settings" }).click();
  const section = page.getByRole("region", { name: "How it progresses" });
  await section.getByRole("radio", { name: /No suggestions/ }).click();
  await expect(section.getByRole("radio", { name: /No suggestions/ })).toHaveAttribute("aria-checked", "true");
  await page.goto("/session/current");
  // No plan for bench: the block starts empty.
  await expect(page.getByText("Add first set")).toBeVisible();
  await expect(page.getByTestId("set-reps")).toHaveCount(0);
});

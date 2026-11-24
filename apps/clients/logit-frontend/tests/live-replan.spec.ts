/**
 * A set 2+ reps short of its aim re-plans the untouched sets after it, and the card's
 * "Keep the plan" / "Use lighter" button swaps between the two as often as wanted.
 */
import { test, expect, type Page } from "@playwright/test";

type SeedSet = { id: string; reps: number; weight: number; completed?: boolean; target: { reps: number; weight: number } };
type SeedBlock = { id: string; name: string; sets: SeedSet[] };
const t = (reps: number, weight: number) => ({ reps, weight });
const LATERAL: SeedBlock[] = [{
  id: "b-now", name: "Lateral Raise", sets: [
    { id: "s1", reps: 12, weight: 17.5, completed: true, target: t(12, 17.5) },
    { id: "s2", reps: 7, weight: 17.5, target: t(10, 17.5) },
    { id: "s3", reps: 0, weight: 17.5, target: t(8, 17.5) },
    { id: "s4", reps: 0, weight: 12.5, target: t(8, 12.5) },
  ],
}];

async function seed(page: Page, blocks: SeedBlock[] = LATERAL, foldOthers = false) {
  await page.addInitScript(({ blocks, foldOthers }) => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
    localStorage.setItem("logit:profile:v1", JSON.stringify({ blocksCollapsedByDefault: foldOthers }));
    localStorage.setItem(
      "logit:draft:v1",
      JSON.stringify({
        id: "current-sess",
        startedAtMs: Date.now() - 600_000,
        blocks: blocks.map((b, i) => ({
          id: b.id, type: "strength", orderIndex: i,
          data: { exerciseName: b.name, sets: b.sets.map((x, j) => ({ setType: "normal", orderIndex: j, ...x })) },
        })),
      }),
    );
  }, { blocks, foldOthers });
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

test("a set that beat its aim makes the rest heavier", async ({ page }) => {
  // Martin's T-Bar Row (24 Nov): planned 42.5 × 13, 8, 6; set 2 was 45 × 8.
  await seed(page, [{
    id: "b-tbar", name: "T-Bar Row", sets: [
      { id: "s1", reps: 13, weight: 42.5, completed: true, target: t(13, 42.5) },
      { id: "s2", reps: 8, weight: 45, target: t(8, 42.5) },
      { id: "s3", reps: 0, weight: 42.5, target: t(6, 42.5) },
    ],
  }]);
  await page.goto("/session/current");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => placeholders(page)).toEqual(["42.5"]);

  await page.getByRole("button", { name: "Mark complete" }).first().click();
  await expect(page.getByTestId("replan-line")).toContainText("Set 2 beat its aim by 2 reps, so set 3 goes up.");
  await expect.poll(() => placeholders(page)).toEqual(["45"]);
});

test("the last set's effort question keeps the exercise open until it's answered", async ({ page }) => {
  await seed(page, [
    { id: "b-curl", name: "Incline Biceps Curl", sets: [
      { id: "c1", reps: 9, weight: 20, completed: true, target: t(8, 20) },
      { id: "c2", reps: 0, weight: 17.5, target: t(8, 17.5) },
    ] },
    { id: "b-pull", name: "Lat Pulldown", sets: [{ id: "p1", reps: 0, weight: 60, target: t(8, 60) }] },
  ], true);
  await page.goto("/session/current");
  await page.waitForLoadState("networkidle");
  const curlSets = page.locator("[data-stage]").first().getByTestId("set-reps");
  await expect(curlSets).toHaveCount(2);

  await page.getByRole("button", { name: "Mark complete" }).first().click();
  const ask = page.getByTestId("effort-prompt");
  await expect(ask).toBeVisible();
  await expect(curlSets).toHaveCount(2);
  await ask.getByRole("button", { name: "1 left" }).click();
  await expect(curlSets).toHaveCount(0);
});

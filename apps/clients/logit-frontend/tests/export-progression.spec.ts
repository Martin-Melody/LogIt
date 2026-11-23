/**
 * The backup file carries per-exercise progression settings, algorithms built from blocks
 * and algorithm settings, and restoring it brings them back.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("progression settings and built algorithms survive a backup and restore", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
    localStorage.setItem("logit:progression:config:v1", JSON.stringify({ algorithmId: "logit-adaptive" }));
    localStorage.setItem("logit:progression:prefs:v1", JSON.stringify({ "logit-adaptive": { repsInReserve: 1 } }));
    localStorage.setItem(
      "logit:progression:exercise-settings:v1",
      JSON.stringify({ core_bench_press: { key: "core_bench_press", exerciseId: "core_bench_press", exerciseName: "Bench Press", repRange: [3, 6], createdAtMs: 1, updatedAtMs: 2 } }),
    );
    localStorage.setItem(
      "logit:progression:recipes:v1",
      JSON.stringify({
        rcpp_1: {
          id: "rcpp_1", name: "Top and back-offs", weightFrom: "estimate", repsInReserve: 0, setLayout: "topBackoff",
          increment: 2.5, whenStalled: "deload", sets: { mode: "fixed", count: 3 }, food: "ignore", createdAtMs: 1, updatedAtMs: 2,
        },
      }),
    );
  });

  await page.goto("/settings/data");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download backup file/ }).click();
  const file = await (await downloading).path();
  const backup = JSON.parse(readFileSync(file, "utf8"));
  expect(backup.progression.recipes[0]).toMatchObject({ id: "rcpp_1", name: "Top and back-offs", setLayout: "topBackoff" });
  expect(backup.progression.exerciseSettings[0]).toMatchObject({ key: "core_bench_press", repRange: [3, 6] });
  expect(backup.progression.preferences["logit-adaptive"]).toEqual({ repsInReserve: 1 });

  // Lose them, then restore from the file.
  await page.evaluate(() => {
    localStorage.removeItem("logit:progression:recipes:v1");
    localStorage.removeItem("logit:progression:exercise-settings:v1");
  });
  await page.reload();
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Select backup file/ }).click();
  await (await choosing).setFiles(file);
  await page.getByRole("button", { name: "Restore selected" }).click();

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("logit:progression:recipes:v1") ?? ""))
    .toContain("Top and back-offs");
  const settings = await page.evaluate(() => localStorage.getItem("logit:progression:exercise-settings:v1") ?? "");
  expect(settings).toContain("[3,6]");
});

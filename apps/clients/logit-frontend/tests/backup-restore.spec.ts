import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function bypass(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true, profile: true }));
  });
}

test.describe("backup & restore", () => {
  test("v2 backup carries every subsystem and restores a custom exercise", async ({ page }) => {
    await bypass(page);
    await page.addInitScript(() => {
      const now = Date.now();
      localStorage.setItem(
        "logit:exercises:custom",
        JSON.stringify([
          { id: "ex-custom", name: "Zercher Squat", notes: null, isCore: false, createdAtMs: now, primaryMuscles: [], secondaryMuscles: [] },
        ]),
      );
      // A plugin-settings blob — proves the plugin keys are snapshotted.
      localStorage.setItem("logit:plugin-settings:v1", JSON.stringify({ "demo.plugin": { enabled: true } }));
    });

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // ── Export ────────────────────────────────────────────────────────────
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download backup file/ }).click();
    const backupJson = readFileSync(await (await downloadPromise).path(), "utf8");
    const backup = JSON.parse(backupJson);

    expect(backup.version).toBe(2);
    // Every v2 section is present (possibly empty).
    for (const key of ["nutrition", "habits", "plugins", "exercises", "splits", "sessions", "progression"]) {
      expect(backup, `backup has ${key}`).toHaveProperty(key);
    }
    expect(backup.exercises).toHaveLength(1);
    expect(backup.plugins["logit:plugin-settings:v1"]).toContain("demo.plugin");

    // ── Fresh page, restore ───────────────────────────────────────────────
    const ctx = await page.context().browser()!.newContext();
    const fresh = await ctx.newPage();
    await bypass(fresh);
    await fresh.goto("/settings");
    await fresh.waitForLoadState("networkidle");

    fresh.once("filechooser", (fc) => {
      void fc.setFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backupJson) });
    });
    await fresh.getByRole("button", { name: /Select backup file/ }).click();

    await expect(fresh.getByText("Select what to restore:")).toBeVisible();
    await expect(fresh.getByRole("checkbox", { name: /Installed plugins/ })).toBeVisible();

    await fresh.getByRole("button", { name: /Restore selected/ }).click();
    await expect(fresh.getByText(/Restore complete/)).toBeVisible();

    const restored = await fresh.evaluate(() => ({
      exercises: JSON.parse(localStorage.getItem("logit:exercises:custom") ?? "[]"),
      pluginSettings: localStorage.getItem("logit:plugin-settings:v1"),
    }));
    expect(restored.exercises.map((e: { name: string }) => e.name)).toContain("Zercher Squat");
    expect(restored.pluginSettings).toContain("demo.plugin");

    await ctx.close();
  });

  test("a v1 backup still imports (no nutrition/habits/plugins sections)", async ({ page }) => {
    await bypass(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const v1 = JSON.stringify({
      version: 1,
      exportedAtMs: Date.now(),
      profile: { name: "Old", weightUnit: "kg", heightUnit: "cm", height: null, weight: null, bio: "", blocksCollapsedByDefault: true, restDefaults: {} },
      homeConfig: {},
      profileConfig: {},
      exercises: [{ id: "e1", name: "Good Morning", notes: null, isCore: false, createdAtMs: 0, primaryMuscles: [], secondaryMuscles: [] }],
      splits: { splits: [], activeSplitId: null },
      sessions: [],
      progression: { config: null, states: [] },
    });

    page.once("filechooser", (fc) => {
      void fc.setFiles({ name: "v1.json", mimeType: "application/json", buffer: Buffer.from(v1) });
    });
    await page.getByRole("button", { name: /Select backup file/ }).click();

    await expect(page.getByText("Select what to restore:")).toBeVisible();
    // The new categories aren't offered for a v1 file.
    await expect(page.getByRole("checkbox", { name: /Installed plugins/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /Nutrition/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Exercise library" })).toBeVisible();

    await page.getByRole("button", { name: /Restore selected/ }).click();
    await expect(page.getByText(/Restore complete/)).toBeVisible();
  });
});

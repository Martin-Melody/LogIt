// "Copy to mine" — P3 (cheap tier) of docs/architecture/profile-progress-redesign.md.
// Algorithm and Widget post payloads already carry just an id into a fixed registry
// (progression/analytics/nutrition algorithms; bundled widgets), so "copy" is just applying
// that id to the viewer's own account — same-account local writes, no new API endpoint.
import { get } from "svelte/store";
import { setProgressionAlgorithm } from "@logit/core/usecases/progression/getProgressionConfig";
import { setAnalyticsPlugin } from "@logit/core/usecases/progression/getAnalyticsConfig";
import { setNutritionAlgorithm } from "@logit/core/usecases/nutrition/getNutritionAlgorithmConfig";
import { touchGoal, defaultNutritionGoal } from "@logit/core/domain/nutrition";
import { getProgressionDeps } from "$lib/usecases/progressionDeps";
import { bumpProgression } from "$lib/progression/store";
import { getNutritionRepo } from "$lib/data/repoProvider";
import { pushNutritionGoal } from "$lib/sync/syncService";
import { profileConfig } from "$lib/stores/profileConfig.store";
import { homeConfig } from "$lib/stores/homeConfig.store";
import { localProfileWidgetRegistry } from "$lib/features/profileWidgets/localProfileWidgetRegistry";
import { localWidgetRegistry } from "$lib/features/widgets/localWidgetRegistry";

export type AlgorithmFamily = "progression" | "analytics" | "nutrition";

export async function copyAlgorithmToMine(id: string, family: AlgorithmFamily): Promise<void> {
  if (family === "progression") {
    await setProgressionAlgorithm(id, getProgressionDeps());
    bumpProgression();
    return;
  }
  if (family === "analytics") {
    await setAnalyticsPlugin(id, getProgressionDeps());
    bumpProgression();
    return;
  }
  // nutrition — the goal record itself carries the algorithm choice, unlike
  // progression/analytics which have their own config rows.
  const repo = getNutritionRepo();
  const existing = await repo.getGoal();
  const goal = existing ?? defaultNutritionGoal();
  const next = touchGoal(setNutritionAlgorithm(goal, id));
  await repo.saveGoal(next);
  pushNutritionGoal(next);
}

/** Enables the widget if it isn't already — never disables one the copier already has on,
 * since this a `toggleWidget()`-shaped store API (flip, not set). Widget ids are unique across
 * the two local registries (profile-grid widgets vs. home-screen widgets), so try both. */
export function copyWidgetToMine(id: string): boolean {
  if (localProfileWidgetRegistry.get(id)) {
    if (!get(profileConfig).slots.find((s) => s.id === id)?.enabled) profileConfig.toggleWidget(id);
    return true;
  }
  if (localWidgetRegistry.get(id)) {
    if (!get(homeConfig).slots.find((s) => s.id === id)?.enabled) homeConfig.toggleWidget(id);
    return true;
  }
  // Not in either fixed local registry — most likely a widget from a plugin the copier
  // doesn't have installed. Plugin distribution is a different problem, out of scope here
  // (see docs/architecture/profile-progress-redesign.md §4).
  return false;
}

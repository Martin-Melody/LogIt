// Meal plan and recipe packs from the plugin directory (canvas Q1, MP1 "Community"). Packs are
// data, so there's nothing to install: a coach copies what they want into their own.
import { pluginsApi, type HostedRegistryEntry, type ServedManifest } from "@logit/core/api/pluginsApi";
import { parseMealPlanPack, parseRecipePack } from "@logit/core/plugins/nutritionPacks";
import type { CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
import type { Recipe } from "@logit/core/domain/nutrition";

export async function communityPacks(family: "meal-plan-pack" | "recipe-pack"): Promise<HostedRegistryEntry[]> {
  return (await pluginsApi.registry()).filter((e) => e.family === family);
}

async function packFile(entry: HostedRegistryEntry): Promise<unknown> {
  const manifest = (await (await fetch(entry.manifestUrl)).json()) as ServedManifest;
  return (await fetch(manifest.distribution.bundleUrl)).json();
}
export async function loadMealPlanPack(entry: HostedRegistryEntry): Promise<CoachNutritionPlan[]> {
  return parseMealPlanPack(await packFile(entry), entry.id).plans;
}
export async function loadRecipePack(entry: HostedRegistryEntry): Promise<Recipe[]> {
  return parseRecipePack(await packFile(entry), entry.id).recipes;
}

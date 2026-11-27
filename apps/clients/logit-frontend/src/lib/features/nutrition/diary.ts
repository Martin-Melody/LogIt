import { trainingDayOn } from "./trainingDay";
import {
  addDiaryItem,
  createDiaryDay,
  dayTotals,
  localDateIso,
  potRemaining,
  removeDiaryItem,
  type DiaryDay,
  type LoggedItem,
  type MacroTotals,
  type Recipe,
} from "@logit/core/domain/nutrition";
import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
import { get } from "svelte/store";
import { getNutritionRepo } from "$lib/data/repoProvider";
import { pushNutritionDay } from "$lib/sync/syncService";
import { profile } from "$lib/stores/profile.store";
import { getNutritionDeps } from "./deps";

// Small diary writes shared by the nutrition screens: each saves locally and queues sync.

/** Adds items to a day; returns the day and the new items' ids (for Undo). */
export async function addItems(
  dateIso: string,
  items: Omit<LoggedItem, "id">[],
): Promise<{ day: DiaryDay; ids: string[] }> {
  const repo = getNutritionRepo();
  let day = (await repo.getDay(dateIso)) ?? createDiaryDay(dateIso);
  const before = new Set(day.items.map((i) => i.id));
  for (const it of items) day = addDiaryItem(day, it);
  await repo.saveDay(day);
  pushNutritionDay(day);
  return { day, ids: day.items.filter((i) => !before.has(i.id)).map((i) => i.id) };
}

/** Remove the given item ids (an Undo after adding). */
export async function removeItems(dateIso: string, ids: string[]): Promise<DiaryDay | null> {
  const repo = getNutritionRepo();
  let day = await repo.getDay(dateIso);
  if (!day) return null;
  for (const id of ids) day = removeDiaryItem(day, id);
  await repo.saveDay(day);
  pushNutritionDay(day);
  return day;
}

export async function saveDay(day: DiaryDay): Promise<void> {
  await getNutritionRepo().saveDay(day);
  pushNutritionDay(day);
}

/** What's eaten so far on a day and the target, for "your day after this". */
export async function dayContext(
  dateIso: string,
): Promise<{ eaten: MacroTotals; target: MacroTotals | null; day: DiaryDay | null }> {
  const repo = getNutritionRepo();
  const p = get(profile);
  const fallbackKg = p.weight != null && p.weightUnit === "kg" ? p.weight : null;
  const [day, nut] = await Promise.all([
    repo.getDay(dateIso),
    trainingDayOn(dateIso).then((trainingDay) => getNutritionTargets(getNutritionDeps(), { fallbackWeightKg: fallbackKg, dateIso, trainingDay })).catch(() => null),
  ]);
  return {
    day,
    eaten: day ? dayTotals(day) : { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    target: nut?.targets?.macros ?? null,
  };
}

/** What's left in a recipe's current pot, reading the diary since it was cooked. */
export async function potLeft(recipe: Recipe) {
  if (!recipe.cookedOn || !recipe.cookedWeightG) return null;
  const days = await getNutritionRepo().listDaysInRange(recipe.cookedOn, localDateIso());
  return potRemaining(recipe, days);
}

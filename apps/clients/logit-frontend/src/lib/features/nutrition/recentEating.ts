import { get } from "svelte/store";
import { dayTotals, localDateIso } from "@logit/core/domain/nutrition";
import { getNutritionTargets } from "@logit/core/usecases/nutrition/getNutritionTargets";
import type { ProgressionInput } from "@logit/core/domain/progression";
import { getNutritionRepo } from "$lib/data/repoProvider";
import { profile } from "$lib/stores/profile.store";
import { getNutritionDeps } from "./deps";

/**
 * Eating over the last 7 full days (today left out, it isn't finished), for progression:
 * average calories on the days with food logged, and the maintenance estimate the
 * nutrition goal shows. Null with no maintenance estimate or nothing logged.
 */
export async function loadRecentEating(): Promise<ProgressionInput["food"] | null> {
  const today = new Date(`${localDateIso()}T12:00:00`);
  const from = new Date(today);
  from.setDate(today.getDate() - 7);
  const to = new Date(today);
  to.setDate(today.getDate() - 1);
  const iso = (d: Date) => localDateIso(d);

  const p = get(profile);
  const fallbackKg = p.weight != null && p.weightUnit === "kg" ? p.weight : null;
  const [days, nut] = await Promise.all([
    getNutritionRepo().listDaysInRange(iso(from), iso(to)),
    getNutritionTargets(getNutritionDeps(), { fallbackWeightKg: fallbackKg }).catch(() => null),
  ]);
  const maintenanceKcal = nut?.targets?.maintenanceKcal ?? null;
  const logged = days.filter((d) => !d.deletedAtMs && d.items.length > 0);
  if (!maintenanceKcal || logged.length === 0) return null;
  const avgKcal = logged.reduce((sum, d) => sum + dayTotals(d).kcal, 0) / logged.length;
  return { avgKcal: Math.round(avgKcal), maintenanceKcal: Math.round(maintenanceKcal), daysLogged: logged.length };
}

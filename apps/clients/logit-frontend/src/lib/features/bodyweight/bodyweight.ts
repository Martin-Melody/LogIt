import { get } from "svelte/store";
import { profile } from "$lib/stores/profile.store";
import { getExerciseRepo, getNutritionRepo } from "$lib/data/repoProvider";
import { pushWeightEntry } from "$lib/sync/syncService";
import { createWeightEntry, localDateIso } from "@logit/core/domain/nutrition";
import { getLoadMode, makeBodyweightLookup, type BodyweightLookup } from "@logit/core/domain/bodyweight";
import type { ExerciseType } from "@logit/core/domain/exercise";
import { getSessionVolumeKg, type WorkoutSession } from "@logit/core/domain/workout";
import { displayToKg, kgToDisplay, type WeightUnit } from "$lib/features/nutrition/nutrition";

/**
 * The lifter's bodyweight for bodyweight-exercise volume (pull-ups at BW, dips at
 * BW−25 …). Comes from the weight log, so an old session uses what you weighed
 * then; the profile weight stands in when nothing has been logged.
 */

/** Profile weight in kg, or null. It's stored in the profile's display unit. */
export function profileBodyweightKg(): number | null {
  const p = get(profile);
  if (p.weight == null || !(p.weight > 0)) return null;
  return displayToKg(p.weight, (p.weightUnit ?? "kg") as WeightUnit);
}

// The Progress page asks once per exercise; one read of the log serves them all.
let cached: { at: number; promise: Promise<BodyweightLookup> } | null = null;
const CACHE_MS = 10_000;

export function loadBodyweightLookup(): Promise<BodyweightLookup> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.promise;
  const promise = getNutritionRepo()
    .listWeightEntries()
    .catch(() => [])
    .then((entries) => makeBodyweightLookup(entries, profileBodyweightKg()));
  cached = { at: now, promise };
  return promise;
}

export async function hasBodyweight(): Promise<boolean> {
  return (await loadBodyweightLookup())(Date.now()) != null;
}

/** Log today's weigh-in (the weight log and the profile both get it). */
export async function saveBodyweight(value: number, unit: WeightUnit): Promise<void> {
  const kg = displayToKg(value, unit);
  const repo = getNutritionRepo();
  const today = localDateIso();
  const existing = (await repo.listWeightEntries()).find((e) => e.dateIso === today && !e.deletedAtMs);
  const entry = existing ? { ...existing, weightKg: kg, updatedAtMs: Date.now() } : createWeightEntry(today, kg);
  await repo.saveWeightEntry(entry);
  pushWeightEntry(entry);
  const profileUnit = (get(profile).weightUnit ?? "kg") as WeightUnit;
  profile.save({ weight: Math.round(kgToDisplay(kg, profileUnit) * 10) / 10 });
  cached = null;
}

/** What a session's volume needs beyond its sets: bodyweight by date and exercise types. */
export type VolumeContext = {
  bodyweightAt: BodyweightLookup;
  typeById: Map<string, ExerciseType | undefined>;
};

export async function loadVolumeContext(): Promise<VolumeContext> {
  const [bodyweightAt, exercises] = await Promise.all([
    loadBodyweightLookup(),
    getExerciseRepo().list({ limit: 10_000 }).catch(() => []),
  ]);
  return { bodyweightAt, typeById: new Map(exercises.map((e) => [e.id, e.exerciseType])) };
}

/** Session volume (kg) with bodyweight work counted at bodyweight ± the logged number. */
export function sessionVolumeKg(session: WorkoutSession, ctx: VolumeContext | null): number {
  if (!ctx) return getSessionVolumeKg(session);
  return getSessionVolumeKg(session, {
    bodyweightKg: ctx.bodyweightAt(session.endedAtMs ?? session.startedAtMs),
    exerciseTypeOf: (ex) => (ex.exerciseId ? ctx.typeById.get(ex.exerciseId) : undefined),
  });
}

const DISMISSED_KEY = "logit:bodyweightPrompt:dismissedAt";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Ask for bodyweight when adding this exercise? Only for bodyweight / assisted
 * work, only while no bodyweight is known, and not again for a week after
 * "Not now".
 */
export async function shouldAskForBodyweight(name: string, exerciseType: ExerciseType | undefined): Promise<boolean> {
  if (getLoadMode(exerciseType, [], name) === "external") return false;
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    if (at && Date.now() - at < DISMISS_FOR_MS) return false;
  } catch {}
  return !(await hasBodyweight());
}

export function dismissBodyweightPrompt(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {}
}

import { browser } from "$app/environment";
import type { Exercise, ExercisePatch, ExerciseType } from "$lib/domain/exercise";
import type { ExerciseRepo, ListExercisesOptions } from "./exerciseRepo";
import { createId } from "$lib/domain/ids";

// Core exercises are always authoritative — never stored in localStorage.
const CORE_EXERCISES: Exercise[] = [
  { id: "ex_core_bench",        name: "Bench Press",            notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["chest"],               secondaryMuscles: ["triceps", "shoulders"] },
  { id: "ex_core_incline_bench",name: "Incline Bench Press",    notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["chest", "shoulders"],   secondaryMuscles: ["triceps"] },
  { id: "ex_core_squat",        name: "Squat",                  notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["quads", "glutes"],       secondaryMuscles: ["hamstrings", "core"] },
  { id: "ex_core_front_squat",  name: "Front Squat",            notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["quads"],                 secondaryMuscles: ["glutes", "core"] },
  { id: "ex_core_deadlift",     name: "Deadlift",               notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back", "glutes"],        secondaryMuscles: ["hamstrings", "quads", "core", "forearms"] },
  { id: "ex_core_rdl",          name: "Romanian Deadlift",      notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["hamstrings", "glutes"],  secondaryMuscles: ["back", "core"] },
  { id: "ex_core_ohp",          name: "Overhead Press",         notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["shoulders"],             secondaryMuscles: ["triceps", "core"] },
  { id: "ex_core_pullup",       name: "Pull-Up",                notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back", "biceps"],        secondaryMuscles: ["shoulders", "core"] },
  { id: "ex_core_lat_pulldown", name: "Lat Pulldown",           notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back"],                  secondaryMuscles: ["biceps", "shoulders"] },
  { id: "ex_core_bb_row",       name: "Barbell Row",            notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back"],                  secondaryMuscles: ["biceps", "shoulders", "core"] },
  { id: "ex_core_db_row",       name: "Dumbbell Row",           notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back"],                  secondaryMuscles: ["biceps"] },
  { id: "ex_core_hip_thrust",   name: "Hip Thrust",             notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["glutes"],                secondaryMuscles: ["hamstrings"] },
  { id: "ex_core_lunge",        name: "Lunge",                  notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["quads", "glutes"],       secondaryMuscles: ["hamstrings"] },
  { id: "ex_core_chest_fly",    name: "Chest Fly",              notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["chest"],                 secondaryMuscles: ["shoulders"] },
  { id: "ex_core_lat_raise",    name: "Lateral Raise",          notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["shoulders"],             secondaryMuscles: [] },
  { id: "ex_core_rear_delt",    name: "Rear Delt Fly",          notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["shoulders", "back"],     secondaryMuscles: [] },
  { id: "ex_core_bicep_curl",   name: "Bicep Curl",             notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["biceps"],                secondaryMuscles: ["forearms"] },
  { id: "ex_core_hammer_curl",  name: "Hammer Curl",            notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["biceps", "forearms"],    secondaryMuscles: [] },
  { id: "ex_core_tricep_push",  name: "Tricep Pushdown",        notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["triceps"],               secondaryMuscles: [] },
  { id: "ex_core_skullcrusher", name: "Skullcrusher",           notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["triceps"],               secondaryMuscles: [] },
  { id: "ex_core_leg_press",    name: "Leg Press",              notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["quads", "glutes"],       secondaryMuscles: ["hamstrings"] },
  { id: "ex_core_leg_curl",     name: "Leg Curl",               notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["hamstrings"],            secondaryMuscles: [] },
  { id: "ex_core_leg_ext",      name: "Leg Extension",          notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["quads"],                 secondaryMuscles: [] },
  { id: "ex_core_calf_raise",   name: "Calf Raise",             notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["calves"],                secondaryMuscles: [] },
  { id: "ex_core_plank",        name: "Plank",                  notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["core"],                  secondaryMuscles: [] },
  { id: "ex_core_hlr",          name: "Hanging Leg Raise",      notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["core"],                  secondaryMuscles: [] },
  { id: "ex_core_pec_deck",     name: "Pec Deck",               notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["chest"],                 secondaryMuscles: ["shoulders"] },
  { id: "ex_core_tbar_row",     name: "T-Bar Row",              notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back"],                  secondaryMuscles: ["biceps", "shoulders"] },
  { id: "ex_core_hip_abduct",   name: "Hip Abduction",          notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["glutes"],                secondaryMuscles: [] },
  { id: "ex_core_hip_adduct",   name: "Hip Adduction",          notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["glutes"],                secondaryMuscles: [] },
  { id: "ex_core_back_ext",     name: "Machine Back Extension", notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["back", "glutes"],        secondaryMuscles: ["hamstrings"] },
  { id: "ex_core_dips",         name: "Dips",                   notes: null, isCore: true, createdAtMs: 0, primaryMuscles: ["chest", "triceps"],      secondaryMuscles: ["shoulders"] },
];

const STORAGE_KEY = "logit:exercises:custom";

function ensureBrowser() {
  if (!browser) throw new Error("Exercise repo cannot be used during SSR.");
}

function readCustom(): Exercise[] {
  ensureBrowser();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Exercise[];
    // Backfill muscle groups for custom exercises that predate this field
    return parsed.map((e) => ({
      ...e,
      primaryMuscles: e.primaryMuscles ?? [],
      secondaryMuscles: e.secondaryMuscles ?? [],
      exerciseType: e.exerciseType ?? "normal",
      machines: e.machines ?? [],
    }));
  } catch {
    return [];
  }
}

function writeCustom(items: Exercise[]) {
  ensureBrowser();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function all(): Exercise[] {
  return [...CORE_EXERCISES, ...readCustom()];
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export function createLocalExerciseRepo(): ExerciseRepo {
  return {
    async list(options?: ListExercisesOptions) {
      const { query, filter, limit, offset } = options ?? {};

      let result: Exercise[];
      if (filter === "core") {
        result = [...CORE_EXERCISES];
      } else if (filter === "mine") {
        result = readCustom();
      } else {
        result = all();
      }

      if (query?.trim()) {
        const q = normalize(query);
        result = result.filter((e) => normalize(e.name).includes(q));
      }

      result = [...result].sort((a, b) => a.name.localeCompare(b.name));

      if (typeof offset === "number") result = result.slice(offset);
      if (typeof limit === "number") result = result.slice(0, limit);

      return result;
    },

    async getByName(name: string) {
      const n = normalize(name);
      return all().find((e) => normalize(e.name) === n) ?? null;
    },

    async getById(id: string) {
      return all().find((e) => e.id === id) ?? null;
    },

    async create(name: string, exerciseType: ExerciseType = "normal") {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Exercise name cannot be empty.");

      const existing = await this.getByName(trimmed);
      if (existing) return existing;

      const custom = readCustom();
      const ex: Exercise = {
        id: createId("ex"),
        name: trimmed,
        notes: null,
        isCore: false,
        createdAtMs: Date.now(),
        primaryMuscles: [],
        secondaryMuscles: [],
        exerciseType,
      };
      writeCustom([ex, ...custom]);
      return ex;
    },

    async update(id: string, patch: ExercisePatch) {
      // Core exercises: notes and exerciseType can be overridden via an overlay
      const coreIdx = CORE_EXERCISES.findIndex((e) => e.id === id);
      if (coreIdx !== -1) {
        const custom = readCustom();
        const overlayIdx = custom.findIndex((e) => e.id === id);
        const hasOverridableField =
          patch.notes !== undefined || patch.exerciseType !== undefined ||
          patch.machines !== undefined || patch.defaultMachineId !== undefined;
        if (hasOverridableField) {
          const base = { ...CORE_EXERCISES[coreIdx]! };
          if (overlayIdx !== -1) {
            const merged = { ...custom[overlayIdx]!, ...patch };
            custom[overlayIdx] = merged;
            writeCustom(custom);
            return merged;
          } else {
            const overlay: Exercise = { ...base, ...patch };
            writeCustom([overlay, ...custom]);
            return overlay;
          }
        }
        return CORE_EXERCISES[coreIdx]!;
      }

      const custom = readCustom();
      const idx = custom.findIndex((e) => e.id === id);
      if (idx === -1) throw new Error(`Exercise ${id} not found.`);
      const updated = { ...custom[idx]!, ...patch };
      custom[idx] = updated;
      writeCustom(custom);
      return updated;
    },

    async remove(id: string) {
      // Cannot remove core exercises
      if (CORE_EXERCISES.some((e) => e.id === id)) return;
      writeCustom(readCustom().filter((e) => e.id !== id));
    },

    async saveExercise(exercise: Exercise): Promise<void> {
      // Core exercises are always present — only restore custom ones
      if (exercise.isCore) return;
      const custom = readCustom();
      const exists = custom.some((e) => e.id === exercise.id);
      writeCustom(exists ? custom.map((e) => (e.id === exercise.id ? exercise : e)) : [exercise, ...custom]);
    },

    async clearAll(): Promise<void> {
      writeCustom([]);
    },
  };
}

import { browser } from "$app/environment";
import type { Exercise, ExercisePatch, ExerciseType } from "@logit/core/domain/exercise";
import type { ExerciseRepo, ListExercisesOptions } from "@logit/core/data/exercise/exerciseRepo";
import { createId } from "@logit/core/domain/ids";
import { CORE_EXERCISES, canonicalExerciseId } from "@logit/core/domain/coreExercises";

// Core exercises are always authoritative — never stored in localStorage.

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
      const cid = canonicalExerciseId(id);
      return all().find((e) => e.id === cid) ?? null;
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

    async update(rawId: string, rawPatch: ExercisePatch) {
      const id = canonicalExerciseId(rawId);
      const patch: ExercisePatch & { updatedAtMs: number } = { ...rawPatch, updatedAtMs: Date.now() };
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

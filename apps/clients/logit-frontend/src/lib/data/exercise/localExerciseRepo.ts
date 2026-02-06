import { browser } from "$app/environment";
import type { Exercise } from "$lib/domain/exercise";
import type { ExerciseRepo, ListExercisesOptions } from "./exerciseRepo";

const STORAGE_KEY = "logit:exercises:v1";

function ensureBrowser() {
  if (!browser) throw new Error("Exercise repo cannot be used during SSR.");
}

function readAll(): Exercise[] {
  ensureBrowser();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    return JSON.parse(raw) as Exercise[];
  } catch {
    return seed();
  }
}

function writeAll(items: Exercise[]) {
  ensureBrowser();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function seed(): Exercise[] {
  return [
    { id: "bench", name: "Bench Press", createdAtMs: Date.now() },
    { id: "squat", name: "Squat", createdAtMs: Date.now() },
    { id: "deadlift", name: "Deadlift", createdAtMs: Date.now() },
    { id: "row", name: "Barbell Row", createdAtMs: Date.now() },
  ];
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export function createLocalExerciseRepo(): ExerciseRepo {
  return {
    async list(options?: ListExercisesOptions) {
      const { query, limit, offset } = options ?? {};
      const all = readAll();

      let result = all;

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
      const all = readAll();
      const n = normalize(name);
      return all.find((e) => normalize(e.name) === n) ?? null;
    },

    async create(name: string) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Exercise name cannot be empty.");

      const existing = await this.getByName(trimmed);
      if (existing) return existing;

      const all = readAll();
      const ex: Exercise = {
        id: crypto.randomUUID(),
        name: trimmed,
        createdAtMs: Date.now(),
      };
      const next = [ex, ...all];
      writeAll(next);
      return ex;
    },
  };
}

import type { Exercise } from "@logit/core/domain/exercise";
import type {
  ExerciseRepo,
  ListExercisesOptions,
} from "@logit/core/data/exercise/exerciseRepo";
import { listInstalledPluginManifests } from "./catalog";
import { packExercises } from "./packStore";

/**
 * Wraps an ExerciseRepo so exercises from installed, enabled exercise packs
 * appear in reads alongside core and user exercises. Packs are read-only: writes
 * pass straight through to the underlying repo, and a base exercise always wins
 * over a pack exercise with the same name.
 *
 * Pack exercises are not "mine" (user-authored) and not "core", so they only
 * surface in the unfiltered ("all") listing.
 */
export function withExercisePacks(base: ExerciseRepo): ExerciseRepo {
  async function enabledPackExercises(): Promise<Exercise[]> {
    const installed = await listInstalledPluginManifests();
    const ids = new Set(
      installed
        .filter((p) => p.enabled && p.manifest.family === "exercise-pack")
        .map((p) => p.manifest.id),
    );
    return ids.size === 0 ? [] : packExercises(ids);
  }

  function matchesQuery(e: Exercise, query?: string): boolean {
    const q = query?.trim().toLowerCase();
    return !q || e.name.toLowerCase().includes(q);
  }

  return {
    ...base,

    async list(options?: ListExercisesOptions): Promise<Exercise[]> {
      // Filtered views (core / mine) never include packs — defer entirely.
      if (options?.filter === "core" || options?.filter === "mine") {
        return base.list(options);
      }

      // Pull the base list without paging so the merge + sort is correct, then
      // page the merged result ourselves.
      const { limit, offset, ...rest } = options ?? {};
      const baseList = await base.list(rest);

      const seen = new Set(baseList.map((e) => e.name.toLowerCase()));
      const extra = (await enabledPackExercises()).filter(
        (e) => matchesQuery(e, options?.query) && !seen.has(e.name.toLowerCase()),
      );
      if (extra.length === 0) {
        return applyPaging(baseList, offset, limit);
      }

      const merged = [...baseList, ...extra].sort((a, b) => a.name.localeCompare(b.name));
      return applyPaging(merged, offset, limit);
    },

    async getById(id: string): Promise<Exercise | null> {
      const found = await base.getById(id);
      if (found) return found;
      if (!id.startsWith("pack:")) return null;
      return (await enabledPackExercises()).find((e) => e.id === id) ?? null;
    },

    async getByName(name: string): Promise<Exercise | null> {
      const found = await base.getByName(name);
      if (found) return found;
      const n = name.trim().toLowerCase();
      return (await enabledPackExercises()).find((e) => e.name.toLowerCase() === n) ?? null;
    },
  };
}

function applyPaging(items: Exercise[], offset?: number, limit?: number): Exercise[] {
  let result = items;
  if (typeof offset === "number") result = result.slice(offset);
  if (typeof limit === "number") result = result.slice(0, limit);
  return result;
}

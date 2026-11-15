import type { Exercise } from "@logit/core/domain/exercise";
import type { ExerciseRepo } from "@logit/core/data/exercise/exerciseRepo";
import type { LibraryRepo } from "@logit/core/data/libraryRepo";

/**
 * Lets a coach's shared strength exercises resolve by id or name, so a program block that
 * names the coach's own exercise gets its muscles and cues instead of a blank exercise.
 * Your own and LogIt's exercises always win, by id and by name. The unfiltered list
 * includes them too, so exercise pickers offer them; "mine" and "core" lists don't.
 *
 * Changing a coach's exercise (say, its machines) first saves it as yours under the same
 * id, so the workouts already logged against it stay linked.
 */
export function withCoachExercises(base: ExerciseRepo, library: () => LibraryRepo): ExerciseRepo {
  async function coachStrength(): Promise<Exercise[]> {
    const items = await library().listFromCoaches().catch(() => []);
    return items.filter((i) => i.kind === "strength").map((i) => ({ ...(i.item as Exercise), isCore: false }));
  }

  return {
    ...base,

    async list(options) {
      if (options?.filter === "core" || options?.filter === "mine") return base.list(options);
      const { limit, offset, ...rest } = options ?? {};
      const own = await base.list({ ...rest, limit: 5000 });
      const taken = new Set(own.map((e) => e.name.toLowerCase()));
      const q = options?.query?.trim().toLowerCase();
      const extra = (await coachStrength()).filter(
        (e) => !taken.has(e.name.toLowerCase()) && (!q || e.name.toLowerCase().includes(q)),
      );
      let merged = extra.length ? [...own, ...extra].sort((a, b) => a.name.localeCompare(b.name)) : own;
      if (typeof offset === "number") merged = merged.slice(offset);
      if (typeof limit === "number") merged = merged.slice(0, limit);
      return merged;
    },

    async getById(id) {
      const found = await base.getById(id);
      if (found) return found;
      return (await coachStrength()).find((e) => e.id === id) ?? null;
    },

    async getByName(name) {
      const found = await base.getByName(name);
      if (found) return found;
      const n = name.trim().toLowerCase();
      return (await coachStrength()).find((e) => e.name.toLowerCase() === n) ?? null;
    },

    async update(id, patch) {
      if (!(await base.getById(id))) {
        const fromCoach = (await coachStrength()).find((e) => e.id === id);
        if (fromCoach) await base.saveExercise(fromCoach);
      }
      return base.update(id, patch);
    },
  };
}

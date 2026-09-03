import { browser } from "$app/environment";
import type { AssignedHabitRepo } from "@logit/core/data/coachHabitRepo";
import type { CoachHabit } from "@logit/core/domain/CoachHabit";

const KEY = "logit:coachHabits:v1"; // Record<id, CoachHabit>

function readAll(): Record<string, CoachHabit> {
  if (!browser) return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, CoachHabit>;
  } catch {
    return {};
  }
}
function writeAll(map: Record<string, CoachHabit>): void {
  if (browser) localStorage.setItem(KEY, JSON.stringify(map));
}

/** Web (localStorage) mirror — same read-only contract as the SQLite variant. */
export function createLocalAssignedHabitRepo(): AssignedHabitRepo {
  return {
    async listAssignedHabits(): Promise<CoachHabit[]> {
      return Object.values(readAll())
        .filter((h) => !h.archived)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
    },
    async getAssignedHabit(id): Promise<CoachHabit | null> {
      return readAll()[id] ?? null;
    },
    async upsertFromRemote(habit: CoachHabit): Promise<void> {
      const map = readAll();
      map[habit.id] = habit;
      writeAll(map);
    },
    async removeFromRemote(id: string): Promise<void> {
      const map = readAll();
      delete map[id];
      writeAll(map);
    },
  };
}

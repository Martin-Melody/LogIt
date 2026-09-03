import type { AssignedHabitRepo } from "@logit/core/data/coachHabitRepo";
import type { CoachHabit } from "@logit/core/domain/CoachHabit";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";
import { nowMs } from "@logit/core/domain/time";

function parse(json: string): CoachHabit | null {
  try {
    return JSON.parse(json) as CoachHabit;
  } catch {
    return null;
  }
}

/** Native mirror of coach-assigned habits — read-only for the user; the sync loop's
 * merge helpers are the only writers. */
export function createSqliteAssignedHabitRepo(): AssignedHabitRepo {
  return {
    async listAssignedHabits(): Promise<CoachHabit[]> {
      const res = await getDb().query(
        `SELECT data_json FROM coach_habits
         WHERE owner_id = ? OR owner_id IS NULL
         ORDER BY updated_at_ms DESC`,
        [getActiveOwnerId()],
      );
      return ((res.values ?? []) as { data_json: string }[])
        .map((r) => parse(r.data_json))
        .filter((h): h is CoachHabit => h !== null && !h.archived)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
    },

    async getAssignedHabit(id): Promise<CoachHabit | null> {
      const res = await getDb().query(`SELECT data_json FROM coach_habits WHERE id = ?`, [id]);
      const row = res.values?.[0] as { data_json: string } | undefined;
      return row ? parse(row.data_json) : null;
    },

    async upsertFromRemote(habit: CoachHabit): Promise<void> {
      await getDb().run(
        `INSERT INTO coach_habits(id, owner_id, data_json, updated_at_ms, synced_at_ms)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data_json = excluded.data_json,
           updated_at_ms = excluded.updated_at_ms,
           synced_at_ms = excluded.synced_at_ms`,
        [habit.id, getActiveOwnerId(), JSON.stringify(habit), habit.updatedAtMs, nowMs()],
      );
    },

    async removeFromRemote(id: string): Promise<void> {
      await getDb().run(`DELETE FROM coach_habits WHERE id = ?`, [id]);
    },
  };
}

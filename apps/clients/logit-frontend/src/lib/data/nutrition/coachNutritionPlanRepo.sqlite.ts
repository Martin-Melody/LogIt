import type { AssignedNutritionPlanRepo } from "@logit/core/data/coachNutritionPlanRepo";
import type { CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
import { getDb } from "$lib/data/db/sqlite";
import { getActiveOwnerId } from "$lib/data/activeOwner";
import { nowMs } from "@logit/core/domain/time";

function parse(json: string): CoachNutritionPlan | null {
  try {
    return JSON.parse(json) as CoachNutritionPlan;
  } catch {
    return null;
  }
}

/** Native mirror of coach-assigned nutrition plans — read-only for the user; the sync
 * loop's merge helpers are the only writers. */
export function createSqliteCoachNutritionPlanRepo(): AssignedNutritionPlanRepo {
  return {
    async listAssignedPlans(): Promise<CoachNutritionPlan[]> {
      const res = await getDb().query(
        `SELECT data_json FROM coach_nutrition_plans
         WHERE owner_id = ? OR owner_id IS NULL
         ORDER BY updated_at_ms DESC`,
        [getActiveOwnerId()],
      );
      return ((res.values ?? []) as { data_json: string }[])
        .map((r) => parse(r.data_json))
        .filter((p): p is CoachNutritionPlan => p !== null && !p.archived);
    },

    async getAssignedPlan(): Promise<CoachNutritionPlan | null> {
      return (await this.listAssignedPlans())[0] ?? null;
    },

    async upsertFromRemote(plan: CoachNutritionPlan): Promise<void> {
      await getDb().run(
        `INSERT INTO coach_nutrition_plans(id, owner_id, data_json, updated_at_ms, synced_at_ms)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data_json = excluded.data_json,
           updated_at_ms = excluded.updated_at_ms,
           synced_at_ms = excluded.synced_at_ms`,
        [plan.id, getActiveOwnerId(), JSON.stringify(plan), plan.updatedAtMs, nowMs()],
      );
    },

    async removeFromRemote(id: string): Promise<void> {
      await getDb().run(`DELETE FROM coach_nutrition_plans WHERE id = ?`, [id]);
    },
  };
}

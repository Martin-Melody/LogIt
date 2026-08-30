import type {
  CoachNutritionPlanAuthoringRepo,
  MyCoachNutritionPlan,
} from "../coachNutritionPlanRepo";
import type { CoachNutritionPlan } from "../../domain/CoachNutritionPlan";
import {
  coachNutritionPlanApi,
  type RemoteMyCoachNutritionPlan,
} from "../../api/coachNutritionPlanApi";

function parse(entry: RemoteMyCoachNutritionPlan): MyCoachNutritionPlan | null {
  if (entry.deletedAtMs || !entry.dataJson) return null;
  try {
    return {
      plan: JSON.parse(entry.dataJson) as CoachNutritionPlan,
      recipientUserId: entry.recipientUserId,
    };
  } catch {
    return null;
  }
}

/** Coach-side authoring backed directly by the API — used by the Studio web dashboard,
 * where the coach is online while setting a client's targets. */
export function createRemoteCoachNutritionPlanRepo(): CoachNutritionPlanAuthoringRepo {
  return {
    async listMine(opts): Promise<MyCoachNutritionPlan[]> {
      const rows = await coachNutritionPlanApi.listMine(opts);
      return rows.map(parse).filter((p): p is MyCoachNutritionPlan => p !== null);
    },

    async getForRecipient(recipientId): Promise<MyCoachNutritionPlan | null> {
      const rows = await coachNutritionPlanApi.listMine({ recipientId });
      const row = rows.map(parse).find((p): p is MyCoachNutritionPlan => p !== null);
      return row ?? null;
    },

    async savePlan(plan: CoachNutritionPlan, recipientUsername?: string): Promise<void> {
      await coachNutritionPlanApi.upsert({
        planId: plan.id,
        dataJson: JSON.stringify(plan),
        updatedAtMs: plan.updatedAtMs,
        recipientUsername,
      });
    },

    async deletePlan(planId: string): Promise<void> {
      await coachNutritionPlanApi.upsert({
        planId,
        dataJson: "",
        updatedAtMs: Date.now(),
        deletedAtMs: Date.now(),
      });
    },
  };
}

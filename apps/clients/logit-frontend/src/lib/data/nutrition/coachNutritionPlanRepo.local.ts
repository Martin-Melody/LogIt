import { browser } from "$app/environment";
import type { AssignedNutritionPlanRepo } from "@logit/core/data/coachNutritionPlanRepo";
import { planOn, type CoachNutritionPlan } from "@logit/core/domain/CoachNutritionPlan";
import { localDateIso } from "@logit/core/domain/nutrition";

const KEY = "logit:coachNutritionPlans:v1"; // Record<id, CoachNutritionPlan>

function readAll(): Record<string, CoachNutritionPlan> {
  if (!browser) return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, CoachNutritionPlan>;
  } catch {
    return {};
  }
}
function writeAll(map: Record<string, CoachNutritionPlan>): void {
  if (browser) localStorage.setItem(KEY, JSON.stringify(map));
}

/** Web (localStorage) mirror — same read-only contract as the SQLite variant. */
export function createLocalCoachNutritionPlanRepo(): AssignedNutritionPlanRepo {
  return {
    async listAssignedPlans(): Promise<CoachNutritionPlan[]> {
      return Object.values(readAll())
        .filter((p) => !p.archived)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    },
    async getAssignedPlan(): Promise<CoachNutritionPlan | null> {
      return planOn(Object.values(readAll()), localDateIso());
    },
    async listPlanHistory(): Promise<CoachNutritionPlan[]> {
      return Object.values(readAll());
    },
    async upsertFromRemote(plan: CoachNutritionPlan): Promise<void> {
      const map = readAll();
      map[plan.id] = plan;
      writeAll(map);
    },
    async removeFromRemote(id: string): Promise<void> {
      const map = readAll();
      delete map[id];
      writeAll(map);
    },
  };
}

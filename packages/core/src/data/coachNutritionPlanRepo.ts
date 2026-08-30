import type { CoachNutritionPlan } from "../domain/CoachNutritionPlan";

/**
 * Client-side read-only view of the nutrition plan(s) a coach has assigned. Kept up to date
 * by the sync loop (pullAndMergeCoachNutritionPlan). The client never edits these.
 * Normally there's at most one active plan; `getAssignedPlan()` returns it.
 */
export interface AssignedNutritionPlanRepo {
  getAssignedPlan(): Promise<CoachNutritionPlan | null>;
  listAssignedPlans(): Promise<CoachNutritionPlan[]>;

  // ── Sync-merge surface (sync loop only) ──
  upsertFromRemote(plan: CoachNutritionPlan): Promise<void>;
  removeFromRemote(id: string): Promise<void>;
}

export type MyCoachNutritionPlan = {
  plan: CoachNutritionPlan;
  /** Server user id of the assigned client, or null for a template. */
  recipientUserId: string | null;
};

/** Coach-side authoring — implemented remotely for the Studio web dashboard. */
export interface CoachNutritionPlanAuthoringRepo {
  listMine(opts?: { recipientId?: string; templates?: boolean }): Promise<MyCoachNutritionPlan[]>;
  getForRecipient(recipientId: string): Promise<MyCoachNutritionPlan | null>;
  /** Persist a plan. `recipientUsername` assigns/reassigns it. */
  savePlan(plan: CoachNutritionPlan, recipientUsername?: string): Promise<void>;
  deletePlan(planId: string): Promise<void>;
}

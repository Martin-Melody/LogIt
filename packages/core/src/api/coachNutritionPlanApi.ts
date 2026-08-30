import { apiClient } from "./client";

/** Wire shape of a coach nutrition-plan row — `dataJson` is a serialised CoachNutritionPlan
 * (domain/CoachNutritionPlan.ts), null on a tombstone. */
export interface RemoteCoachNutritionPlan {
  planId: string;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
}

export interface RemoteMyCoachNutritionPlan extends RemoteCoachNutritionPlan {
  recipientUserId: string | null;
}

export interface UpsertCoachNutritionPlanInput {
  planId: string;
  dataJson: string;
  updatedAtMs: number;
  /** Username of the client to assign to. Requires an Active coaching relationship. Omit
   * to leave an existing assignment untouched or to save an unassigned template. */
  recipientUsername?: string;
  deletedAtMs?: number;
}

export const coachNutritionPlanApi = {
  /** Coach: create/update a plan. Studio-tier only (server-enforced). */
  async upsert(
    input: UpsertCoachNutritionPlanInput,
  ): Promise<{ id: string; planId: string; updatedAtMs: number }> {
    return apiClient.fetch("/coach/nutrition-plans", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** Coach: list own authored plans. `recipientId` filters to one client; `templates: true`
   * for the unassigned library. */
  async listMine(opts?: {
    recipientId?: string;
    templates?: boolean;
  }): Promise<RemoteMyCoachNutritionPlan[]> {
    const params = new URLSearchParams();
    if (opts?.recipientId) params.set("recipientId", opts.recipientId);
    if (opts?.templates) params.set("templates", "true");
    const qs = params.toString();
    const { plans } = await apiClient.fetch<{ plans: RemoteMyCoachNutritionPlan[] }>(
      `/coach/nutrition-plans${qs ? `?${qs}` : ""}`,
    );
    return plans;
  },

  /** Client: incremental pull of plans assigned to the caller (read-only). */
  async pullAssigned(since: number): Promise<RemoteCoachNutritionPlan[]> {
    const { plans } = await apiClient.fetch<{ plans: RemoteCoachNutritionPlan[] }>(
      `/coach/nutrition-plans/assigned?since=${since}`,
    );
    return plans;
  },
};

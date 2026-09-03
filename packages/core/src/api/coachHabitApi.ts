import { apiClient } from "./client";

/** Wire shape of a coach habit row — `dataJson` is a serialised `CoachHabit`
 * (domain/CoachHabit.ts), null on a tombstone. */
export interface RemoteCoachHabit {
  habitId: string;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
}

export interface RemoteMyCoachHabit extends RemoteCoachHabit {
  recipientUserId: string | null;
}

export interface UpsertCoachHabitInput {
  habitId: string;
  dataJson: string;
  updatedAtMs: number;
  /** Username of the client to assign to. Requires an Active coaching relationship.
   * Omit to leave an existing assignment untouched or to save an unassigned template. */
  recipientUsername?: string;
  deletedAtMs?: number;
}

export const coachHabitApi = {
  /** Coach: create/update a habit. Studio-tier only (server-enforced). */
  async upsert(
    input: UpsertCoachHabitInput,
  ): Promise<{ id: string; habitId: string; updatedAtMs: number }> {
    return apiClient.fetch("/coach/habits", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** Coach: list own authored habits. `recipientId` filters to one client;
   * `templates: true` for the unassigned library. */
  async listMine(opts?: {
    recipientId?: string;
    templates?: boolean;
  }): Promise<RemoteMyCoachHabit[]> {
    const params = new URLSearchParams();
    if (opts?.recipientId) params.set("recipientId", opts.recipientId);
    if (opts?.templates) params.set("templates", "true");
    const qs = params.toString();
    const { habits } = await apiClient.fetch<{ habits: RemoteMyCoachHabit[] }>(
      `/coach/habits${qs ? `?${qs}` : ""}`,
    );
    return habits;
  },

  /** Client: incremental pull of habits assigned to the caller (read-only). */
  async pullAssigned(since: number): Promise<RemoteCoachHabit[]> {
    const { habits } = await apiClient.fetch<{ habits: RemoteCoachHabit[] }>(
      `/coach/habits/assigned?since=${since}`,
    );
    return habits;
  },
};

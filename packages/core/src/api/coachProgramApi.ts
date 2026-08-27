import { apiClient } from "./client";

/** Wire shape of a coach program row — `dataJson` is a serialised `CoachProgram`
 * (domain/CoachProgram.ts), null on a tombstone. */
export interface RemoteCoachProgram {
  programId: string;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
}

/** Coach-side row: same, plus which client it's assigned to (null = template). */
export interface RemoteMyCoachProgram extends RemoteCoachProgram {
  recipientUserId: string | null;
}

export interface UpsertCoachProgramInput {
  programId: string;
  dataJson: string;
  updatedAtMs: number;
  /** Username of the client to assign to. Omit to leave an existing assignment untouched
   * (or to save an unassigned template). Requires an Active coaching relationship. */
  recipientUsername?: string;
  deletedAtMs?: number;
}

export const coachProgramApi = {
  /** Coach: create/update a program. Studio-tier only (server-enforced). */
  async upsert(input: UpsertCoachProgramInput): Promise<{ id: string; programId: string; updatedAtMs: number }> {
    return apiClient.fetch("/coach/programs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** Coach: list own authored programs. Pass `recipientId` to filter to one client, or
   * `templates: true` for the unassigned template library. */
  async listMine(opts?: { recipientId?: string; templates?: boolean }): Promise<RemoteMyCoachProgram[]> {
    const params = new URLSearchParams();
    if (opts?.recipientId) params.set("recipientId", opts.recipientId);
    if (opts?.templates) params.set("templates", "true");
    const qs = params.toString();
    const { programs } = await apiClient.fetch<{ programs: RemoteMyCoachProgram[] }>(
      `/coach/programs${qs ? `?${qs}` : ""}`,
    );
    return programs;
  },

  /** Client: incremental pull of programs assigned to the caller (read-only). */
  async pullAssigned(since: number): Promise<RemoteCoachProgram[]> {
    const { programs } = await apiClient.fetch<{ programs: RemoteCoachProgram[] }>(
      `/coach/programs/assigned?since=${since}`,
    );
    return programs;
  },
};

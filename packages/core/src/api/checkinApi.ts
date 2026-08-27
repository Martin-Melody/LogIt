import { apiClient } from "./client";

/** Wire shape of a coach check-in schedule row — `dataJson` is a serialised
 * `CheckinSchedule` (domain/Checkin.ts), null on a tombstone. */
export interface RemoteCheckinSchedule {
  scheduleId: string;
  updatedAtMs: number;
  dataJson: string | null;
  deletedAtMs?: number | null;
}

export interface RemoteMyCheckinSchedule extends RemoteCheckinSchedule {
  recipientUserId: string | null;
}

export interface UpsertCheckinScheduleInput {
  scheduleId: string;
  dataJson: string;
  updatedAtMs: number;
  recipientUsername?: string;
  deletedAtMs?: number;
}

export const checkinApi = {
  /** Coach: create/update a schedule. Studio-tier only (server-enforced). */
  async upsert(input: UpsertCheckinScheduleInput): Promise<{ id: string; scheduleId: string; updatedAtMs: number }> {
    return apiClient.fetch("/coach/checkins", { method: "POST", body: JSON.stringify(input) });
  },

  /** Coach: list own authored schedules. */
  async listMine(opts?: { recipientId?: string; templates?: boolean }): Promise<RemoteMyCheckinSchedule[]> {
    const params = new URLSearchParams();
    if (opts?.recipientId) params.set("recipientId", opts.recipientId);
    if (opts?.templates) params.set("templates", "true");
    const qs = params.toString();
    const { schedules } = await apiClient.fetch<{ schedules: RemoteMyCheckinSchedule[] }>(
      `/coach/checkins${qs ? `?${qs}` : ""}`,
    );
    return schedules;
  },

  /** Client: incremental pull of schedules assigned to the caller (read-only). */
  async pullAssigned(since: number): Promise<RemoteCheckinSchedule[]> {
    const { schedules } = await apiClient.fetch<{ schedules: RemoteCheckinSchedule[] }>(
      `/coach/checkins/assigned?since=${since}`,
    );
    return schedules;
  },
};

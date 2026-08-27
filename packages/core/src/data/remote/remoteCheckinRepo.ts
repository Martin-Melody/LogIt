import type {
  CheckinAuthoringRepo,
  ListMySchedulesOptions,
  MyCheckinSchedule,
} from "../checkinRepo";
import type { CheckinSchedule, CheckinSubmission } from "../../domain/Checkin";
import { checkinApi, type RemoteMyCheckinSchedule } from "../../api/checkinApi";
import { syncApi } from "../../api/syncApi";

function parse(entry: RemoteMyCheckinSchedule): MyCheckinSchedule | null {
  if (entry.deletedAtMs || !entry.dataJson) return null;
  try {
    return {
      schedule: JSON.parse(entry.dataJson) as CheckinSchedule,
      recipientUserId: entry.recipientUserId,
    };
  } catch {
    return null;
  }
}

/** Coach-side check-in authoring backed directly by the API. Used by the web dashboard. */
export function createRemoteCheckinRepo(): CheckinAuthoringRepo {
  return {
    async listMySchedules(options?: ListMySchedulesOptions): Promise<MyCheckinSchedule[]> {
      const rows = await checkinApi.listMine(options);
      return rows.map(parse).filter((s): s is MyCheckinSchedule => s !== null);
    },

    async getMySchedule(scheduleId: string): Promise<MyCheckinSchedule | null> {
      const rows = await checkinApi.listMine();
      const row = rows.find((r) => r.scheduleId === scheduleId);
      return row ? parse(row) : null;
    },

    async saveSchedule(schedule: CheckinSchedule, recipientUsername?: string): Promise<void> {
      await checkinApi.upsert({
        scheduleId: schedule.id,
        dataJson: JSON.stringify(schedule),
        updatedAtMs: schedule.updatedAtMs,
        recipientUsername,
      });
    },

    async deleteSchedule(scheduleId: string): Promise<void> {
      await checkinApi.upsert({
        scheduleId,
        dataJson: "",
        updatedAtMs: Date.now(),
        deletedAtMs: Date.now(),
      });
    },
  };
}

/** Read a client's check-in submissions (coach review on the web dashboard). Requires an
 * Active coach relationship — enforced server-side via `?clientId=`. */
export async function fetchClientCheckinSubmissions(clientId: string): Promise<CheckinSubmission[]> {
  const { submissions } = await syncApi.pullCheckinSubmissions(0, clientId);
  const out: CheckinSubmission[] = [];
  for (const entry of submissions) {
    if (entry.deletedAtMs || !entry.dataJson) continue;
    try {
      out.push(JSON.parse(entry.dataJson) as CheckinSubmission);
    } catch {}
  }
  return out;
}

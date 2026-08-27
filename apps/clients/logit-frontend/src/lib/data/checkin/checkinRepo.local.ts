import { browser } from "$app/environment";
import type { AssignedCheckinRepo } from "@logit/core/data/checkinRepo";
import type { CheckinSchedule, CheckinSubmission } from "@logit/core/domain/Checkin";

const KEYS = {
  schedules: "logit:checkinSchedules:v1", // Record<id, CheckinSchedule>
  submissions: "logit:checkinSubmissions:v1", // Record<id, { sub: CheckinSubmission; deletedAtMs: number | null }>
} as const;

type SubEntry = { sub: CheckinSubmission; deletedAtMs: number | null };

function read<T>(key: string): Record<string, T> {
  if (!browser) return {};
  try { return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, T>; } catch { return {}; }
}
function write<T>(key: string, map: Record<string, T>): void {
  if (browser) localStorage.setItem(key, JSON.stringify(map));
}

export function createLocalCheckinRepo(): AssignedCheckinRepo {
  return {
    async listAssignedSchedules(): Promise<CheckinSchedule[]> {
      return Object.values(read<CheckinSchedule>(KEYS.schedules))
        .filter((s) => !s.archived)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    },
    async getAssignedSchedule(id: string): Promise<CheckinSchedule | null> {
      return read<CheckinSchedule>(KEYS.schedules)[id] ?? null;
    },
    async listSubmissions(scheduleId?: string): Promise<CheckinSubmission[]> {
      return Object.values(read<SubEntry>(KEYS.submissions))
        .filter((e) => !e.deletedAtMs && (!scheduleId || e.sub.scheduleId === scheduleId))
        .map((e) => e.sub)
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
    },
    async getSubmission(id: string): Promise<CheckinSubmission | null> {
      const e = read<SubEntry>(KEYS.submissions)[id];
      return e && !e.deletedAtMs ? e.sub : null;
    },
    async saveSubmission(sub: CheckinSubmission): Promise<void> {
      const map = read<SubEntry>(KEYS.submissions);
      map[sub.id] = { sub, deletedAtMs: null };
      write(KEYS.submissions, map);
    },
    async upsertScheduleFromRemote(s: CheckinSchedule): Promise<void> {
      const map = read<CheckinSchedule>(KEYS.schedules);
      map[s.id] = s;
      write(KEYS.schedules, map);
    },
    async removeScheduleFromRemote(id: string): Promise<void> {
      const map = read<CheckinSchedule>(KEYS.schedules);
      delete map[id];
      write(KEYS.schedules, map);
    },
    async upsertSubmissionFromRemote(sub: CheckinSubmission): Promise<void> {
      await this.saveSubmission(sub);
    },
    async removeSubmissionFromRemote(id: string): Promise<void> {
      const map = read<SubEntry>(KEYS.submissions);
      if (map[id]) { map[id].deletedAtMs = Date.now(); write(KEYS.submissions, map); }
    },
    async listSubmissionsForPush(): Promise<CheckinSubmission[]> {
      return Object.values(read<SubEntry>(KEYS.submissions))
        .filter((e) => !e.deletedAtMs)
        .map((e) => e.sub);
    },
  };
}

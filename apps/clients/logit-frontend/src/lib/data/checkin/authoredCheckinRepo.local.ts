import { browser } from "$app/environment";
import type { ListMySchedulesOptions, MyCheckinSchedule } from "@logit/core/data/checkinRepo";
import type { CheckinSchedule } from "@logit/core/domain/Checkin";
import type { AuthoredCheckinRepo } from "./authoredCheckinRepo.sqlite";

const KEY = "logit:authoredCheckinSchedules:v1";

type Entry = { schedule: CheckinSchedule; recipientUsername: string | null; deletedAtMs: number | null };

function readAll(): Record<string, Entry> {
  if (!browser) return {};
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Entry>; } catch { return {}; }
}
function writeAll(map: Record<string, Entry>): void {
  if (browser) localStorage.setItem(KEY, JSON.stringify(map));
}

export function createLocalAuthoredCheckinRepo(): AuthoredCheckinRepo {
  return {
    async listMySchedules(options?: ListMySchedulesOptions): Promise<MyCheckinSchedule[]> {
      return Object.values(readAll())
        .filter((e) => !e.deletedAtMs && (!options?.templates || e.recipientUsername === null))
        .sort((a, b) => b.schedule.updatedAtMs - a.schedule.updatedAtMs)
        .map((e) => ({ schedule: e.schedule, recipientUserId: null }));
    },
    async listForRecipient(username: string): Promise<CheckinSchedule[]> {
      return Object.values(readAll())
        .filter((e) => !e.deletedAtMs && e.recipientUsername === username)
        .sort((a, b) => b.schedule.updatedAtMs - a.schedule.updatedAtMs)
        .map((e) => e.schedule);
    },
    async getMySchedule(scheduleId: string): Promise<MyCheckinSchedule | null> {
      const e = readAll()[scheduleId];
      return e && !e.deletedAtMs ? { schedule: e.schedule, recipientUserId: null } : null;
    },
    async recipientUsernameOf(scheduleId: string): Promise<string | null> {
      return readAll()[scheduleId]?.recipientUsername ?? null;
    },
    async saveSchedule(schedule: CheckinSchedule, recipientUsername?: string): Promise<void> {
      const map = readAll();
      const prev = map[schedule.id];
      map[schedule.id] = {
        schedule,
        recipientUsername: recipientUsername ?? prev?.recipientUsername ?? null,
        deletedAtMs: null,
      };
      writeAll(map);
    },
    async deleteSchedule(scheduleId: string): Promise<void> {
      const map = readAll();
      const e = map[scheduleId];
      if (e) { e.deletedAtMs = Date.now(); e.schedule.updatedAtMs = Date.now(); writeAll(map); }
    },
    async listForPush() {
      return Object.values(readAll())
        .filter((e) => !e.deletedAtMs)
        .map((e) => ({ schedule: e.schedule, recipientUsername: e.recipientUsername }));
    },
  };
}

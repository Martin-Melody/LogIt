import type { CoachHabitAuthoringRepo, MyCoachHabit } from "../coachHabitRepo";
import type { CoachHabit } from "../../domain/CoachHabit";
import type { HabitEntry } from "../../domain/habit";
import { coachHabitApi, type RemoteMyCoachHabit } from "../../api/coachHabitApi";
import { syncApi } from "../../api/syncApi";

/** Coach-side read of one client's habit check-offs (for adherence review). Needs an
 * Active coaching relationship — the server gates ?clientId= on it. */
export async function fetchClientHabitEntries(clientId: string): Promise<HabitEntry[]> {
  const { entries } = await syncApi.pullHabitEntries(0, clientId);
  const out: HabitEntry[] = [];
  for (const entry of entries) {
    if (entry.deletedAtMs || !entry.dataJson) continue;
    try {
      out.push(JSON.parse(entry.dataJson) as HabitEntry);
    } catch {}
  }
  return out;
}

function parse(entry: RemoteMyCoachHabit): MyCoachHabit | null {
  if (entry.deletedAtMs || !entry.dataJson) return null;
  try {
    return {
      habit: JSON.parse(entry.dataJson) as CoachHabit,
      recipientUserId: entry.recipientUserId,
    };
  } catch {
    return null;
  }
}

/** Coach-side authoring backed directly by the API — used by the Studio web dashboard,
 * where the coach is online while assigning a client's habits. */
export function createRemoteCoachHabitRepo(): CoachHabitAuthoringRepo {
  return {
    async listMine(opts): Promise<MyCoachHabit[]> {
      const rows = await coachHabitApi.listMine(opts);
      return rows.map(parse).filter((h): h is MyCoachHabit => h !== null);
    },

    async listForRecipient(recipientId): Promise<MyCoachHabit[]> {
      const rows = await coachHabitApi.listMine({ recipientId });
      return rows.map(parse).filter((h): h is MyCoachHabit => h !== null);
    },

    async getMine(habitId): Promise<MyCoachHabit | null> {
      const rows = await coachHabitApi.listMine();
      return rows.map(parse).find((h): h is MyCoachHabit => h?.habit.id === habitId) ?? null;
    },

    async saveHabit(habit: CoachHabit, recipientUsername?: string): Promise<void> {
      await coachHabitApi.upsert({
        habitId: habit.id,
        dataJson: JSON.stringify(habit),
        updatedAtMs: habit.updatedAtMs,
        recipientUsername,
      });
    },

    async deleteHabit(habitId: string): Promise<void> {
      await coachHabitApi.upsert({
        habitId,
        dataJson: "",
        updatedAtMs: Date.now(),
        deletedAtMs: Date.now(),
      });
    },
  };
}

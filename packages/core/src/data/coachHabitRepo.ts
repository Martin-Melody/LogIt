import type { CoachHabit } from "../domain/CoachHabit";

/**
 * Client-side read-only view of the habits a coach has assigned. Kept up to date by
 * the sync loop (pullAndMergeAssignedHabits). The client never edits these — they
 * only check them off, which produces normal `HabitEntry` rows.
 */
export interface AssignedHabitRepo {
  listAssignedHabits(): Promise<CoachHabit[]>;
  getAssignedHabit(id: string): Promise<CoachHabit | null>;

  // ── Sync-merge surface (sync loop only) ──
  upsertFromRemote(habit: CoachHabit): Promise<void>;
  removeFromRemote(id: string): Promise<void>;
}

export type MyCoachHabit = {
  habit: CoachHabit;
  /** Server user id of the assigned client, or null for a template. */
  recipientUserId: string | null;
};

/** Coach-side authoring — implemented remotely for the Studio web dashboard. */
export interface CoachHabitAuthoringRepo {
  listMine(opts?: { recipientId?: string; templates?: boolean }): Promise<MyCoachHabit[]>;
  listForRecipient(recipientId: string): Promise<MyCoachHabit[]>;
  getMine(habitId: string): Promise<MyCoachHabit | null>;
  /** Persist a habit. `recipientUsername` assigns/reassigns it. */
  saveHabit(habit: CoachHabit, recipientUsername?: string): Promise<void>;
  deleteHabit(habitId: string): Promise<void>;
}

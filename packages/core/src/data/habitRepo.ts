import type { Habit, HabitEntry } from "../domain/habit";

export type ListEntriesOptions = {
  habitId?: string;
  /** Inclusive owner-local date bounds, `YYYY-MM-DD`. */
  fromIso?: string;
  toIso?: string;
};

/**
 * The user's own habits and check-offs. Personal — created by anyone (solo user,
 * coached client, coach). Coach-*assigned* habits are a separate entity delivered
 * by the sync loop (later slice); their check-offs are still `HabitEntry` rows
 * here.
 */
export interface HabitRepo {
  listHabits(opts?: { includeArchived?: boolean }): Promise<Habit[]>;
  getHabit(id: string): Promise<Habit | null>;
  saveHabit(habit: Habit): Promise<void>;
  archiveHabit(id: string): Promise<void>;
  deleteHabit(id: string): Promise<void>;

  listEntries(opts?: ListEntriesOptions): Promise<HabitEntry[]>;
  getEntry(habitId: string, dateIso: string): Promise<HabitEntry | null>;
  saveEntry(entry: HabitEntry): Promise<void>;
  deleteEntry(id: string): Promise<void>;

  // ── Sync-merge surface (used by syncService; no-ops until sync lands) ──
  upsertHabitFromRemote(h: Habit): Promise<void>;
  removeHabitFromRemote(id: string): Promise<void>;
  upsertEntryFromRemote(e: HabitEntry): Promise<void>;
  removeEntryFromRemote(id: string): Promise<void>;
  listHabitsForPush(): Promise<Habit[]>;
  listEntriesForPush(): Promise<HabitEntry[]>;
}

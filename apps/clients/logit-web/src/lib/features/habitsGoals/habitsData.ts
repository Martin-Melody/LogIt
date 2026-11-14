import { syncApi } from "@logit/core/api/syncApi";
import { coachHabitApi } from "@logit/core/api/coachHabitApi";
import { coachHabitAsHabit, type CoachHabit } from "@logit/core/domain/CoachHabit";
import { createHabitEntry, type Habit, type HabitEntry } from "@logit/core/domain/habit";
import { nowMs } from "@logit/core/domain/time";

/**
 * Habits on the dashboard: the lifter's own (editable) and their coach's (read-only), plus
 * the day-by-day check-offs. Rows go straight through the sync API; the newest copy wins.
 */

export type HabitsData = {
  habits: Habit[];
  archived: Habit[];
  /** Coach-assigned, as habits; their check-offs are the lifter's own entries. */
  coach: { habit: Habit; note?: string }[];
  entries: HabitEntry[];
};

function parseRows<T>(rows: { dataJson: string | null; deletedAtMs?: number | null }[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    if (r.deletedAtMs || !r.dataJson) continue;
    try { out.push(JSON.parse(r.dataJson) as T); } catch {}
  }
  return out;
}

export async function loadHabits(): Promise<HabitsData> {
  const [{ habits }, { entries }, assigned] = await Promise.all([
    syncApi.pullHabits(0),
    syncApi.pullHabitEntries(0),
    coachHabitApi.pullAssigned(0).catch(() => []),
  ]);
  // Same order as the phone: oldest first.
  const all = parseRows<Habit>(habits).sort((a, b) => a.createdAtMs - b.createdAtMs);
  const coach = assigned
    .filter((r) => !r.deletedAtMs && r.dataJson)
    .map((r) => { try { return JSON.parse(r.dataJson!) as CoachHabit; } catch { return null; } })
    .filter((h): h is CoachHabit => h != null && !h.archived)
    .sort((a, b) => a.createdAtMs - b.createdAtMs)
    .map((h) => ({ habit: coachHabitAsHabit(h), note: h.note?.trim() || undefined }));
  return {
    habits: all.filter((h) => !h.archived),
    archived: all.filter((h) => h.archived),
    coach,
    entries: parseRows<HabitEntry>(entries),
  };
}

function rowDto(row: { id: string; createdAtMs: number; updatedAtMs: number; deletedAtMs?: number }) {
  return {
    id: row.id,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    dataJson: row.deletedAtMs ? null : JSON.stringify(row),
    deletedAtMs: row.deletedAtMs,
  };
}

/** Save a new or edited habit (stamped now). */
export async function saveHabit(habit: Habit): Promise<Habit> {
  const saved = { ...habit, name: habit.name.trim(), updatedAtMs: nowMs() };
  await syncApi.pushHabits([rowDto(saved)]);
  return saved;
}

/**
 * Fix one day's check-off. Yes/no habits: `done`. Number habits: `value` (0 clears it).
 * Returns the entry as saved.
 */
export async function setHabitDay(habit: Habit, dateIso: string, existing: HabitEntry | undefined, change: { done?: boolean; value?: number }): Promise<HabitEntry> {
  const patch: Partial<HabitEntry> = { ...(existing ?? {}) };
  if (habit.target) {
    const value = Math.max(0, change.value ?? 0);
    patch.value = value;
    patch.done = value >= habit.target.value;
  } else {
    patch.done = change.done ?? !existing?.done;
  }
  const entry = createHabitEntry(habit.id, dateIso, patch);
  await syncApi.pushHabitEntries([rowDto(entry)]);
  return entry;
}

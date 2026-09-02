import { createId } from "./ids";
import { nowMs } from "./time";
import { addDays, dayOfWeek, weekStartIso } from "./dateIso";

/**
 * Habit tracking. A `Habit` is user-owned (created by anyone — solo user, coached
 * client, or coach). Coach-assigned habits are a separate coach-owned entity
 * (see `CoachHabit`, a later slice); either way the check-offs are `HabitEntry`
 * rows, which are the user's own data.
 *
 * The scoring helpers here are pure — a community "habit insight" plugin could
 * one day build on the same contract.
 */

export type HabitCadence =
  | { kind: "daily" }
  /** Specific weekdays, 0 = Sunday … 6 = Saturday. */
  | { kind: "days"; days: number[] }
  /** N check-offs a week, any days. */
  | { kind: "weekly"; timesPerWeek: number };

export type HabitTone = "primary" | "green" | "amber" | "rose";

export type Habit = {
  id: string;
  name: string;
  cadence: HabitCadence;
  /** Present → numeric habit (log a value). Absent → yes/no. */
  target?: { value: number; unit?: string };
  /** Emoji or a lucide icon name. */
  icon?: string;
  tone?: HabitTone;
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export type HabitEntry = {
  id: string;
  habitId: string;
  /** Owner-local `YYYY-MM-DD`. */
  dateIso: string;
  done: boolean;
  /** For numeric habits — the logged amount. */
  value?: number;
  note?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export function createHabit(name: string, patch: Partial<Habit> = {}): Habit {
  const now = nowMs();
  return {
    id: createId("hab"),
    name: name.trim(),
    cadence: { kind: "daily" },
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    ...patch,
  };
}

export function createHabitEntry(
  habitId: string,
  dateIso: string,
  patch: Partial<HabitEntry> = {},
): HabitEntry {
  const now = nowMs();
  return {
    id: createId("hen"),
    habitId,
    dateIso,
    done: true,
    createdAtMs: now,
    updatedAtMs: now,
    ...patch,
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

/** Is `habit` expected on `dateIso`? (Weekly habits are "any day", so always true.) */
export function dueOn(habit: Habit, dateIso: string): boolean {
  switch (habit.cadence.kind) {
    case "daily":
      return true;
    case "days":
      return habit.cadence.days.includes(dayOfWeek(dateIso));
    case "weekly":
      return true;
  }
}

/** Did the entry meet the habit's bar for that day? */
export function isSatisfied(habit: Habit, entry: HabitEntry | undefined): boolean {
  if (!entry) return false;
  if (habit.target) return (entry.value ?? 0) >= habit.target.value;
  return entry.done === true;
}

function entryFor(entries: HabitEntry[], habitId: string, dateIso: string): HabitEntry | undefined {
  return entries.find((e) => e.habitId === habitId && e.dateIso === dateIso);
}

/** Check-offs this week (Mon-start) vs the target, for weekly habits. */
export function weekProgress(
  habit: Habit,
  entries: HabitEntry[],
  todayIso: string,
): { done: number; target: number } | null {
  if (habit.cadence.kind !== "weekly") return null;
  const start = weekStartIso(todayIso);
  let done = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (d > todayIso) break;
    if (isSatisfied(habit, entryFor(entries, habit.id, d))) done += 1;
  }
  return { done, target: habit.cadence.timesPerWeek };
}

/**
 * Current streak.
 * - daily / specific-days: consecutive *due* days ending today (or yesterday, if
 *   today isn't done yet) that were satisfied.
 * - weekly: consecutive completed weeks (target met), plus the current week if
 *   it's already met.
 */
export function computeStreak(habit: Habit, entries: HabitEntry[], todayIso: string): number {
  if (habit.cadence.kind === "weekly") {
    let streak = 0;
    let weekStart = weekStartIso(todayIso);
    for (;;) {
      let done = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(weekStart, i);
        if (d > todayIso) break;
        if (isSatisfied(habit, entryFor(entries, habit.id, d))) done += 1;
      }
      const isCurrentWeek = weekStart === weekStartIso(todayIso);
      if (done >= habit.cadence.timesPerWeek) {
        streak += 1;
      } else if (!isCurrentWeek) {
        break;
      } else if (streak === 0) {
        // current week not yet met and no prior streak
        break;
      } else {
        break;
      }
      weekStart = addDays(weekStart, -7);
    }
    return streak;
  }

  let streak = 0;
  let cursor = todayIso;
  // If today is due but not done, start counting from yesterday (grace).
  if (dueOn(habit, cursor) && !isSatisfied(habit, entryFor(entries, habit.id, cursor))) {
    cursor = addDays(cursor, -1);
  }
  for (let guard = 0; guard < 3650; guard++) {
    if (!dueOn(habit, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (isSatisfied(habit, entryFor(entries, habit.id, cursor))) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

/** Satisfied vs due over an inclusive date range. */
export function adherence(
  habit: Habit,
  entries: HabitEntry[],
  startIso: string,
  endIso: string,
): { satisfied: number; due: number; pct: number } {
  if (habit.cadence.kind === "weekly") {
    // Weekly: a "due" is one required check-off; satisfied is one that landed.
    let satisfied = 0;
    let due = 0;
    let ws = weekStartIso(startIso);
    while (ws <= endIso) {
      due += habit.cadence.timesPerWeek;
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i);
        if (d < startIso || d > endIso) continue;
        if (isSatisfied(habit, entryFor(entries, habit.id, d))) satisfied += 1;
      }
      ws = addDays(ws, 7);
    }
    satisfied = Math.min(satisfied, due);
    return { satisfied, due, pct: due === 0 ? 0 : satisfied / due };
  }

  let satisfied = 0;
  let due = 0;
  let d = startIso;
  while (d <= endIso) {
    if (dueOn(habit, d)) {
      due += 1;
      if (isSatisfied(habit, entryFor(entries, habit.id, d))) satisfied += 1;
    }
    d = addDays(d, 1);
  }
  return { satisfied, due, pct: due === 0 ? 0 : satisfied / due };
}

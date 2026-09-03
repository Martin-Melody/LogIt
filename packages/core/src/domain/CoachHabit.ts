import { createId } from "./ids";
import { nowMs } from "./time";
import type { Habit, HabitCadence, HabitTone } from "./habit";

/**
 * A habit a coach assigns to one client. The mirror image of the coach-read path
 * (CoachProgram / CheckinSchedule): the coach owns and writes this row, the client
 * pulls it read-only via GET /coach/habits/assigned. It never touches the client's
 * own `Habit` rows.
 *
 * The client checks a coach habit off exactly like their own — the check-off is a
 * normal `HabitEntry` whose `habitId` is this row's `id`. Use `coachHabitAsHabit`
 * to run it through the same `domain/habit.ts` scoring helpers with no special-casing.
 */
export type CoachHabit = {
  /** "chab_…" nanoid, unique per coach — the upsert key alongside the coach id. */
  id: string;
  name: string;
  icon?: string;
  tone?: HabitTone;
  cadence: HabitCadence;
  /** Present → numeric habit (log a value). Absent → yes/no. */
  target?: { value: number; unit?: string };
  /** Free-text guidance shown to the client under the habit. */
  note?: string;
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

export function createCoachHabit(name = "Habit"): CoachHabit {
  const now = nowMs();
  return {
    id: createId("chab"),
    name: name.trim() || "Habit",
    cadence: { kind: "daily" },
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

export function updateCoachHabit(
  habit: CoachHabit,
  patch: Partial<Omit<CoachHabit, "id" | "createdAtMs" | "updatedAtMs">>,
): CoachHabit {
  return { ...habit, ...patch, updatedAtMs: nowMs() };
}

/**
 * Adapt a coach habit into the plain `Habit` shape the check-off UI and the
 * `dueOn` / `isSatisfied` / `computeStreak` / `adherence` helpers expect. The id
 * is preserved, so `HabitEntry.habitId` lines up on both sides.
 */
export function coachHabitAsHabit(habit: CoachHabit): Habit {
  return {
    id: habit.id,
    name: habit.name,
    cadence: habit.cadence,
    target: habit.target,
    icon: habit.icon,
    tone: habit.tone,
    archived: habit.archived,
    createdAtMs: habit.createdAtMs,
    updatedAtMs: habit.updatedAtMs,
  };
}

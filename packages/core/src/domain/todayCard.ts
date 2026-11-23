// Home's Today card (decision D1): one answer to "what now?", taken from the split's plan alone.
// Before, This week, Quick start and Today's plan each worked it out their own way and could
// offer different workouts at once (bug hunt 1.15, 3.14, 9.8).
import type { SplitDay } from "./WorkoutSplit";
import type { SplitPlan } from "./splitSchedule";

export type NextWorkout = { dateIso: string; day: SplitDay };

export type TodayCard =
  /** A workout is running: Continue. */
  | { kind: "continue" }
  /** Today's workout, still to do. */
  | { kind: "start"; day: SplitDay }
  /** Today's workouts are done; what comes next. */
  | { kind: "done"; done: SplitDay[]; next: NextWorkout | null }
  /** A planned rest day; what comes next. */
  | { kind: "rest"; next: NextWorkout | null }
  /** No plan to go by. */
  | { kind: "none" };

export function todayCard(plan: SplitPlan | null, opts: { inProgress: boolean }): TodayCard {
  if (opts.inProgress) return { kind: "continue" };
  if (!plan) return { kind: "none" };
  const later = plan.laterToday[0];
  if (later) return { kind: "start", day: later };
  const first = plan.next?.days[0];
  const next = plan.next && first ? { dateIso: plan.next.dateIso, day: first } : null;
  if (plan.doneToday.length) return { kind: "done", done: plan.doneToday, next };
  if (plan.restToday) return { kind: "rest", next };
  // Nothing placed on today (weekdays not set yet): the next one to start.
  return plan.startNext ? { kind: "start", day: plan.startNext } : { kind: "none" };
}

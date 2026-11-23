// This week of a split on a weekday schedule (design canvas O7 and O8): which workouts are
// done, which is today, and what happens to a missed one. A missed workout isn't dropped and
// nothing breaks: the rest of the week's workouts keep their order and move forward onto the
// next free days ("Lower A is today instead"). If they no longer fit before Sunday, the ones
// left over are said so, and next week starts clean.
import { addDays, dayOfWeek, weekStartIso } from "./dateIso";
import type { SplitDay, WorkoutSplit } from "./WorkoutSplit";

export type WeekSlot = {
  dateIso: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** The plan's workout on this day (after any moves), or the one done on it. */
  dayId?: string;
  dayName?: string;
  state: "done" | "today" | "planned" | "rest";
  /** Set when the workout was planned for another day and moved here. */
  movedFromWeekday?: number;
};

export type WeekPlan = {
  /** Monday to Sunday. */
  slots: WeekSlot[];
  done: number;
  /** Workouts in the plan this week. */
  planned: number;
  remaining: number;
  /** Days left this week, today included. */
  daysLeft: number;
  moves: { dayId: string; dayName: string; fromWeekday: number; toWeekday: number }[];
  /** Workouts that no longer fit this week. */
  leftOver: { dayId: string; dayName: string }[];
  /** Done, plus the ones laid out today or on the plan's own days: what a first week asks for
   * (a Thursday start on Mon/Wed/Fri isn't asked to train Thu, Fri and Sat). */
  onSchedule: number;
};

type DoneSession = { startedAtMs: number; source?: { dayId?: string } | null };

/** Monday-first position of a weekday (Monday 0 … Sunday 6). */
const pos = (weekday: number) => (weekday + 6) % 7;

/** The split days done on a local date, from the workouts' sources. */
export function dayIdsDoneOn(sessions: DoneSession[], iso: string): string[] {
  return sessions.filter((s) => localIso(s.startedAtMs) === iso).map((s) => s.source?.dayId).filter((id): id is string => !!id);
}

function localIso(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(split: WorkoutSplit, day: SplitDay): string {
  return day.name?.trim() || `Day ${split.days.filter((d) => !d.rest).indexOf(day) + 1}`;
}

/**
 * The week containing `todayIso` for a split on a weekday schedule. `sessions` are the
 * workouts done (any week; this week's are picked out by local date).
 */
export function planWeek(
  split: WorkoutSplit,
  sessions: DoneSession[],
  todayIso: string,
  /** When the plan started: its workouts on days before that are laid out, but not "moved". */
  planStartIso?: string,
): WeekPlan {
  const monday = weekStartIso(todayIso);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const t = pos(dayOfWeek(todayIso));
  const workouts = split.days
    .filter((d) => !d.rest && d.weekday !== undefined)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const thisWeek = sessions.filter((s) => dates.includes(localIso(s.startedAtMs)));
  const doneIds = new Set(thisWeek.map((s) => s.source?.dayId).filter((id): id is string => !!id));
  const doneOn = new Map<number, DoneSession>();
  for (const s of thisWeek) doneOn.set(dates.indexOf(localIso(s.startedAtMs)), s);

  // A device that didn't make the plan has no start saved: the split's own date is the start.
  const start = planStartIso ?? (split.createdAtMs ? localIso(split.createdAtMs) : undefined);
  // Lay the workouts not done yet onto today and the days after it, in plan order, each on
  // its own day or the first free day after the one before it.
  const remaining = workouts.filter((d) => !doneIds.has(d.id));
  const placed = new Map<number, { day: SplitDay; fromWeekday?: number }>();
  const moves: WeekPlan["moves"] = [];
  const leftOver: WeekPlan["leftOver"] = [];
  let pointer = doneOn.has(t) ? t + 1 : t;
  let notDue = 0;
  for (const day of remaining) {
    const original = pos(day.weekday!);
    let at = Math.max(pointer, original);
    while (doneOn.has(at) && at < 7) at++;
    if (at > 6) {
      // Its day came before the plan started, so it was never due: not "won't fit this week".
      if (start && dates[original]! < start) {
        notDue++;
        continue;
      }
      leftOver.push({ dayId: day.id, dayName: dayLabel(split, day) });
      continue;
    }
    // A workout whose day came before the plan started wasn't missed: never "Wednesday's
    // workout moved" to someone who joined on Thursday.
    const moved = at !== original && (!start || dates[original]! >= start);
    placed.set(at, { day, fromWeekday: moved ? day.weekday : undefined });
    if (moved) moves.push({ dayId: day.id, dayName: dayLabel(split, day), fromWeekday: day.weekday!, toWeekday: (at + 1) % 7 });
    pointer = at + 1;
  }

  // Only a workout missed after the plan started moves things: one laid out late because the
  // plan began mid-week (and whatever it pushes along) isn't "moved".
  const missed = remaining.some((d) => pos(d.weekday!) < t && (!start || dates[pos(d.weekday!)]! >= start));
  if (!missed) {
    moves.length = 0;
    for (const p of placed.values()) delete p.fromWeekday;
  }

  const slots: WeekSlot[] = dates.map((dateIso, i) => {
    const weekday = (i + 1) % 7;
    const done = doneOn.get(i);
    if (done) {
      const day = workouts.find((d) => d.id === done.source?.dayId);
      return { dateIso, weekday, state: "done", dayId: day?.id, dayName: day ? dayLabel(split, day) : undefined };
    }
    const p = placed.get(i);
    if (p) {
      return {
        dateIso, weekday, dayId: p.day.id, dayName: dayLabel(split, p.day),
        state: i === t ? "today" : "planned",
        ...(p.fromWeekday !== undefined ? { movedFromWeekday: p.fromWeekday } : {}),
      };
    }
    return { dateIso, weekday, state: "rest" };
  });

  return {
    slots,
    done: doneOn.size,
    planned: workouts.length,
    remaining: remaining.length - notDue,
    daysLeft: 7 - t,
    moves,
    leftOver,
    onSchedule: doneOn.size + [...placed.keys()].filter((i) => i === t || workouts.some((d) => pos(d.weekday!) === i)).length,
  };
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven"];

/**
 * The line under the week: "Tuesday's workout moved to today. Three to go, three days left."
 * Never "missed", never red.
 */
export function weekPlanLine(plan: WeekPlan, todayWeekday: number, target?: number): string {
  // "To go" counts toward this week's target when it's lower than the plan ("Make it 3").
  const toGo = target === undefined ? plan.remaining : Math.min(plan.remaining, Math.max(0, target - plan.done));
  const parts: string[] = [];
  const toToday = plan.moves.find((m) => m.toWeekday === todayWeekday);
  if (toToday) parts.push(`${WEEKDAY_NAMES[toToday.fromWeekday]}'s workout moved to today.`);
  else if (plan.moves.length) parts.push(`${WEEKDAY_NAMES[plan.moves[0]!.fromWeekday]}'s workout moved to ${WEEKDAY_NAMES[plan.moves[0]!.toWeekday]}.`);
  if (plan.leftOver.length) {
    parts.push(`${plan.leftOver.map((d) => d.dayName).join(" and ")} won't fit this week. Next week starts fresh.`);
  } else if (toGo === 0) {
    parts.push("All done this week.");
  } else {
    const left = plan.daysLeft === 1 ? "today left" : `${NUMBER_WORDS[plan.daysLeft]?.toLowerCase() ?? plan.daysLeft} days left`;
    parts.push(`${NUMBER_WORDS[toGo] ?? toGo} to go, ${left}.`);
  }
  return parts.join(" ");
}

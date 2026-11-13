import { createId } from "./ids";
import { addDays, dayOfWeek } from "./dateIso";
import { touchSplit, type PlannedBlock, type PlannedGroup, type SplitDay, type WorkoutSplit } from "./WorkoutSplit";

/**
 * Where a split puts you on the calendar: what's done today, what's still to do today, and
 * when the next workout is. Two ways a split can run:
 *
 * - **Rotation** (default): the days follow each other whenever you train. Rest days take
 *   up one calendar day each; a day marked `sameDayAsPrevious` is a second workout on the
 *   same day. Workouts never get skipped: miss a day and the plan waits for you. Rest days
 *   do pass on their own, though, so after a long gap you're straight back to training.
 * - **Weekdays**: each day sits on a weekday. The calendar decides; days without a workout
 *   are rest days. Several days on one weekday are several workouts that day.
 */

export type SplitProgress = {
  /** The day done most recently, and the local date it was done. */
  last: { dayId: string; dateIso: string } | null;
  /** Days done today (any order), when known. */
  doneTodayIds?: string[];
};

export type SplitPlan = {
  /** Workout days from this split done today. */
  doneToday: SplitDay[];
  /** Still to do today, in order. */
  laterToday: SplitDay[];
  /** Today is a planned rest day (and nothing's left for today). */
  restToday: boolean;
  /** The next date with a workout after today, and its days. */
  next: { dateIso: string; days: SplitDay[] } | null;
  /** What starting a workout now should start: today's next one, else the next planned. */
  startNext: SplitDay | null;
};

export function sortedDays(split: WorkoutSplit): SplitDay[] {
  return [...split.days].sort((a, b) => a.orderIndex - b.orderIndex);
}

export function isWorkoutDay(day: SplitDay): boolean {
  return !day.rest;
}

/** Rotation slots: each is one calendar day (a rest day, or a workout plus any same-day ones). */
export function rotationSlots(split: WorkoutSplit): SplitDay[][] {
  const slots: SplitDay[][] = [];
  for (const d of sortedDays(split)) {
    const prev = slots.at(-1);
    if (d.sameDayAsPrevious && !d.rest && prev && !prev[0]!.rest) prev.push(d);
    else slots.push([d]);
  }
  return slots;
}

const EMPTY: SplitPlan = { doneToday: [], laterToday: [], restToday: false, next: null, startNext: null };

export function planSplit(split: WorkoutSplit, progress: SplitProgress, todayIso: string): SplitPlan {
  return split.schedule === "weekdays"
    ? planWeekdays(split, progress, todayIso)
    : planRotation(split, progress, todayIso);
}

function doneTodaySet(split: WorkoutSplit, progress: SplitProgress, todayIso: string): Set<string> {
  const ids = new Set(progress.doneTodayIds ?? []);
  if (progress.last?.dateIso === todayIso) ids.add(progress.last.dayId);
  // Only days still in the split.
  return new Set([...ids].filter((id) => split.days.some((d) => d.id === id)));
}

function planRotation(split: WorkoutSplit, progress: SplitProgress, todayIso: string): SplitPlan {
  const slots = rotationSlots(split);
  if (!slots.some((s) => !s[0]!.rest)) return EMPTY;
  const done = doneTodaySet(split, progress, todayIso);
  const doneToday = sortedDays(split).filter((d) => done.has(d.id));

  // Start just after the last day done; with nothing done yet, at the first slot today.
  const lastIdx = progress.last ? slots.findIndex((s) => s.some((d) => d.id === progress.last!.dayId)) : -1;
  let laterToday: SplitDay[] = [];
  let k: number;
  let cursor: string;
  if (lastIdx === -1) {
    k = 0;
    cursor = todayIso;
  } else if (progress.last!.dateIso === todayIso) {
    // The rest of today's slot is still for today.
    laterToday = slots[lastIdx]!.filter((d) => !done.has(d.id));
    k = lastIdx + 1;
    cursor = addDays(todayIso, 1);
  } else {
    // A slot left half done on an earlier day ended with that day.
    k = lastIdx + 1;
    cursor = addDays(progress.last!.dateIso, 1);
  }

  let restToday = false;
  let next: SplitPlan["next"] = null;
  // Walk forward; two laps is plenty to find the next workout.
  for (let step = 0; step < slots.length * 2 + 1 && !next; step++) {
    const slot = slots[(k + step) % slots.length]!;
    if (slot[0]!.rest) {
      if (cursor < todayIso) {
        cursor = addDays(cursor, 1); // passed while you were away
        continue;
      }
      if (cursor === todayIso && laterToday.length === 0 && doneToday.length === 0) restToday = true;
      cursor = addDays(cursor, 1);
      continue;
    }
    // A workout waits for you: never earlier than today.
    const date = cursor < todayIso ? todayIso : cursor;
    if (date === todayIso && laterToday.length === 0 && doneToday.length === 0) {
      laterToday = slot.filter((d) => !done.has(d.id));
    } else if (date > todayIso || (date === todayIso && (laterToday.length > 0 || doneToday.length > 0))) {
      // Today is spoken for already, so this is the next one.
      next = { dateIso: date > todayIso ? date : addDays(todayIso, 1), days: slot };
    }
    cursor = addDays(date, 1);
  }

  return { doneToday, laterToday, restToday, next, startNext: laterToday[0] ?? next?.days[0] ?? null };
}

function planWeekdays(split: WorkoutSplit, progress: SplitProgress, todayIso: string): SplitPlan {
  const days = sortedDays(split).filter((d) => !d.rest);
  const scheduled = days.filter((d) => d.weekday != null);
  const done = doneTodaySet(split, progress, todayIso);
  const doneToday = days.filter((d) => done.has(d.id));
  const onDate = (iso: string) => scheduled.filter((d) => d.weekday === dayOfWeek(iso));

  const today = onDate(todayIso);
  const laterToday = openToday(today, doneToday, done);
  let next: SplitPlan["next"] = null;
  for (let i = 1; i <= 7 && !next; i++) {
    const iso = addDays(todayIso, i);
    const ds = onDate(iso);
    if (ds.length) next = { dateIso: iso, days: ds };
  }
  const restToday = scheduled.length > 0 && today.length === 0 && doneToday.length === 0;
  // No weekdays set yet: behave like a plain list so Start still does something useful.
  const fallback = scheduled.length === 0 ? (days.find((d) => !done.has(d.id)) ?? days[0] ?? null) : null;
  return {
    doneToday,
    laterToday,
    restToday,
    next,
    startNext: laterToday[0] ?? next?.days[0] ?? fallback,
  };
}

// ── Editing ─────────────────────────────────────────────────────────────────

function withOrder(days: SplitDay[]): SplitDay[] {
  return days.map((d, i) => (d.orderIndex === i ? d : { ...d, orderIndex: i }));
}

/** A copy of a day (new ids for it, its blocks and groups) straight after it. */
export function duplicateDay(split: WorkoutSplit, dayId: string): { split: WorkoutSplit; copy: SplitDay | null } {
  const days = sortedDays(split);
  const idx = days.findIndex((d) => d.id === dayId);
  if (idx === -1) return { split, copy: null };
  const src = days[idx]!;
  const groupIds = new Map<string, string>((src.groups ?? []).map((g) => [g.id, createId("grp")]));
  const groups: PlannedGroup[] | undefined = src.groups?.map((g) => ({ ...g, id: groupIds.get(g.id)! }));
  const blocks: PlannedBlock[] = src.blocks.map((b) => ({
    ...b,
    id: createId("pb"),
    ...(b.groupId ? { groupId: groupIds.get(b.groupId) ?? b.groupId } : {}),
  }));
  const copy: SplitDay = {
    ...src,
    id: createId("day"),
    name: src.name ? `${src.name} (copy)` : undefined,
    blocks,
    ...(groups ? { groups } : {}),
    // A copy is its own calendar day.
    sameDayAsPrevious: undefined,
  };
  const next = withOrder([...days.slice(0, idx + 1), copy, ...days.slice(idx + 1)]);
  return { split: touchSplit({ ...split, days: next }), copy: next[idx + 1]! };
}

export function addRestDay(split: WorkoutSplit): WorkoutSplit {
  const days = sortedDays(split);
  return touchSplit({
    ...split,
    days: [...days, { id: createId("day"), orderIndex: days.length, name: "Rest", blocks: [], rest: true }],
  });
}

export function removeDay(split: WorkoutSplit, dayId: string): WorkoutSplit {
  const days = sortedDays(split).filter((d) => d.id !== dayId);
  // The new first day can't be "same day as the one before".
  if (days[0]?.sameDayAsPrevious) days[0] = { ...days[0], sameDayAsPrevious: undefined };
  return touchSplit({ ...split, days: withOrder(days) });
}

export function setScheduleMode(split: WorkoutSplit, mode: WorkoutSplit["schedule"]): WorkoutSplit {
  return touchSplit({ ...split, schedule: mode === "weekdays" ? "weekdays" : undefined });
}

export function setDayWeekday(split: WorkoutSplit, dayId: string, weekday: number | null): WorkoutSplit {
  return touchSplit({
    ...split,
    days: split.days.map((d) => (d.id === dayId ? { ...d, weekday: weekday ?? undefined } : d)),
  });
}

export function setSameDayAsPrevious(split: WorkoutSplit, dayId: string, on: boolean): WorkoutSplit {
  return touchSplit({
    ...split,
    days: split.days.map((d) => (d.id === dayId ? { ...d, sameDayAsPrevious: on || undefined } : d)),
  });
}

/**
 * Switching to weekdays: give days without one the next free weekday from Monday, rest days
 * dropped out of the count, so a 4-day Upper/Lower lands on Mon/Tue/Wed/Thu to adjust from.
 */
export function suggestWeekdays(split: WorkoutSplit): WorkoutSplit {
  const order = [1, 2, 3, 4, 5, 6, 0];
  let pos = 0;
  const days = sortedDays(split).map((d) => {
    if (d.rest) {
      pos++;
      return d;
    }
    if (d.weekday != null) return d;
    const wd = order[(d.sameDayAsPrevious ? Math.max(0, pos - 1) : pos) % 7]!;
    if (!d.sameDayAsPrevious) pos++;
    return { ...d, weekday: wd };
  });
  return touchSplit({ ...split, days });
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** A workout day's number among the split's workout days (rest days aren't counted). */
export function dayNumber(split: Pick<WorkoutSplit, "days">, dayId: string): number | null {
  const workouts = [...split.days].filter((d) => !d.rest).sort((a, b) => a.orderIndex - b.orderIndex);
  const i = workouts.findIndex((d) => d.id === dayId);
  return i === -1 ? null : i + 1;
}

/** "Day 2 — Lower", "Day 2" unnamed, "Rest day" for a rest day. */
export function splitDayTitle(split: Pick<WorkoutSplit, "days">, day: Pick<SplitDay, "id" | "name" | "rest" | "orderIndex">): string {
  if (day.rest) return "Rest day";
  const n = dayNumber(split, day.id) ?? day.orderIndex + 1;
  return day.name ? `Day ${n} — ${day.name}` : `Day ${n}`;
}

/** The day's name, else "Day N". */
export function splitDayName(split: Pick<WorkoutSplit, "days">, day: Pick<SplitDay, "id" | "name" | "rest" | "orderIndex">): string {
  if (day.rest) return "Rest day";
  return day.name?.trim() || `Day ${dayNumber(split, day.id) ?? day.orderIndex + 1}`;
}

// ── Timeline ────────────────────────────────────────────────────────────────

/** One page of the coming days: a workout on a date, or a rest day (`day: null`). */
export type TimelineEntry = { dateIso: string; day: SplitDay | null; done: boolean };

/**
 * Today and the days ahead, one entry per workout (two on a day = two entries) and one per
 * rest day. In order: until the split comes round again. By weekday: the next 7 days. Empty
 * when there's nothing to place (no workouts, or no weekdays set yet).
 */
export function splitTimeline(split: WorkoutSplit, progress: SplitProgress, todayIso: string): TimelineEntry[] {
  return split.schedule === "weekdays"
    ? weekdayTimeline(split, progress, todayIso)
    : rotationTimeline(split, progress, todayIso);
}

function rotationTimeline(split: WorkoutSplit, progress: SplitProgress, todayIso: string): TimelineEntry[] {
  const slots = rotationSlots(split);
  const n = slots.length;
  if (!slots.some((s) => !s[0]!.rest)) return [];
  const done = doneTodaySet(split, progress, todayIso);
  const out: TimelineEntry[] = [];
  const lastIdx = progress.last ? slots.findIndex((s) => s.some((d) => d.id === progress.last!.dayId)) : -1;

  let k: number;
  let cursor: string;
  if (lastIdx !== -1 && progress.last!.dateIso === todayIso) {
    // Today's slot: what's done and what's still to come.
    const slot = slots[lastIdx]!;
    // A day done today from elsewhere in the split (picked by hand) leads the page list.
    for (const d of sortedDays(split)) if (done.has(d.id) && !slot.includes(d)) out.push({ dateIso: todayIso, day: d, done: true });
    for (const d of slot) out.push({ dateIso: todayIso, day: d, done: done.has(d.id) });
    k = lastIdx + 1;
    cursor = addDays(todayIso, 1);
  } else {
    k = lastIdx === -1 ? 0 : lastIdx + 1;
    cursor = lastIdx === -1 ? todayIso : addDays(progress.last!.dateIso, 1);
    // Rest days that passed while you were away are gone.
    let guard = 0;
    while (slots[k % n]![0]!.rest && cursor < todayIso && guard++ < n) {
      cursor = addDays(cursor, 1);
      k++;
    }
    const slot = slots[k % n]!;
    if (slot[0]!.rest) out.push({ dateIso: todayIso, day: null, done: false });
    else for (const d of slot) out.push({ dateIso: todayIso, day: d, done: false });
    k++;
    cursor = addDays(todayIso, 1);
  }

  // The rest of one lap, so the split comes round once.
  for (let s = 0; s < n - 1; s++) {
    const slot = slots[(k + s) % n]!;
    if (slot[0]!.rest) out.push({ dateIso: cursor, day: null, done: false });
    else for (const d of slot) out.push({ dateIso: cursor, day: d, done: false });
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * Today's scheduled workouts still to do. A workout from another weekday done today stands
 * in for one of today's (you swapped days), so it isn't asked for twice.
 */
function openToday(today: SplitDay[], doneToday: SplitDay[], done: Set<string>): SplitDay[] {
  const swappedIn = doneToday.filter((d) => !today.includes(d)).length;
  return today.filter((d) => !done.has(d.id)).slice(swappedIn);
}

function weekdayTimeline(split: WorkoutSplit, progress: SplitProgress, todayIso: string): TimelineEntry[] {
  const days = sortedDays(split).filter((d) => !d.rest);
  const scheduled = days.filter((d) => d.weekday != null);
  if (scheduled.length === 0) return [];
  const done = doneTodaySet(split, progress, todayIso);
  const out: TimelineEntry[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDays(todayIso, i);
    const onDay = scheduled.filter((d) => d.weekday === dayOfWeek(iso));
    if (i === 0) {
      // Something from another weekday done today shows as done, first, and takes the
      // place of one of today's own.
      const doneToday = days.filter((d) => done.has(d.id));
      for (const d of doneToday) if (!onDay.includes(d)) out.push({ dateIso: iso, day: d, done: true });
      const open = new Set(openToday(onDay, doneToday, done));
      for (const d of onDay) {
        if (done.has(d.id)) out.push({ dateIso: iso, day: d, done: true });
        else if (open.has(d)) out.push({ dateIso: iso, day: d, done: false });
      }
      if (out.length === 0) out.push({ dateIso: iso, day: null, done: false });
      continue;
    }
    if (onDay.length === 0) out.push({ dateIso: iso, day: null, done: false });
    else for (const d of onDay) out.push({ dateIso: iso, day: d, done: false });
  }
  return out;
}

/**
 * The page the card opens on: today. Today's next workout still to do if there is one,
 * else today's first page (a done workout or a rest day). The timeline starts today.
 */
export function defaultTimelineIndex(timeline: TimelineEntry[], _plan?: SplitPlan): number {
  if (timeline.length === 0) return 0;
  const today = timeline[0]!.dateIso;
  const open = timeline.findIndex((e) => e.dateIso === today && e.day && !e.done);
  return open === -1 ? 0 : open;
}

/** The first workout still to do after the given page. */
export function nextWorkoutAfter(timeline: TimelineEntry[], index: number): TimelineEntry | null {
  return timeline.slice(index + 1).find((e) => e.day && !e.done) ?? null;
}

import type { WorkoutSplit, SplitDay } from "@logit/core/domain/WorkoutSplit";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { planSplit, splitTimeline, type SplitPlan, type SplitProgress, type TimelineEntry } from "@logit/core/domain/splitSchedule";
import { localDateIso } from "@logit/core/domain/nutrition";
import { movesMissed, weekSessions } from "$lib/features/onboarding/weekSessions";
import { planStartIso } from "$lib/features/onboarding/firstWeek";
import { currentSession } from "$lib/stores/currentSession.store";
import { get } from "svelte/store";

export type RotationState = {
  lastDayId: string;
  recordedAtMs: number;
  /** Every day done on the local date of `recordedAtMs` (a second workout that day). */
  doneOnDay?: string[];
};

export type ScheduleMode = "bump" | "original";

const SCHEDULE_MODE_KEY = "logit:schedule-mode:v1";
const RESET_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function getScheduleMode(): ScheduleMode {
  if (typeof localStorage === "undefined") return "bump";
  try {
    return getAccountItem(SCHEDULE_MODE_KEY) === "original" ? "original" : "bump";
  } catch { return "bump"; }
}

export function setScheduleMode(mode: ScheduleMode): void {
  if (typeof localStorage === "undefined") return;
  try { setAccountItem(SCHEDULE_MODE_KEY, mode); } catch {}
}

function storageKey(splitId: string) {
  return `logit:split-rotation:${splitId}:v1`;
}

function readRaw(splitId: string): RotationState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(splitId));
    const state = raw ? (JSON.parse(raw) as RotationState) : null;
    return state && typeof state.lastDayId === "string" && typeof state.recordedAtMs === "number" ? state : null;
  } catch {
    return null;
  }
}

/** Still written and synced because older app versions plan from it; this version plans from
 * the workouts themselves (a pointer moved on Start stayed moved when that workout was deleted). */
export function advanceRotation(splitId: string, dayId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const now = Date.now();
    const prev = readRaw(splitId);
    const sameDay = prev && localDateIso(new Date(prev.recordedAtMs)) === localDateIso(new Date(now));
    const doneOnDay = [...new Set([...(sameDay ? (prev.doneOnDay ?? [prev.lastDayId]) : []), dayId])];
    const state: RotationState = { lastDayId: dayId, recordedAtMs: now, doneOnDay };
    localStorage.setItem(storageKey(splitId), JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
  // Rides on the profile, so the other devices pick the next day up too.
  void import("$lib/sync/syncService").then((m) => m.pushNavConfig()).catch(() => {});
}

/** The rotation of each given split, as stored (expired ones included: the receiving side
 * applies the same 7-day reset when it reads them). For the synced profile. */
export function getRotations(splitIds: string[]): Record<string, RotationState> {
  const out: Record<string, RotationState> = {};
  for (const id of splitIds) {
    const state = readRaw(id);
    if (state) out[id] = state;
  }
  return out;
}

/** Take another device's rotations: per split, the newer "last day done" wins. */
export function applyRemoteRotations(remote: Record<string, RotationState>): void {
  if (typeof localStorage === "undefined") return;
  for (const [splitId, state] of Object.entries(remote)) {
    if (typeof state?.lastDayId !== "string" || typeof state?.recordedAtMs !== "number") continue;
    const local = readRaw(splitId);
    if (local && local.recordedAtMs >= state.recordedAtMs) continue;
    try {
      localStorage.setItem(
        storageKey(splitId),
        JSON.stringify({
          lastDayId: state.lastDayId,
          recordedAtMs: state.recordedAtMs,
          ...(Array.isArray(state.doneOnDay) ? { doneOnDay: state.doneOnDay } : {}),
        }),
      );
    } catch {}
  }
}

function progressOf(split: WorkoutSplit, todayIso: string): SplitProgress {
  // Where you are comes from the workouts you have: finished ones and the one running now.
  // Deleted or discarded ones don't count. A week away starts the split over.
  const since = Date.now() - RESET_AFTER_MS;
  const draft = get(currentSession);
  const fromSplit = [...(draft ? [draft] : []), ...weekSessions()].filter(
    (s) =>
      s.startedAtMs > since &&
      s.source?.kind === "split" &&
      s.source.parentId === split.id &&
      split.days.some((d) => d.id === s.source!.dayId),
  );
  const newest = fromSplit[0];
  const last = newest ? { dayId: newest.source!.dayId, dateIso: localDateIso(new Date(newest.startedAtMs)) } : null;
  const doneTodayIds = fromSplit.filter((s) => localDateIso(new Date(s.startedAtMs)) === todayIso).map((s) => s.source!.dayId);
  // A plan from onboarding carries a missed workout forward through the week.
  if (split.schedule === "weekdays" && movesMissed(split.id)) {
    return { last, doneTodayIds, week: { sessions: weekSessions(), planStartIso: planStartIso() } };
  }
  return { last, doneTodayIds };
}

/** Where the split puts you today: done, still to do, rest, and the next workout. */
export function getSplitPlan(split: WorkoutSplit, now = new Date()): SplitPlan {
  const todayIso = localDateIso(now);
  return planSplit(split, progressOf(split, todayIso), todayIso);
}

/** Today and the coming days, a page per workout or rest day (Today's plan card). */
export function getSplitTimeline(split: WorkoutSplit, now = new Date()): TimelineEntry[] {
  const todayIso = localDateIso(now);
  return splitTimeline(split, progressOf(split, todayIso), todayIso);
}

/** The day Start should start: today's next workout, else the next one planned. */
export function getNextDay(split: WorkoutSplit): SplitDay | null {
  return getSplitPlan(split).startNext;
}

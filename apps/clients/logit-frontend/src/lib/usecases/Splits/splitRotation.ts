import type { WorkoutSplit, SplitDay } from "@logit/core/domain/WorkoutSplit";

type RotationState = { lastDayId: string; recordedAtMs: number };

export type ScheduleMode = "bump" | "original";

const SCHEDULE_MODE_KEY = "logit:schedule-mode:v1";
const RESET_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function getScheduleMode(): ScheduleMode {
  if (typeof localStorage === "undefined") return "bump";
  try {
    return localStorage.getItem(SCHEDULE_MODE_KEY) === "original" ? "original" : "bump";
  } catch { return "bump"; }
}

export function setScheduleMode(mode: ScheduleMode): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(SCHEDULE_MODE_KEY, mode); } catch {}
}

function storageKey(splitId: string) {
  return `logit:split-rotation:${splitId}:v1`;
}

function loadState(splitId: string): RotationState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(splitId));
    const state = raw ? (JSON.parse(raw) as RotationState) : null;
    // Auto-reset after a week gap so old state doesn't haunt a returning user
    if (state && Date.now() - state.recordedAtMs > RESET_AFTER_MS) return null;
    return state;
  } catch {
    return null;
  }
}

export function advanceRotation(splitId: string, dayId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const state: RotationState = { lastDayId: dayId, recordedAtMs: Date.now() };
    localStorage.setItem(storageKey(splitId), JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function getNextDay(split: WorkoutSplit): SplitDay | null {
  const days = [...split.days].sort((a, b) => a.orderIndex - b.orderIndex);
  if (!days.length) return null;

  const state = loadState(split.id);
  if (!state) return days[0]!;

  const lastIdx = days.findIndex((d) => d.id === state.lastDayId);
  if (lastIdx === -1) return days[0]!; // last day was deleted — restart from beginning

  const nextIdx = (lastIdx + 1) % days.length;
  return days[nextIdx]!;
}

import type { WorkoutSplit, SplitDay } from "$lib/domain/WorkoutSplit";

type RotationState = { lastDayId: string; recordedAtMs: number };

function storageKey(splitId: string) {
  return `logit:split-rotation:${splitId}:v1`;
}

function loadState(splitId: string): RotationState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(splitId));
    return raw ? (JSON.parse(raw) as RotationState) : null;
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

// Best lifts typed in during onboarding ("Your best lifts", design canvas E1m). The planner
// reads one as an exercise's history until that exercise is first logged (core
// domain/startingLift.ts).
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import type { StartingLift } from "@logit/core/domain/startingLift";

const KEY = "logit:starting-lifts";

// shortcut: kept on this phone per account, not synced; each lift only matters until its first
// logged set, which is normally on this phone. Sync it if people switch phones before training.
export function loadStartingLifts(): StartingLift[] {
  try {
    const raw = getAccountItem(KEY);
    return raw ? (JSON.parse(raw) as StartingLift[]) : [];
  } catch {
    return [];
  }
}

export function saveStartingLifts(lifts: StartingLift[]): void {
  setAccountItem(KEY, JSON.stringify(lifts));
}

// The goal picked in onboarding (O1), kept per account and synced in the profile so the web
// dashboard can arrange Overview by it (web onboarding W4).
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import type { TrainingGoal } from "@logit/core/domain/starterPlan";

const KEY = "logit:training-goal";
const GOALS: readonly TrainingGoal[] = ["strength", "muscle", "both", "fit", "leaner"];

export function isTrainingGoal(v: unknown): v is TrainingGoal {
  return typeof v === "string" && (GOALS as readonly string[]).includes(v);
}

export function getTrainingGoal(): TrainingGoal | null {
  try {
    const v = getAccountItem(KEY);
    return isTrainingGoal(v) ? v : null;
  } catch {
    return null;
  }
}

export function setTrainingGoal(goal: TrainingGoal): void {
  try {
    setAccountItem(KEY, goal);
  } catch {
    /* storage unavailable: the dashboard just keeps its default order */
  }
}

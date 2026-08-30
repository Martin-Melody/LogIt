import type { DiaryDay, NutritionGoal, WeightEntry } from "../../domain/nutrition";
import { syncApi } from "../../api/syncApi";

// API-backed reads of a user's nutrition data, for the logit-web dashboard. Milestone 1
// only needs the client-review helpers below (Phase 3 coach dashboard); a full
// NutritionRepo implemented against the API can be added when logit-web gets its own
// personal nutrition views (Phase 2).

function parseJson<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** A client's food diary (coach review). Requires an Active coach relationship — enforced
 * server-side via `?clientId=`. */
export async function fetchClientDiary(clientId: string): Promise<DiaryDay[]> {
  const { days } = await syncApi.pullNutritionDays(0, clientId);
  return days
    .filter((d) => !d.deletedAtMs)
    .map((d) => parseJson<DiaryDay>(d.dataJson))
    .filter((d): d is DiaryDay => d !== null);
}

/** A client's bodyweight log (coach review). */
export async function fetchClientWeightLog(clientId: string): Promise<WeightEntry[]> {
  const { entries } = await syncApi.pullWeightEntries(0, clientId);
  return entries
    .filter((e) => !e.deletedAtMs)
    .map((e) => parseJson<WeightEntry>(e.dataJson))
    .filter((e): e is WeightEntry => e !== null);
}

/** A client's nutrition goal (coach review). */
export async function fetchClientNutritionGoal(
  clientId: string,
): Promise<NutritionGoal | null> {
  const { goal } = await syncApi.pullNutritionGoal(clientId);
  return goal ? parseJson<NutritionGoal>(goal.dataJson) : null;
}

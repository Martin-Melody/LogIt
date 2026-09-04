// Progress-stat compute functions — shared by two callers: the local widgets on
// /routes/profile (rendered live, no sync lag) and syncPublicProfile()'s snapshot builder
// (embedded in publicProfileJson, rendered by ProfileView for anyone including yourself). Each
// stat is one typed shape (defined on PublicProfileData in @logit/core/api/socialApi) + one
// compute function here + one presentational component — see
// docs/architecture/profile-progress-redesign.md §2b for why this shape was chosen.
import { getWorkoutRepo, getNutritionRepo } from "$lib/data/repoProvider";
import { getPersonalRecords } from "$lib/usecases/getPersonalRecords";
import type { PublicWeightTrend, PublicStreak, PublicBadge } from "@logit/core/api/socialApi";

const DAY_MS = 86_400_000;

function toDateIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function computeWeightTrend(days = 90): Promise<PublicWeightTrend> {
  const sinceIso = toDateIso(Date.now() - days * DAY_MS);
  const entries = await getNutritionRepo().listWeightEntries(sinceIso);
  const points = entries
    .filter((e) => !e.deletedAtMs)
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso))
    .map((e) => ({ dateIso: e.dateIso, kg: e.weightKg }));
  return { points };
}

export async function computeStreak(): Promise<PublicStreak> {
  const sessions = await getWorkoutRepo().listAllSessions();
  const days = new Set(sessions.map((s) => toDateIso(s.startedAtMs)));
  const sorted = [...days].sort();

  // Current streak: consecutive calendar days ending today. A rest day today doesn't break
  // it until tomorrow passes with still nothing logged — so fall back to counting from
  // yesterday when today has no session yet.
  let currentDays = 0;
  let cursorMs = Date.now();
  if (!days.has(toDateIso(cursorMs))) cursorMs -= DAY_MS;
  while (days.has(toDateIso(cursorMs))) {
    currentDays++;
    cursorMs -= DAY_MS;
  }

  // Best streak: longest run of consecutive calendar days anywhere in history.
  let bestDays = 0;
  let run = 0;
  let prevMs: number | null = null;
  for (const iso of sorted) {
    const ms = Date.parse(iso);
    run = prevMs !== null && ms - prevMs === DAY_MS ? run + 1 : 1;
    bestDays = Math.max(bestDays, run);
    prevMs = ms;
  }

  return { currentDays, bestDays: Math.max(bestDays, currentDays) };
}

/** Small, explicitly bounded v1 set — thresholds chosen to be reachable but not trivial.
 * Recomputed live each time, not a persisted earn-log. */
export async function computeBadges(): Promise<PublicBadge[]> {
  const [streak, prs, sessions] = await Promise.all([
    computeStreak(),
    getPersonalRecords(1000),
    getWorkoutRepo().listAllSessions(),
  ]);

  const badges: PublicBadge[] = [];
  for (const tier of [7, 30, 100]) {
    if (streak.bestDays >= tier) badges.push({ id: `streak-${tier}`, label: `${tier}-day streak` });
  }
  for (const tier of [5, 20]) {
    if (prs.length >= tier) badges.push({ id: `prs-${tier}`, label: `${tier}+ personal records` });
  }

  const sessionsByMonth = new Map<string, number>();
  for (const s of sessions) {
    const key = toDateIso(s.startedAtMs).slice(0, 7);
    sessionsByMonth.set(key, (sessionsByMonth.get(key) ?? 0) + 1);
  }
  if ([...sessionsByMonth.values()].some((n) => n >= 12)) {
    badges.push({ id: "consistent-month", label: "12+ workouts in a month" });
  }

  return badges;
}

// Progress-stat compute functions — shared by two callers: the local widgets on
// /routes/profile (rendered live, no sync lag) and syncPublicProfile()'s snapshot builder
// (embedded in publicProfileJson, rendered by ProfileView for anyone including yourself). Each
// stat is one typed shape (defined on PublicProfileData in @logit/core/api/socialApi) + one
// compute function here + one presentational component — see
// docs/architecture/profile-progress-redesign.md §2b for why this shape was chosen.
import { getWorkoutRepo, getNutritionRepo } from "$lib/data/repoProvider";
import { getPersonalRecords } from "$lib/usecases/getPersonalRecords";
import type { PublicWeightTrend, PublicStreak, PublicBadge } from "@logit/core/api/socialApi";
import { GOALS_REACHED_TIERS, SESSION_COUNT_TIERS, WEEK_STREAK_TIERS, liftMilestones } from "@logit/core/domain/milestones";
import { loadBodyweightLookup } from "$lib/features/bodyweight/bodyweight";

async function countGoalsReached(): Promise<number> {
  const [{ get }, { goalsStore, activeGoals }, { loadGoalView }] = await Promise.all([
    import("svelte/store"),
    import("$lib/features/goals/goalsStore"),
    import("$lib/features/goals/goalProgress"),
  ]);
  const goals = activeGoals(get(goalsStore));
  const cache = {};
  const views = await Promise.all(goals.map((g) => loadGoalView(g, Date.now(), cache)));
  return views.filter((v) => v.achievedAtMs != null).length;
}

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
  const { loadWeeklyStreak } = await import("$lib/features/goals/streak");
  const s = await loadWeeklyStreak();
  return { currentWeeks: s.currentWeeks, bestWeeks: s.bestWeeks, weeklyTarget: s.weeklyTarget };
}

/** Small, explicitly bounded set — thresholds chosen to be reachable but not trivial.
 * Recomputed live each time, not a persisted earn-log. Rewards weeks on plan, real strength
 * milestones and goals reached, never training every single day. */
export async function computeBadges(): Promise<PublicBadge[]> {
  const [streak, prs, sessions, bodyweightAt, goalsReached] = await Promise.all([
    computeStreak(),
    getPersonalRecords(1000),
    getWorkoutRepo().listAllSessions(),
    loadBodyweightLookup().catch(() => null),
    countGoalsReached().catch(() => 0),
  ]);

  const badges: PublicBadge[] = [];
  for (const tier of WEEK_STREAK_TIERS) {
    if ((streak.bestWeeks ?? 0) >= tier) badges.push({ id: `week-streak-${tier}`, label: `${tier}-week streak` });
  }
  const finished = sessions.filter((s) => s.endedAtMs != null).length;
  for (const tier of SESSION_COUNT_TIERS) {
    if (finished >= tier) badges.push({ id: `sessions-${tier}`, label: `${tier} workouts` });
  }
  for (const tier of GOALS_REACHED_TIERS) {
    if (goalsReached >= tier) badges.push({ id: `goals-${tier}`, label: tier === 1 ? "First goal reached" : `${tier} goals reached` });
  }
  badges.push(
    ...liftMilestones(
      prs.map((r) => ({ exerciseName: r.exerciseName, weight: r.weight, bodyweightKg: bodyweightAt?.(r.achievedAtMs) ?? null })),
      bodyweightAt?.(Date.now()) ?? null,
    ),
  );
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

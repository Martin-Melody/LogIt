import type { RemoteProfile } from "@logit/core/api/syncApi";
import {
  countGoalSeries,
  createGoal,
  liftGoalSeries,
  repsGoalSeries,
  type Goal,
  type GoalSeries,
  type GoalTarget,
} from "@logit/core/domain/goals";
import { bodyweightGoalView, goalTitle, goalViewFromSeries, type GoalView } from "@logit/core/domain/goalView";
import { createId } from "@logit/core/domain/ids";
import { isoToUtcMs } from "@logit/core/domain/dateIso";
import { localDateIso } from "@logit/core/domain/nutrition";
import type { WeightUnit } from "@logit/core/domain/units";
import type { WorkoutSession } from "@logit/core/domain/workout";
import {
  computeWeeklyStreak,
  DEFAULT_WEEKLY_TARGET,
  withWeeklyTarget,
  type StreakPause,
  type TargetChange,
  type WeeklyStreak,
} from "@logit/core/domain/weeklyStreak";
import { getExerciseHistory } from "@logit/core/usecases/progression/getExerciseHistory";
import { getOwnNutritionDeps, getWebDeps } from "$lib/deps";
import { sessionVolumeKg } from "$lib/features/sessionVolume";
import { updateOwnProfile } from "$lib/features/ownProfile";

/**
 * Goals and the weekly streak target on the dashboard. They live on the synced profile as
 * `goalsJson`: { [goalId]: Goal, streak: StreakSettings }, merged key by key on each entry's
 * `updatedAtMs` by the server and the phone, so a change here only ever touches its own key.
 */

export type StreakSettings = {
  weeklyTarget: number;
  targetHistory?: TargetChange[];
  pauses: StreakPause[];
  updatedAtMs: number;
};

type Blob = Record<string, unknown>;

function parseBlob(profile: RemoteProfile | null): Blob {
  if (!profile?.goalsJson) return {};
  try {
    const b = JSON.parse(profile.goalsJson);
    return b && typeof b === "object" ? (b as Blob) : {};
  } catch {
    return {};
  }
}

export function goalsFromProfile(profile: RemoteProfile | null): { goals: Goal[]; streak: StreakSettings } {
  const blob = parseBlob(profile);
  const goals = Object.entries(blob)
    .filter(([k, v]) => k !== "streak" && v && typeof v === "object" && "target" in (v as object))
    .map(([k, v]) => ({ ...(v as Goal), id: k }))
    .filter((g) => !g.deletedAtMs)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
  const s = (blob.streak ?? {}) as Partial<StreakSettings>;
  return {
    goals,
    streak: {
      weeklyTarget: s.weeklyTarget ?? DEFAULT_WEEKLY_TARGET,
      targetHistory: s.targetHistory,
      pauses: s.pauses ?? [],
      updatedAtMs: s.updatedAtMs ?? 0,
    },
  };
}

function trainedDayIso(s: WorkoutSession): string {
  return localDateIso(new Date(s.startedAtMs));
}

export function streakFor(sessions: WorkoutSession[], streak: StreakSettings): WeeklyStreak {
  return computeWeeklyStreak({
    trainedDaysIso: sessions.filter((s) => s.endedAtMs != null).map(trainedDayIso),
    weeklyTarget: streak.weeklyTarget,
    targetHistory: streak.targetHistory,
    pauses: streak.pauses,
    todayIso: localDateIso(),
  });
}

/** One goal's series from the synced workouts (same as the phone's, minus bodyweight load). */
export async function goalSeries(goal: Pick<Goal, "target">, sessions: WorkoutSession[], clientId?: string): Promise<GoalSeries> {
  const t = goal.target;
  if (t.type === "count") {
    return countGoalSeries(
      sessions.filter((s) => s.endedAtMs != null).map((s) => ({ tMs: s.endedAtMs ?? s.startedAtMs, volumeKg: sessionVolumeKg(s) })),
      { metric: t.metric, target: t.target, startMs: isoToUtcMs(t.startIso) },
    );
  }
  const { history } = await getExerciseHistory({ id: t.exerciseId, name: t.exerciseName }, getWebDeps(clientId), { includeExcluded: true });
  return t.type === "lift" ? liftGoalSeries(history, t) : repsGoalSeries(history, t);
}

export async function goalViews(goals: Goal[], sessions: WorkoutSession[], unit: WeightUnit, clientId?: string): Promise<GoalView[]> {
  const nowMs = Date.now();
  return Promise.all(goals.map(async (g) => goalViewFromSeries(g, await goalSeries(g, sessions, clientId), nowMs, goalTitle(g, unit))));
}

/** The nutrition goal's target weight as a goal view (own data only). */
export async function ownBodyweightView(): Promise<GoalView | null> {
  const repo = getOwnNutritionDeps().nutritionRepo;
  const [goal, entries] = await Promise.all([repo.getGoal().catch(() => null), repo.listWeightEntries().catch(() => [])]);
  return bodyweightGoalView(goal, entries);
}

/** Write one key of the goals blob (a goal, a tombstone or the streak settings). */
async function writeKey(key: string, value: Goal | StreakSettings): Promise<RemoteProfile> {
  return updateOwnProfile((p) => ({ goalsJson: JSON.stringify({ ...parseBlob(p), [key]: value }) }), { bump: false });
}

export async function addGoal(target: GoalTarget, deadlineIso: string | null): Promise<Goal> {
  const goal = createGoal(target, { id: createId("goal"), nowMs: Date.now(), deadlineIso });
  await writeKey(goal.id, goal);
  return goal;
}

export async function updateGoal(goal: Goal, patch: { target: GoalTarget; deadlineIso: string | null }): Promise<void> {
  await writeKey(goal.id, { ...goal, ...patch, updatedAtMs: Date.now() });
}

export async function deleteGoal(goal: Goal): Promise<void> {
  const now = Date.now();
  await writeKey(goal.id, { ...goal, deletedAtMs: now, updatedAtMs: now });
}

export async function setWeeklyTarget(n: number): Promise<StreakSettings> {
  let saved: StreakSettings | null = null;
  await updateOwnProfile((p) => {
    const blob = parseBlob(p);
    const { streak } = goalsFromProfile(p);
    saved = { ...streak, ...withWeeklyTarget(streak, n, localDateIso()), updatedAtMs: Date.now() };
    return { goalsJson: JSON.stringify({ ...blob, streak: saved }) };
  }, { bump: false });
  return saved!;
}


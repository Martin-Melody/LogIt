import type { WorkoutSession, StrengthBlockData } from "@logit/core/domain/workout";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import { plannedBlockName } from "@logit/core/domain/WorkoutSplit";
import { addDays, isoToUtcMs, weekStartIso } from "@logit/core/domain/dateIso";
import { localDateIso } from "@logit/core/domain/nutrition";
import { computeWeeklyStreak, DEFAULT_WEEKLY_TARGET, type WeeklyStreak, type StreakPause, type TargetChange } from "@logit/core/domain/weeklyStreak";
import { splitTimeline, splitDayName, type SplitProgress } from "@logit/core/domain/splitSchedule";
import { historyPRs, sessionTitle } from "@logit/core/domain/sessionHistory";
import {
  countGoalSeries,
  goalTargetValue,
  liftGoalSeries,
  projectGoal,
  repsGoalSeries,
  type Goal,
} from "@logit/core/domain/goals";
import { smoothWeightSeries, type WeightTrend } from "@logit/core/nutrition/trend";
import { weekProgress, isSatisfied, dueOn, type Habit, type HabitEntry } from "@logit/core/domain/habit";
import { getExerciseHistory } from "@logit/core/usecases/progression/getExerciseHistory";
import { syncApi, type RemoteProfile } from "@logit/core/api/syncApi";
import { getOwnNutritionDeps, getWebDeps, getWebNutritionDeps, getWebSplitRepo } from "$lib/deps";
import { sessionVolumeKg } from "$lib/features/sessionVolume";
import { goalSeries } from "$lib/features/habitsGoals/goalsData";
import { goalViewFromSeries } from "@logit/core/domain/goalView";

/**
 * Everything the Overview's widgets show, loaded once per visit from the synced data:
 * sessions, the profile (active split, its rotation, goals and streak settings), habits and
 * weight. Each part fails on its own, so one missing piece doesn't blank the page.
 */

export type WeekDayView = {
  dateIso: string;
  label: string;
  isToday: boolean;
  /** done: trained that day. planned: a workout still to come. rest: a planned rest day. */
  status: "done" | "planned" | "rest" | "missed" | "empty";
  title: string | null;
  minutes: number | null;
};

export type GoalSummary = {
  id: string;
  title: string;
  /** 0–1 from where it started to the target. */
  progress: number;
  currentText: string;
  note: string;
};

export type RecordView = { exerciseName: string; weight: number; reps: number; atMs: number };
export type HabitWeekView = { id: string; name: string; icon?: string; days: (boolean | null)[]; weekly: { done: number; target: number } | null };

export type OverviewData = {
  sessions: WorkoutSession[];
  /** What each session is called (the Sessions page uses the same names). */
  titles: Map<string, string>;
  streak: WeeklyStreak;
  thisWeekVolumeKg: number;
  lastWeekVolumeKg: number;
  weeklyVolume: { weekIso: string; kg: number }[];
  weight: WeightTrend | null;
  splitName: string | null;
  week: WeekDayView[];
  nextUp: { title: string; dateIso: string; exercises: string[] } | null;
  goals: GoalSummary[];
  records: RecordView[];
  habits: HabitWeekView[];
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function finished(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.filter((s) => s.endedAtMs != null).sort((a, b) => b.startedAtMs - a.startedAtMs);
}

function dayOf(s: WorkoutSession): string {
  return localDateIso(new Date(s.startedAtMs));
}

export { sessionVolumeKg } from "$lib/features/sessionVolume";

type GoalsBlob = Record<string, unknown> & {
  streak?: { weeklyTarget?: number; targetHistory?: TargetChange[]; pauses?: StreakPause[] };
};

function parseGoals(profile: RemoteProfile | null): { goals: Goal[]; streak: GoalsBlob["streak"] } {
  if (!profile?.goalsJson) return { goals: [], streak: undefined };
  try {
    const blob = JSON.parse(profile.goalsJson) as GoalsBlob;
    const goals = Object.entries(blob)
      .filter(([k, v]) => k !== "streak" && v && typeof v === "object" && "target" in (v as object))
      .map(([, v]) => v as Goal)
      .filter((g) => !g.deletedAtMs);
    return { goals, streak: blob.streak };
  } catch {
    return { goals: [], streak: undefined };
  }
}

function progressFor(split: WorkoutSplit, profile: RemoteProfile | null, todayIso: string): SplitProgress {
  try {
    const all = profile?.splitRotationJson ? JSON.parse(profile.splitRotationJson) : {};
    const state = all?.[split.id] as { lastDayId?: string; recordedAtMs?: number; doneOnDay?: string[] } | undefined;
    if (!state?.lastDayId || typeof state.recordedAtMs !== "number") return { last: null };
    // Same 7-day reset the app applies.
    if (Date.now() - state.recordedAtMs > 7 * 86_400_000) return { last: null };
    const dateIso = localDateIso(new Date(state.recordedAtMs));
    return { last: { dayId: state.lastDayId, dateIso }, doneTodayIds: dateIso === todayIso ? (state.doneOnDay ?? []) : [] };
  } catch {
    return { last: null };
  }
}

function buildWeek(sessions: WorkoutSession[], split: WorkoutSplit | null, profile: RemoteProfile | null, todayIso: string) {
  const monday = weekStartIso(todayIso);
  const byDay = new Map<string, WorkoutSession[]>();
  for (const s of sessions) {
    const d = dayOf(s);
    if (d >= monday) (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(s);
  }
  const timeline = split ? splitTimeline(split, progressFor(split, profile, todayIso), todayIso) : [];
  const planned = new Map<string, (typeof timeline)[number]>();
  for (const t of timeline) if (!planned.has(t.dateIso)) planned.set(t.dateIso, t);

  const week: WeekDayView[] = WEEKDAYS.map((label, i) => {
    const dateIso = addDays(monday, i);
    const done = byDay.get(dateIso) ?? [];
    const isToday = dateIso === todayIso;
    if (done.length > 0) {
      const minutes = Math.round(done.reduce((m, s) => m + ((s.endedAtMs ?? s.startedAtMs) - s.startedAtMs), 0) / 60000);
      return { dateIso, label, isToday, status: "done", title: done.map((s) => sessionTitle(s)).join(" + "), minutes };
    }
    if (dateIso < todayIso) return { dateIso, label, isToday, status: "empty", title: null, minutes: null };
    const p = planned.get(dateIso);
    if (p?.day && !p.day.rest && split) {
      return { dateIso, label, isToday, status: "planned", title: splitDayName(split, p.day), minutes: null };
    }
    if (p) return { dateIso, label, isToday, status: "rest", title: "Rest", minutes: null };
    return { dateIso, label, isToday, status: "empty", title: null, minutes: null };
  });

  const nextEntry = timeline.find((t) => t.day && !t.day.rest && !t.done);
  const nextUp =
    nextEntry?.day && split
      ? {
          title: splitDayName(split, nextEntry.day),
          dateIso: nextEntry.dateIso,
          exercises: [...nextEntry.day.blocks].sort((a, b) => a.orderIndex - b.orderIndex).map(plannedBlockName),
        }
      : null;
  return { week, nextUp };
}

function weeklyVolume(sessions: WorkoutSession[], todayIso: string, weeks = 12) {
  const thisMonday = weekStartIso(todayIso);
  const out = Array.from({ length: weeks }, (_, i) => ({ weekIso: addDays(thisMonday, -7 * (weeks - 1 - i)), kg: 0 }));
  const index = new Map(out.map((w, i) => [w.weekIso, i]));
  for (const s of sessions) {
    const i = index.get(weekStartIso(dayOf(s)));
    if (i != null) out[i]!.kg += sessionVolumeKg(s);
  }
  return out;
}

async function goalSummaries(goals: Goal[], sessions: WorkoutSession[], clientId: string | undefined): Promise<GoalSummary[]> {
  const nowMs = Date.now();
  const out: GoalSummary[] = [];
  for (const goal of goals.slice(0, 4)) {
    const t = goal.target;
    const view = goalViewFromSeries(goal, await goalSeries(goal, sessions, clientId), nowMs);
    const projection = view.projection;
    const achieved = view.achievedAtMs != null;
    const current = t.type === "count" ? (view.points.at(-1)?.value ?? 0) : (projection.current ?? view.points.at(-1)?.value ?? null);
    const unit = view.unit === "kg" ? " kg" : view.unit === "reps" ? " reps" : "";
    const title =
      t.type === "lift" ? `${t.exerciseName} ${t.weightKg} kg${t.reps > 1 ? ` × ${t.reps}` : ""}`
      : t.type === "reps" ? `${t.exerciseName} × ${t.reps}`
      : t.metric === "sessions" ? `${t.target} workouts` : `${Math.round(t.target / 1000)} t lifted`;
    const note = achieved
      ? "Done"
      : projection.status === "ready" ? "Ready: your estimate is there, now do the set"
      : projection.status === "on_track" && projection.eta
        ? `On pace for ${new Date(projection.eta.likelyMs).toLocaleDateString(undefined, { month: "long", year: new Date(projection.eta.likelyMs).getFullYear() === new Date().getFullYear() ? undefined : "numeric" })}`
      : projection.status === "stalled" ? "Stalled lately"
      : "Not enough data yet";
    out.push({
      id: goal.id,
      title,
      progress: view.progress,
      currentText: current == null ? "—" : `${Math.round(current * 10) / 10}${unit}`,
      note,
    });
  }
  return out;
}

function parseRows<T>(rows: { dataJson: string | null; deletedAtMs?: number | null }[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    if (r.deletedAtMs || !r.dataJson) continue;
    try { out.push(JSON.parse(r.dataJson) as T); } catch {}
  }
  return out;
}

async function habitsWeek(clientId: string | undefined, todayIso: string): Promise<HabitWeekView[]> {
  const [{ habits }, { entries }] = await Promise.all([syncApi.pullHabits(0, clientId), syncApi.pullHabitEntries(0, clientId)]);
  const hs = parseRows<Habit>(habits).filter((h) => !h.archived);
  const es = parseRows<HabitEntry>(entries);
  const monday = weekStartIso(todayIso);
  return hs.slice(0, 6).map((h) => ({
    id: h.id,
    name: h.name,
    icon: h.icon,
    weekly: weekProgress(h, es, todayIso),
    days: WEEKDAYS.map((_, i) => {
      const d = addDays(monday, i);
      if (d > todayIso || !dueOn(h, d)) return null;
      return isSatisfied(h, es.find((e) => e.habitId === h.id && e.dateIso === d));
    }),
  }));
}

export async function loadOverview(clientId?: string): Promise<OverviewData> {
  const todayIso = localDateIso(new Date());
  const deps = getWebDeps(clientId);
  const [allSessions, profile, splits] = await Promise.all([
    deps.workoutRepo.listAllSessions(),
    syncApi.pullProfile(clientId).then((r) => r.profile).catch(() => null),
    getWebSplitRepo(clientId).getListSplits().catch(() => [] as WorkoutSplit[]),
  ]);
  const sessions = finished(allSessions);
  const { goals, streak: streakSettings } = parseGoals(profile);

  const streak = computeWeeklyStreak({
    trainedDaysIso: sessions.map(dayOf),
    weeklyTarget: streakSettings?.weeklyTarget ?? DEFAULT_WEEKLY_TARGET,
    targetHistory: streakSettings?.targetHistory,
    pauses: streakSettings?.pauses,
    todayIso,
  });

  const vol = weeklyVolume(sessions, todayIso);
  const split = splits.find((s) => s.id === profile?.activeSplitId) ?? null;
  const { week, nextUp } = buildWeek(sessions, split, profile, todayIso);

  const prs = historyPRs(sessions);
  const records: RecordView[] = [];
  for (const s of sessions) {
    for (const pr of prs.get(s.id) ?? []) records.push({ exerciseName: pr.exerciseName, weight: pr.weight, reps: pr.reps, atMs: s.startedAtMs });
    if (records.length >= 6) break;
  }

  const nutrition = clientId ? getWebNutritionDeps(clientId) : getOwnNutritionDeps();
  const [weight, goalViews, habits] = await Promise.all([
    nutrition.nutritionRepo.listWeightEntries().then((e) => (e.length ? smoothWeightSeries(e) : null)).catch(() => null),
    goalSummaries(goals, sessions, clientId).catch(() => [] as GoalSummary[]),
    habitsWeek(clientId, todayIso).catch(() => [] as HabitWeekView[]),
  ]);

  return {
    sessions,
    titles: new Map(sessions.slice(0, 20).map((s) => [s.id, sessionTitle(s)])),
    streak,
    thisWeekVolumeKg: vol.at(-1)?.kg ?? 0,
    lastWeekVolumeKg: vol.at(-2)?.kg ?? 0,
    weeklyVolume: vol,
    weight,
    splitName: split?.name ?? null,
    week,
    nextUp,
    goals: goalViews,
    records: records.slice(0, 6),
    habits,
  };
}

import type { WorkoutRepo } from "../../data/workoutRepo";
import type { WorkoutSession } from "../../domain/workout";
import type { GoalView } from "../../domain/goalView";
import { computeWeeklyStreak, weekResults, type StreakPause, type TargetChange } from "../../domain/weeklyStreak";
import { localDateIso } from "../../domain/nutrition";
import { weekBucket } from "../../domain/time";
import {
  QUESTIONS,
  balanceAnswer,
  eatingAnswer,
  eatingSummary,
  foodVsLiftsAnswer,
  goalsAnswer,
  liftsAnswer,
  lockedAnswer,
  muscleBalance,
  questionText,
  rangeStartMs,
  showingUpAnswer,
  type EatingSummary,
  type InsightAnswer,
  type InsightArea,
  type InsightRange,
  type MuscleBalanceRow,
  type QuestionId,
} from "../../domain/insights";
import { getAllExerciseProgressStories } from "../progression/getAllExerciseProgressStories";
import { getMuscleGroupInsights, type MuscleGroupInsight } from "../progression/getMuscleGroupInsights";
import { getNutritionTrainingCorrelation, type NutritionTrainingCorrelationResult } from "../nutritionTrainingCorrelation";
import { getNutritionTargets } from "../nutrition/getNutritionTargets";
import type { ProgressionDeps } from "../progression/deps";
import type { NutritionDeps } from "../nutrition/deps";

/**
 * Loads what each Insights question needs and builds the answers (domain/insights.ts).
 * Both apps call this with their own repos: the phone with its local data, the dashboard
 * with synced data (its own, or a client's when a coach is looking).
 */
export type InsightDeps = {
  progression: ProgressionDeps;
  /** null when the nutrition diary and weight can't be read (a coach the client doesn't share them with). */
  nutrition: Pick<NutritionDeps, "nutritionRepo" | "nutritionAlgorithmRegistry" | "assignedNutritionPlanRepo"> | null;
  streak: { weeklyTarget: number; targetHistory?: TargetChange[]; pauses?: StreakPause[] };
  /** The goal views (each app builds them its own way). */
  loadGoalViews: () => Promise<GoalView[]>;
  /** Session volume with bodyweight work counted, for the food-vs-lifts comparison. */
  sessionVolumeKg?: (s: WorkoutSession) => number;
  /** Areas the viewer can't see. Questions needing them come back locked. */
  hidden?: InsightArea[];
  /** The data owner's name, for the locked text ("Dara doesn't share this with you"). */
  ownerName?: string;
};

export type InsightOpts = { range: InsightRange; nowMs?: number };

/** The workout repo with listAllSessions cut to sessions started on or after `startMs`. */
export function sessionsSince(repo: WorkoutRepo, startMs: number): WorkoutRepo {
  return new Proxy(repo, {
    get(target, key, receiver) {
      if (key === "listAllSessions") {
        return async () => (await target.listAllSessions()).filter((s) => s.startedAtMs >= startMs);
      }
      const v = Reflect.get(target, key, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

function listWords(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const AREA_WORDS: Record<InsightArea, string> = { training: "workouts", nutrition: "nutrition diary", weight: "body weight", habits: "habits" };

function lockedFor(id: QuestionId, deps: InsightDeps): InsightAnswer | null {
  const hidden = deps.hidden ?? [];
  const missing = QUESTIONS.find((q) => q.id === id)!.needs.filter((a) => hidden.includes(a));
  if (missing.length === 0) return null;
  const who = deps.ownerName ?? "They";
  const words = missing.map((a) => AREA_WORDS[a]);
  const verb = deps.ownerName ? "doesn't" : "don't";
  return lockedAnswer(id, `Needs the ${listWords(words)}. ${who} ${verb} share ${words.length > 1 ? "these" : "this"} with you.`);
}

export async function loadMuscleBalance(
  deps: InsightDeps,
  opts: InsightOpts,
): Promise<{ rows: MuscleBalanceRow[]; insights: MuscleGroupInsight[]; untaggedSetsShare: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const result = await getMuscleGroupInsights(deps.progression);
  const rows = muscleBalance(result.insights, {
    startBucket: weekBucket(rangeStartMs(opts.range, nowMs)),
    currentBucket: weekBucket(nowMs),
  });
  return { rows, insights: result.insights, untaggedSetsShare: result.untaggedSetsShare };
}

export async function loadEatingSummary(deps: InsightDeps, opts: InsightOpts): Promise<EatingSummary | null> {
  if (!deps.nutrition) return null;
  const nowMs = opts.nowMs ?? Date.now();
  const startIso = localDateIso(new Date(rangeStartMs(opts.range, nowMs)));
  const endIso = localDateIso(new Date(nowMs));
  const [state, days] = await Promise.all([
    getNutritionTargets(deps.nutrition, { now: nowMs }),
    deps.nutrition.nutritionRepo.listDaysInRange(startIso, endIso),
  ]);
  return eatingSummary({
    days,
    trend: state.trend.points.length ? state.trend : null,
    targetKcal: state.targets?.kcal ?? null,
    goalType: state.goal?.goalType ?? null,
    targetRateKg: state.goal?.targetRateKgPerWeek ?? null,
    startIso,
    endIso,
  });
}

export async function loadFoodVsLifts(deps: InsightDeps, opts: InsightOpts): Promise<NutritionTrainingCorrelationResult | null> {
  if (!deps.nutrition) return null;
  const nowMs = opts.nowMs ?? Date.now();
  return getNutritionTrainingCorrelation({
    workoutRepo: sessionsSince(deps.progression.workoutRepo, rangeStartMs(opts.range, nowMs)),
    nutritionRepo: deps.nutrition.nutritionRepo,
    sessionVolumeKg: deps.sessionVolumeKg,
  });
}

async function build(id: QuestionId, deps: InsightDeps, opts: InsightOpts): Promise<InsightAnswer> {
  const locked = lockedFor(id, deps);
  if (locked) return locked;
  const nowMs = opts.nowMs ?? Date.now();
  const startMs = rangeStartMs(opts.range, nowMs);
  switch (id) {
    case "lifts":
      return liftsAnswer(await getAllExerciseProgressStories(deps.progression), { startMs });
    case "balance": {
      const { rows, insights } = await loadMuscleBalance(deps, opts);
      return balanceAnswer(rows, { anyTagged: insights.length > 0 });
    }
    case "showing-up": {
      const sessions = (await deps.progression.workoutRepo.listAllSessions()).filter((s) => s.endedAtMs != null);
      const input = {
        trainedDaysIso: sessions.map((s) => localDateIso(new Date(s.startedAtMs))),
        weeklyTarget: deps.streak.weeklyTarget,
        targetHistory: deps.streak.targetHistory,
        pauses: deps.streak.pauses,
        todayIso: localDateIso(new Date(nowMs)),
      };
      const weeks = weekResults({ ...input, fromIso: localDateIso(new Date(startMs)) });
      return showingUpAnswer(weeks, computeWeeklyStreak(input));
    }
    case "eating":
      return eatingAnswer((await loadEatingSummary(deps, opts))!);
    case "food-vs-lifts":
      return foodVsLiftsAnswer((await loadFoodVsLifts(deps, opts))!);
    case "goals":
      return goalsAnswer(await deps.loadGoalViews(), nowMs);
  }
}

/** One question's answer. A failure becomes an "empty" answer instead of throwing. */
export async function getInsightAnswer(id: QuestionId, deps: InsightDeps, opts: InsightOpts): Promise<InsightAnswer> {
  try {
    return await build(id, deps, opts);
  } catch {
    return { id, question: questionText(id), state: "empty", answer: "Couldn't work this out", detail: "Something went wrong loading the data. Try again in a bit." };
  }
}

/** Every question's answer, in the usual order. */
export async function getInsightAnswers(deps: InsightDeps, opts: InsightOpts): Promise<InsightAnswer[]> {
  return Promise.all(QUESTIONS.map((q) => getInsightAnswer(q.id, deps, opts)));
}

import type { MuscleGroup } from "../../domain/exercise";
import type { WorkoutSplit } from "../../domain/WorkoutSplit";
import {
  DEFAULT_SET_TARGETS,
  MUSCLE_LABELS,
  plannedWeeklySets,
  scoreSplit,
  setTargetFor,
  type MuscleTags,
  type SetTarget,
  type SplitScoreRow,
} from "../../domain/weeklySets";
import { getMuscleGroupInsights } from "./getMuscleGroupInsights";
import { getMuscleSetTargets } from "./exerciseProgressionSettings";
import type { ProgressionDeps } from "./deps";

export type WeeklySetsRow = {
  muscle: MuscleGroup;
  label: string;
  /** Hard sets done this week (secondary muscles at 40%). */
  done: number;
  target: SetTarget;
  /** The built-in range, and the learned one when LogIt has one (for the editor). */
  defaultTarget: SetTarget;
  learnedTarget?: SetTarget;
  /** One line on where the learned range came from. */
  note?: string;
};

export type WeeklySetsView = {
  rows: WeeklySetsRow[];
  /** The active split scored against the targets, when there is one. */
  split: { name: string; workoutsPerWeek: number; rows: SplitScoreRow[] } | null;
};

/**
 * This week's hard sets per muscle against each muscle's target, and, given the active
 * split, what that split plans per week against the same targets.
 */
export async function getWeeklySets(
  deps: Pick<
    ProgressionDeps,
    "workoutRepo" | "exerciseRepo" | "progressionRepo" | "analyticsRegistry" | "muscleGroupInsightAlgorithmRegistry" | "loadBodyweight"
  >,
  opts: { split?: WorkoutSplit | null; workoutsPerWeek: number },
): Promise<WeeklySetsView> {
  const [{ insights }, custom] = await Promise.all([getMuscleGroupInsights(deps), getMuscleSetTargets(deps)]);
  const byMuscle = new Map(insights.map((i) => [i.muscleGroup, i]));
  const targets = {} as Record<MuscleGroup, SetTarget>;

  const rows: WeeklySetsRow[] = (Object.keys(DEFAULT_SET_TARGETS) as MuscleGroup[]).map((muscle) => {
    const insight = byMuscle.get(muscle);
    const fromInsight = setTargetFor(muscle, insight ? { volumeInsight: insight.volumeInsight, confidence: insight.reasoning.confidence } : undefined);
    const effective = custom[muscle] ? setTargetFor(muscle, undefined, custom[muscle]) : fromInsight;
    targets[muscle] = effective;
    const v = insight?.volumeInsight;
    const note =
      fromInsight.learned && v
        ? `Your ${MUSCLE_LABELS[muscle].toLowerCase()} sessions improved more often in weeks ${v.direction === "higher" ? "with" : "under"} about ${Math.round(v.thresholdSets)} sets (${insight!.weeksWithData} weeks of data).`
        : undefined;
    return {
      muscle,
      label: MUSCLE_LABELS[muscle],
      done: insight?.currentWeekSets ?? 0,
      target: effective,
      defaultTarget: { ...DEFAULT_SET_TARGETS[muscle] },
      ...(fromInsight.learned ? { learnedTarget: fromInsight } : {}),
      note,
    };
  });

  let split: WeeklySetsView["split"] = null;
  if (opts.split && !opts.split.archived) {
    // Resolve each planned exercise's muscle tags once.
    const tags = new Map<string, MuscleTags | null>();
    for (const day of opts.split.days) {
      for (const b of day.blocks) {
        if (b.type !== "strength") continue;
        const k = b.exerciseId ?? b.exerciseName.toLowerCase();
        if (tags.has(k)) continue;
        const ex = (b.exerciseId ? await deps.exerciseRepo.getById(b.exerciseId) : null) ?? (await deps.exerciseRepo.getByName(b.exerciseName));
        tags.set(k, ex ? { primary: ex.primaryMuscles ?? [], secondary: ex.secondaryMuscles ?? [] } : null);
      }
    }
    const planned = plannedWeeklySets(opts.split, (b) => tags.get(b.exerciseId ?? b.exerciseName.toLowerCase()) ?? null, opts.workoutsPerWeek);
    split = { name: opts.split.name, workoutsPerWeek: opts.workoutsPerWeek, rows: scoreSplit(planned, targets) };
  }

  return { rows, split };
}

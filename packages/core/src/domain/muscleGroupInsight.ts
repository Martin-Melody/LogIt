import type { AlgorithmPreferencesField, ProgressStatus } from "./progression";
import type { MuscleGroup } from "./exercise";
import type { Reasoning } from "./reasoning";

export { type AlgorithmPreferencesField };

/**
 * The pluggable family behind §5's muscle-group volume/frequency insight —
 * "option B" in adaptive-progression-engine.md §5, mirroring
 * `mobility-progression`'s contract + registry + settings-picker shape
 * exactly, per Martin's decision (2026-09-12).
 *
 * Unlike `ProgressionAlgorithm`/`MobilityProgressionAlgorithm`, the input
 * here isn't one exercise's own history — a muscle group's volume is
 * inherently cross-exercise. `getMuscleGroupInsights.ts` owns fetching every
 * session, resolving muscle tags, and building the weekly volume series +
 * per-exercise trend statuses (the generic plumbing, same role
 * `getSuggestion.ts`/`getMobilitySuggestion.ts` play for their families) —
 * this contract only covers the part that's actually opinionated: given that
 * resolved series, what (if anything) does this muscle group's volume
 * pattern say, and how confident is that.
 */
export type MuscleGroupInsightWeek = {
  /** Opaque week bucket index (domain/time.ts's weekBucket) — comparable and
   * orderable, but not itself a timestamp. Match it against a series point's
   * `date` via `weekBucket(date)`, not by converting this back to ms. */
  weekBucket: number;
  weightedSets: number;
  sessionCount: number;
};

export type MuscleGroupInsightContributingExercise = {
  exerciseId?: string;
  exerciseName: string;
  status: ProgressStatus;
  /** oldest → newest primary-metric series for this exercise — what a
   * volume/frequency correlation is actually correlated against. */
  seriesPoints: { date: number; value: number }[];
};

export type MuscleGroupInsightInput = {
  muscleGroup: MuscleGroup;
  /** oldest → newest. */
  weeks: MuscleGroupInsightWeek[];
  /** Only primary-tagged exercises — see §5's scoping rationale in
   * getMuscleGroupInsights.ts for why secondary-tagged ones aren't included
   * here even though their volume is folded into `weeks`. */
  contributingExercises: MuscleGroupInsightContributingExercise[];
  /** Algorithm-owned, opaque — threaded back via nextState. */
  state: unknown;
  userPreferences: unknown;
  now: number;
};

export type MuscleGroupVolumeInsight = {
  direction: "higher" | "lower"; // which side of thresholdSets correlates with more improved sessions
  thresholdSets: number;
  improveRateAbove: number; // 0-1
  improveRateBelow: number; // 0-1
};

export type MuscleGroupInsightOutput = {
  volumeInsight?: MuscleGroupVolumeInsight;
  nextState: unknown;
  reasoning: Reasoning;
};

export type MuscleGroupInsightAlgorithmMeta = {
  id: string;
  name: string;
  description: string;
  author?: string;
};

export type MuscleGroupInsightAlgorithm = MuscleGroupInsightAlgorithmMeta & {
  defaultState: unknown;
  defaultPreferences?: unknown;
  preferencesSchema?: AlgorithmPreferencesField[];
  // Built-in is synchronous; community algorithms run in the interpreter
  // sandbox and resolve asynchronously. Callers must await.
  analyze(input: MuscleGroupInsightInput): MuscleGroupInsightOutput | Promise<MuscleGroupInsightOutput>;
};

export type UserMuscleGroupInsightConfig = {
  algorithmId: string;
};

export interface MuscleGroupInsightAlgorithmRegistry {
  list(): Promise<MuscleGroupInsightAlgorithmMeta[]>;
  get(id: string): Promise<MuscleGroupInsightAlgorithm | null>;
}

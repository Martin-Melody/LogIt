import type { WorkoutRepo } from "../../data/workoutRepo";
import type { ProgressionRepo } from "../../data/progressionRepo";
import type { ExerciseRepo } from "../../data/exercise/exerciseRepo";
import type { AlgorithmRegistry } from "../../progression/algorithmRegistry";
import type { AnalyticsRegistry } from "../../domain/analytics";
import type { MobilityProgressionAlgorithmRegistry } from "../../domain/mobilityProgression";
import type { TrainingBlockTagRepo } from "../../data/trainingBlockTagRepo";
import type { MuscleGroupInsightAlgorithmRegistry } from "../../domain/muscleGroupInsight";
import type { BodyweightLookup } from "../../domain/bodyweight";

/** Full set of repos/registries the progression usecases can draw from.
 * Each usecase only requires the subset it needs (via Pick) — callers can
 * pass this whole bag everywhere without extra wiring. */
export type ProgressionDeps = {
  workoutRepo: WorkoutRepo;
  progressionRepo: ProgressionRepo;
  exerciseRepo: ExerciseRepo;
  algorithmRegistry: AlgorithmRegistry;
  analyticsRegistry: AnalyticsRegistry;
  mobilityAlgorithmRegistry: MobilityProgressionAlgorithmRegistry;
  trainingBlockTagRepo: TrainingBlockTagRepo;
  muscleGroupInsightAlgorithmRegistry: MuscleGroupInsightAlgorithmRegistry;
  /** The lifter's bodyweight by date, for the volume of bodyweight exercises.
   * Optional: without it those exercises are charted by reps only. */
  loadBodyweight?: () => Promise<BodyweightLookup>;
};

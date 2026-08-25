import type { WorkoutRepo } from "../../data/workoutRepo";
import type { ProgressionRepo } from "../../data/progressionRepo";
import type { ExerciseRepo } from "../../data/exercise/exerciseRepo";
import type { AlgorithmRegistry } from "../../progression/algorithmRegistry";
import type { AnalyticsRegistry } from "../../domain/analytics";

/** Full set of repos/registries the progression usecases can draw from.
 * Each usecase only requires the subset it needs (via Pick) — callers can
 * pass this whole bag everywhere without extra wiring. */
export type ProgressionDeps = {
  workoutRepo: WorkoutRepo;
  progressionRepo: ProgressionRepo;
  exerciseRepo: ExerciseRepo;
  algorithmRegistry: AlgorithmRegistry;
  analyticsRegistry: AnalyticsRegistry;
};

import type { SetEntry } from "$lib/domain/workout";
import type { PlannedTargets } from "$lib/domain/WorkoutSplit";
import type { MuscleGroup } from "$lib/domain/exercise";

export type ExerciseHistoryEntry = {
  sessionId: string;
  performedAtMs: number;
  planned?: PlannedTargets;
  sets: SetEntry[];
  // 0-based position of this exercise in its session; undefined if unknown
  sessionPosition?: number;
};

export type PrecedingExercise = {
  name: string;
  id?: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  completedSets: number;
  // 0-1: intensity-weighted effort load. 1.0 ≈ a full 3-set working block at max effort.
  // Warmups count ~0.25×, failure/AMRAP sets count ~1.5×. Falls back to set-count ratio if absent.
  effortFactor?: number;
};

export type ProgressionInput = {
  exercise: { id?: string; name: string; primaryMuscles?: MuscleGroup[]; secondaryMuscles?: MuscleGroup[]; exerciseType?: import("$lib/domain/exercise").ExerciseType };
  history: ExerciseHistoryEntry[]; // most recent first
  state: unknown; // algorithm-owned, opaque to the app
  plannedTargets?: import("$lib/domain/WorkoutSplit").PlannedTargets;
  sessionContext?: {
    precedingExercises: PrecedingExercise[];
  };
};

export type SuggestedSet = {
  reps: number | [min: number, max: number];
  weight: number;
  setType?: import("$lib/domain/workout").SetType;
  note?: string;
};

export type ProgressionOutput = {
  sets: SuggestedSet[];
  nextState: unknown;
  label?: string;
  notes?: string;
};

export type ProgressionAlgorithmMeta = {
  id: string;
  name: string;
  description: string;
  author?: string;
};

export type ProgressionAlgorithm = ProgressionAlgorithmMeta & {
  defaultState: unknown;
  suggest(input: ProgressionInput): ProgressionOutput;
};

export type ExerciseProgressionState = {
  key: string; // exerciseId if available, else exerciseName lowercased
  exerciseId?: string;
  exerciseName: string;
  algorithmId: string;
  state: unknown;
  updatedAtMs: number;
};

export type UserProgressionConfig = {
  algorithmId: string;
};

export function exerciseKey(exercise: { id?: string; name: string }): string {
  return exercise.id ?? exercise.name.toLowerCase().trim();
}

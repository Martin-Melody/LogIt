import type { SetEntry } from "$lib/domain/workout";
import type { PlannedTargets } from "$lib/domain/WorkoutSplit";

export type ExerciseHistoryEntry = {
  sessionId: string;
  performedAtMs: number;
  planned?: PlannedTargets;
  sets: SetEntry[];
};

export type ProgressionInput = {
  exercise: { id?: string; name: string };
  history: ExerciseHistoryEntry[]; // most recent first
  state: unknown; // algorithm-owned, opaque to the app
  plannedTargets?: import("$lib/domain/WorkoutSplit").PlannedTargets;
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

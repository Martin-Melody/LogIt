import type { SetEntry } from "$lib/domain/workout";
import type { PlannedTargets } from "$lib/domain/WorkoutSplit";
import type { MuscleGroup, Machine } from "$lib/domain/exercise";

export type AlgorithmPreferencesField = {
  key: string;
  label: string;
  description?: string;
  type: "number" | "boolean" | "select" | "range";
  default: unknown;
  // number / range
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // select
  options?: { value: string | number; label: string }[];
};

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
  userPreferences: unknown; // user-configured per-algorithm prefs, schema defined by the algorithm
  plannedTargets?: import("$lib/domain/WorkoutSplit").PlannedTargets;
  incrementOverride?: number;
  sessionContext?: {
    precedingExercises: PrecedingExercise[];
    timeBudgetMs?: number;
    avgExerciseDurationMs?: Record<string, number>;
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
  // "summary": render sets collapsed as e.g. "3×5-8 @ 20kg". "block": show each set as its own row.
  // Algorithms that return uniform sets should omit this or use "summary"; varied prescriptions use "block".
  displayMode?: "summary" | "block";
};

export type ProgressionAlgorithmMeta = {
  id: string;
  name: string;
  description: string;
  author?: string;
};

export type ProgressionAlgorithm = ProgressionAlgorithmMeta & {
  defaultState: unknown;
  defaultPreferences?: unknown; // used as initial values when no stored prefs exist
  preferencesSchema?: AlgorithmPreferencesField[]; // if present, app renders a settings screen for this algorithm
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

// historyNewestFirst must be sorted newest-first (matches getSuggestion.ts's ordering,
// which differs from getExerciseHistory.ts's oldest-first — don't mix the two).
export function resolveExerciseIncrement(
  exercise: { machines?: Machine[]; defaultMachineId?: string },
  historyNewestFirst: ExerciseHistoryEntry[],
): number | undefined {
  const machines = exercise.machines ?? [];
  if (machines.length === 0) return undefined;

  for (const entry of historyNewestFirst) {
    for (const set of entry.sets) {
      if (!set.machineId) continue;
      const m = machines.find((mm) => mm.id === set.machineId);
      if (m) return m.incrementKg;
    }
  }

  return machines.find((m) => m.id === exercise.defaultMachineId)?.incrementKg;
}

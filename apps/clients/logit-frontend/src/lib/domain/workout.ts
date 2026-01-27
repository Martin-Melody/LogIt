// src/lib/domain/workout.ts
import { createId } from "$lib/domain/ids";
import { nowMs } from "$lib/domain/time";

export type SetType = "normal" | "warmup" | "dropset" | "amrap" | "failure";

export type SetEntry = {
  id: string;
  setType: SetType;
  reps: number;
  weight: number;
  note?: string;
  orderIndex: number;
};

export type ExerciseEntry = {
  id: string;
  exerciseId?: string; // optional until you have an exercise library
  exerciseName: string;
  orderIndex: number;
  sets: SetEntry[];
};

export type WorkoutSession = {
  id: string;
  startedAtMs: number;
  endedAtMs?: number;
  exercises: ExerciseEntry[];
};

export type SessionSummary = {
  id: string;
  dateLabel: string;
  durationLabel: string;
  topSetLabel: string;
};

export type TopSetHighlight = {
  exerciseName: string;
  reps: number;
  weight: number;
};

export function createSession(startedAtMs: number = nowMs()): WorkoutSession {
  return {
    id: createId("sess"),
    startedAtMs,
    exercises: [],
  };
}

export function addExercise(
  session: WorkoutSession,
  exercise: { exerciseName: string; exerciseId?: string },
): WorkoutSession {
  const entry: ExerciseEntry = {
    id: createId("ex"),
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName.trim(),
    orderIndex: session.exercises.length,
    sets: [],
  };

  return {
    ...session,
    exercises: [...session.exercises, entry],
  };
}

export function removeExercise(
  session: WorkoutSession,
  exerciseEntryId: string,
): WorkoutSession {
  const filtered = session.exercises.filter((e) => e.id !== exerciseEntryId);
  // reindex to keep ordering stable
  const reindexed = filtered.map((e, i) => ({ ...e, orderIndex: i }));
  return { ...session, exercises: reindexed };
}

export function addSet(
  session: WorkoutSession,
  exerciseEntryId: string,
  defaults?: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note">>,
): WorkoutSession {
  return updateExercise(session, exerciseEntryId, (exercise) => {
    const set: SetEntry = {
      id: createId("set"),
      setType: defaults?.setType ?? "normal",
      reps: defaults?.reps ?? 0,
      weight: defaults?.weight ?? 0,
      note: defaults?.note,
      orderIndex: exercise.sets.length,
    };

    return { ...exercise, sets: [...exercise.sets, set] };
  });
}

export function updateSet(
  session: WorkoutSession,
  exerciseEntryId: string,
  setId: string,
  patch: Partial<Pick<SetEntry, "reps" | "weight" | "setType" | "note">>,
): WorkoutSession {
  return updateExercise(session, exerciseEntryId, (exercise) => {
    const sets = exercise.sets.map((s) =>
      s.id === setId ? { ...s, ...patch } : s,
    );
    return { ...exercise, sets };
  });
}

export function removeSet(
  session: WorkoutSession,
  exerciseEntryId: string,
  setId: string,
): WorkoutSession {
  return updateExercise(session, exerciseEntryId, (exercise) => {
    const filtered = exercise.sets.filter((s) => s.id !== setId);
    const reindexed = filtered.map((s, i) => ({ ...s, orderIndex: i }));
    return { ...exercise, sets: reindexed };
  });
}

export function finishSession(
  session: WorkoutSession,
  endedAtMs: number = nowMs(),
): WorkoutSession {
  return {
    ...session,
    endedAtMs,
  };
}

export function getSessionDurationMs(session: WorkoutSession): number | null {
  if (!session.endedAtMs) return null;
  return Math.max(0, session.endedAtMs - session.startedAtMs);
}

/**
 * "Top set" highlight for Home.
 * Simple MVP definition:
 * - choose the set with the highest weight
 * - tie-breaker: higher reps
 */
export function getTopSetHighlight(
  session: WorkoutSession,
): TopSetHighlight | null {
  let best: { exerciseName: string; set: SetEntry } | null = null;

  for (const ex of session.exercises) {
    for (const set of ex.sets) {
      if (!best) {
        best = { exerciseName: ex.exerciseName, set };
        continue;
      }
      if (set.weight > best.set.weight) {
        best = { exerciseName: ex.exerciseName, set };
        continue;
      }
      if (set.weight === best.set.weight && set.reps > best.set.reps) {
        best = { exerciseName: ex.exerciseName, set };
      }
    }
  }

  if (!best) return null;

  return {
    exerciseName: best.exerciseName,
    reps: best.set.reps,
    weight: best.set.weight,
  };
}

// ---------- internal helper ----------
function updateExercise(
  session: WorkoutSession,
  exerciseEntryId: string,
  updater: (exercise: ExerciseEntry) => ExerciseEntry,
): WorkoutSession {
  const idx = session.exercises.findIndex((e) => e.id === exerciseEntryId);
  if (idx === -1) return session;

  const updated = updater(session.exercises[idx]);
  const exercises = session.exercises.map((e, i) => (i === idx ? updated : e));

  return { ...session, exercises };
}

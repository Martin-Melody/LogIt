import { getWorkoutRepo } from "$lib/data/repoProvider";
import type { StrengthBlockData } from "$lib/domain/workout";

export type PersonalRecord = {
  exerciseName: string;
  weight: number;
  reps: number;
  achievedAtMs: number;
};

export async function getPersonalRecords(limit = 8): Promise<PersonalRecord[]> {
  const sessions = await getWorkoutRepo().listAllSessions();
  const records = new Map<string, PersonalRecord>();

  for (const session of sessions) {
    for (const block of session.blocks) {
      if (block.type !== "strength") continue;
      const data = block.data as StrengthBlockData;
      for (const set of data.sets) {
        if (!set.completed || !set.weight || !set.reps) continue;
        const existing = records.get(data.exerciseName);
        if (!existing || set.weight > existing.weight) {
          records.set(data.exerciseName, {
            exerciseName: data.exerciseName,
            weight: set.weight,
            reps: set.reps,
            achievedAtMs: session.endedAtMs ?? session.startedAtMs,
          });
        }
      }
    }
  }

  return [...records.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

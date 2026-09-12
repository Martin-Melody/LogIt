import { getWorkoutRepo } from "$lib/data/repoProvider";
import { createId } from "@logit/core/domain/ids";
import {
  createSession,
  type WorkoutSession,
  type SessionBlock,
  type StrengthBlockData,
  type CardioBlockData,
  type MobilityBlockData,
} from "@logit/core/domain/workout";

/**
 * Clone the most recent finished session into a fresh draft: keeps the exercises
 * and their target reps / weights, but clears everything that was specific to
 * that day — completion, rest timers, RPE, notes, logged cardio values.
 * Returns null when there is no previous session to repeat.
 */
export async function repeatLastSession(): Promise<WorkoutSession | null> {
  const repo = getWorkoutRepo();
  const [recent] = await repo.listRecentSessions({ limit: 1 });
  if (!recent) return null;

  const base = createSession();
  const blocks: SessionBlock[] = [...recent.blocks]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((block, orderIndex) => cloneBlock(block, orderIndex));

  const session: WorkoutSession = { ...base, blocks };
  await repo.saveDraftSession(session);
  return session;
}

function cloneBlock(block: SessionBlock, orderIndex: number): SessionBlock {
  const id = createId("ex");

  if (block.type === "strength") {
    const data = block.data as StrengthBlockData;
    return {
      id,
      type: "strength",
      orderIndex,
      data: {
        exerciseName: data.exerciseName,
        exerciseId: data.exerciseId,
        sets: data.sets
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((s, i) => ({
            id: createId("set"),
            setType: s.setType,
            reps: s.reps,
            weight: s.weight,
            orderIndex: i,
            restDurationMs: s.restDurationMs,
            machineId: s.machineId,
          })),
      } satisfies StrengthBlockData,
    };
  }

  if (block.type === "cardio") {
    const data = block.data as CardioBlockData;
    return {
      id,
      type: "cardio",
      orderIndex,
      data: {
        activityName: data.activityName,
        intervals: data.intervals
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((iv, i) => ({
            id: createId("interval"),
            orderIndex: i,
            durationMs: null,
            distanceM: null,
            note: null,
          })),
      } satisfies CardioBlockData,
    };
  }

  if (block.type === "mobility") {
    const data = block.data as MobilityBlockData;
    return {
      id,
      type: "mobility",
      orderIndex,
      data: {
        drillName: data.drillName,
        drillId: data.drillId,
        metric: data.metric,
        perSide: data.perSide,
        // Carry the drill-level setup forward — only the per-set log resets.
        restBetweenSetsMs: data.restBetweenSetsMs,
        leadSide: data.leadSide,
        sets: data.sets
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((s, i) => ({
            id: createId("mset"),
            orderIndex: i,
            side: s.side,
            // Keep the target you were working toward; clear what you logged.
            targetSec: s.targetSec ?? null,
          })),
      } satisfies MobilityBlockData,
    };
  }

  // Unknown / plugin block — carry the payload across with a fresh id.
  return { id, type: block.type, orderIndex, data: structuredClone(block.data) };
}

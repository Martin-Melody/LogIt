import { createId } from "./ids";
import {
  blockGroup,
  createSession,
  type CardioBlockData,
  type MobilityBlockData,
  type SessionBlock,
  type StrengthBlockData,
  type SupersetInfo,
  type WorkoutSession,
} from "./workout";

/**
 * A fresh workout with the same exercises, drills, activities and groups as `session`,
 * each set's reps and weight carried over as what to do. Everything specific to that day
 * goes: ticks, rest timers, RPE, notes, logged cardio and hold times. Keeps the name so
 * the history shows it as the same workout; the plan it came from isn't carried over.
 */
export function repeatSession(session: WorkoutSession, startedAtMs?: number): WorkoutSession {
  const base = createSession(startedAtMs);
  const groupIds = new Map<string, string>();
  const regroup = (info: SupersetInfo | undefined): { superset?: SupersetInfo } => {
    if (!info) return {};
    let id = groupIds.get(info.id);
    if (!id) {
      id = createId("superset");
      groupIds.set(info.id, id);
    }
    return { superset: { ...info, id } };
  };

  const blocks = [...session.blocks]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((block, orderIndex) => cloneBlock(block, orderIndex, regroup(blockGroup(block))));

  const name = session.name?.trim() || session.source?.dayName;
  return { ...base, blocks, ...(name ? { name } : {}) };
}

function cloneBlock(block: SessionBlock, orderIndex: number, group: { superset?: SupersetInfo }): SessionBlock {
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
        ...group,
        sets: [...data.sets]
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
        ...group,
        intervals: [...data.intervals]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((_, i) => ({ id: createId("interval"), orderIndex: i, durationMs: null, distanceM: null, note: null })),
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
        // The drill's setup carries over; only the per-set log resets.
        restBetweenSetsMs: data.restBetweenSetsMs,
        leadSide: data.leadSide,
        ...group,
        sets: [...data.sets]
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

  // Unknown / plugin block: the payload as is, with a fresh id.
  return { id, type: block.type, orderIndex, data: structuredClone(block.data) };
}

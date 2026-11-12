// A split day turned into the workout it starts: one block per planned block, drills with
// their sets and targets, and the day's supersets and circuits made into workout groups.
// Strength sets are left to the progression plan (planSession), which reads the targets
// returned here; `padGroupRounds` then gives grouped exercises any rounds it didn't fill.

import type { PlannedTargets, SplitDay } from "./WorkoutSplit";
import { plannedSetCount, sortPlannedBlocks } from "./WorkoutSplit";
import {
  addCardioBlock,
  addExercise,
  addMobilityBlock,
  addMobilitySet,
  addSet,
  applySetPlan,
  blockGroup,
  createSession,
  groupIntoSuperset,
  setGroupSettings,
  updateMobilitySet,
  type MobilityBlockData,
  type MobilitySide,
  type StrengthBlockData,
  type WorkoutSession,
} from "./workout";

export type SplitDaySession = {
  session: WorkoutSession;
  /** Each strength block's targets, by workout block id (sets = the group's rounds). */
  targetsByBlockId: Record<string, PlannedTargets | undefined>;
  /** Rounds each grouped strength block should have, by workout block id. */
  roundsByBlockId: Record<string, number>;
  /** The set target of each strength block not in a group, by workout block id. */
  ownSetsByBlockId: Record<string, number>;
  /** The workout group each planned group became, by planned group id. */
  groupIdByPlannedId: Record<string, string>;
};

export function splitDaySession(
  day: SplitDay,
  opts: { startedAtMs?: number; leadSide?: MobilitySide } = {},
): SplitDaySession {
  let session = createSession(opts.startedAtMs);
  const targetsByBlockId: Record<string, PlannedTargets | undefined> = {};
  const roundsByBlockId: Record<string, number> = {};
  const ownSetsByBlockId: Record<string, number> = {};
  const sessionIdByPlannedId: Record<string, string> = {};

  for (const block of sortPlannedBlocks(day.blocks)) {
    const count = plannedSetCount(day, block);
    if (block.type === "strength") {
      session = addExercise(session, { exerciseName: block.exerciseName, exerciseId: block.exerciseId });
      const id = session.blocks.at(-1)!.id;
      const grouped = !!block.groupId && count !== undefined;
      targetsByBlockId[id] = grouped ? { ...block.targets, sets: count } : block.targets;
      if (grouped) roundsByBlockId[id] = count!;
      else if (count) ownSetsByBlockId[id] = count;
      sessionIdByPlannedId[block.id] = id;
    } else if (block.type === "cardio") {
      session = addCardioBlock(session, block.activityName);
      sessionIdByPlannedId[block.id] = session.blocks.at(-1)!.id;
    } else {
      session = addMobilityBlock(session, {
        drillName: block.drillName,
        drillId: block.drillId,
        metric: block.metric,
        perSide: block.perSide,
        leadSide: opts.leadSide,
      });
      const id = session.blocks.at(-1)!.id;
      sessionIdByPlannedId[block.id] = id;
      for (let n = 1; n < (count ?? 1); n++) session = addMobilitySet(session, id);
      const data = session.blocks.at(-1)!.data as MobilityBlockData;
      const t = block.targets;
      const patch =
        block.metric === "hold" ? (t?.holdSec ? { targetSec: t.holdSec } : null) : t?.reps ? { reps: t.reps } : null;
      if (patch) {
        for (const set of data.sets) session = updateMobilitySet(session, id, set.id, patch);
      }
    }
  }

  const groupIdByPlannedId: Record<string, string> = {};
  for (const group of day.groups ?? []) {
    const ids = sortPlannedBlocks(day.blocks)
      .filter((b) => b.groupId === group.id)
      .map((b) => sessionIdByPlannedId[b.id])
      .filter((id): id is string => !!id);
    if (ids.length === 0) continue;
    const before = session;
    session = groupIntoSuperset(session, ids, group.label, group.kind);
    if (session === before) continue;
    const first = session.blocks.find((b) => b.id === ids[0]);
    const supersetId = first ? blockGroup(first)?.id : undefined;
    if (!supersetId) continue;
    groupIdByPlannedId[group.id] = supersetId;
    session = setGroupSettings(session, supersetId, {
      ...(group.roundRestMs !== undefined ? { roundRestMs: group.roundRestMs } : {}),
      ...(group.memberRestMs !== undefined ? { memberRestMs: group.memberRestMs } : {}),
      ...(group.leadInMs !== undefined ? { leadInMs: group.leadInMs } : {}),
    });
  }

  return { session, targetsByBlockId, roundsByBlockId, ownSetsByBlockId, groupIdByPlannedId };
}

/**
 * Fill in the sets the progression plan didn't: a grouped exercise gets up to its group's
 * rounds, and an exercise with no sets at all (no algorithm picked, or nothing to go on
 * yet) gets the split's set target. An exercise the algorithm planned keeps its plan.
 */
export function padPlannedSets(
  session: WorkoutSession,
  built: Pick<SplitDaySession, "roundsByBlockId" | "ownSetsByBlockId" | "targetsByBlockId">,
): WorkoutSession {
  let out = padGroupRounds(session, built.roundsByBlockId, built.targetsByBlockId);
  const empty: Record<string, number> = {};
  for (const [id, sets] of Object.entries(built.ownSetsByBlockId)) {
    const block = out.blocks.find((b) => b.id === id);
    if (block?.type === "strength" && (block.data as StrengthBlockData).sets.length === 0) empty[id] = sets;
  }
  out = padGroupRounds(out, empty, built.targetsByBlockId);
  return out;
}

/**
 * Give each grouped strength exercise its group's rounds when the progression plan left
 * it short (no algorithm picked, or a plan with fewer sets). The extra sets repeat the
 * last planned set, else the split's rep and weight target as planned sets (ticking logs
 * the target), else plain sets to fill in.
 */
export function padGroupRounds(
  session: WorkoutSession,
  roundsByBlockId: Record<string, number>,
  targetsByBlockId: Record<string, PlannedTargets | undefined>,
): WorkoutSession {
  let out = session;
  for (const [id, rounds] of Object.entries(roundsByBlockId)) {
    const block = out.blocks.find((b) => b.id === id);
    if (!block || block.type !== "strength") continue;
    const working = [...(block.data as StrengthBlockData).sets]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .filter((s) => s.setType !== "warmup");
    if (working.length >= rounds) continue;
    const t = targetsByBlockId[id];
    const last = working.at(-1)?.target ?? (t?.reps ? { reps: t.reps, weight: t.weight ?? 0 } : null);
    if (last) {
      // applySetPlan swaps the unlogged planned sets for this plan, so it starts with them.
      const plan = working.map((s) => ({ ...(s.target ?? { reps: s.reps, weight: s.weight }), machineId: s.machineId }));
      while (plan.length < rounds) plan.push({ ...last, machineId: working.at(-1)?.machineId });
      out = applySetPlan(out, id, plan);
    } else {
      for (let n = working.length; n < rounds; n++) out = addSet(out, id, { reps: 0, weight: t?.weight ?? 0 });
    }
  }
  return out;
}

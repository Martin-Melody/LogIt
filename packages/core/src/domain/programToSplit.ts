import type { CoachProgram, ProgramBlock, ProgramDay, ProgramSet, ProgramWeek } from "./CoachProgram";
import type { PlannedBlock, PlannedGroup, PlannedTargets, SplitDay, WorkoutSplit } from "./WorkoutSplit";
import { createId } from "./ids";
import { nowMs } from "./time";
import { loadFromPercent } from "./oneRepMax";

/**
 * One week of a program as a split the lifter owns and can change: the "Copy into a split"
 * on the web's Programs page. A split has no per-set prescriptions, so each exercise keeps
 * its working-set count, one rep target and one weight:
 *
 * - Reps: a fixed count as is; a range takes its top (the built-ins say to add weight once
 *   you reach it); AMRAP has none.
 * - Weight: the first working set's kg, else its % of 1RM worked out from `oneRepMaxKg`
 *   (by exercise name, lower case) when that's known, else none.
 * - Warm-up sets aren't counted. Blocks sharing a superset group become one planned group
 *   whose rounds are the most sets any member had.
 *
 * Days with weekdays on every one become a weekday split; otherwise it's a rotation.
 */
export function programWeekToSplit(
  program: CoachProgram,
  week: ProgramWeek = program.weeks[0]!,
  oneRepMaxKg: Map<string, number> = new Map(),
): WorkoutSplit {
  const now = nowMs();
  const days = [...(week?.days ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const byWeekday = days.length > 0 && days.every((d) => d.weekday != null);
  return {
    id: createId("split"),
    name: program.name.trim() || "Program",
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    days: days.map((d, i) => toSplitDay(d, i, byWeekday, oneRepMaxKg)),
    ...(byWeekday ? { schedule: "weekdays" as const } : {}),
  };
}

function workingSets(sets: ProgramSet[]): ProgramSet[] {
  return [...sets].sort((a, b) => a.orderIndex - b.orderIndex).filter((s) => s.setType !== "warmup");
}

function targetsFor(block: Extract<ProgramBlock, { type: "strength" }>, oneRepMaxKg: Map<string, number>): PlannedTargets | undefined {
  const sets = workingSets(block.sets);
  const first = sets[0];
  const t: PlannedTargets = {};
  if (sets.length > 0) t.sets = sets.length;
  if (first && first.setType !== "amrap") {
    const reps = first.reps ?? first.repsMax ?? first.repsMin;
    if (reps && reps > 0) t.reps = reps;
  }
  if (first?.weight && first.weight > 0) t.weight = first.weight;
  else if (first?.percent1RM) {
    const e1rm = oneRepMaxKg.get(block.exerciseName.trim().toLowerCase());
    const kg = e1rm ? loadFromPercent(e1rm, first.percent1RM) : null;
    if (kg) t.weight = kg;
  }
  return Object.keys(t).length > 0 ? t : undefined;
}

function toSplitDay(day: ProgramDay, orderIndex: number, byWeekday: boolean, oneRepMaxKg: Map<string, number>): SplitDay {
  const blocks = [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  const groupIds = new Map<string, string>();
  const groupSets = new Map<string, number>();
  const groupCount = new Map<string, number>();
  for (const b of blocks) if (b.supersetGroup) groupCount.set(b.supersetGroup, (groupCount.get(b.supersetGroup) ?? 0) + 1);

  const planned: PlannedBlock[] = blocks.map((b, i) => {
    // A "group" of one isn't a superset.
    const key = b.supersetGroup && (groupCount.get(b.supersetGroup) ?? 0) > 1 ? b.supersetGroup : undefined;
    let groupId: string | undefined;
    if (key) {
      groupId = groupIds.get(key) ?? createId("pgroup");
      groupIds.set(key, groupId);
    }
    if (b.type === "cardio") {
      return { type: "cardio", id: createId("pcardio"), orderIndex: i, activityName: b.activityName, ...(groupId ? { groupId } : {}) };
    }
    const targets = targetsFor(b, oneRepMaxKg);
    if (key) groupSets.set(key, Math.max(groupSets.get(key) ?? 0, targets?.sets ?? 0));
    return {
      type: "strength",
      id: createId("pex"),
      orderIndex: i,
      exerciseName: b.exerciseName,
      ...(b.exerciseId ? { exerciseId: b.exerciseId } : {}),
      ...(targets ? { targets } : {}),
      ...(groupId ? { groupId } : {}),
    };
  });

  const groups: PlannedGroup[] = [...groupIds.entries()].map(([key, id]) => ({ id, rounds: groupSets.get(key) || 3 }));
  return {
    id: createId("day"),
    orderIndex,
    ...(day.name?.trim() ? { name: day.name.trim() } : {}),
    blocks: planned,
    ...(groups.length > 0 ? { groups } : {}),
    ...(byWeekday && day.weekday != null ? { weekday: day.weekday } : {}),
  };
}

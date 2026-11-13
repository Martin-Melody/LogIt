import { createId } from "./ids";
import { nowMs } from "./time";
import { minGroupSize, type GroupKind, type GroupSettingsPatch, type MobilityMetric } from "./workout";

export type WorkoutSplit = {
  id: string;
  name: string;
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  days: SplitDay[];
  /**
   * How the days fall on the calendar (see splitSchedule.ts). "rotation" (unset): one after
   * another, rest days included, whenever you train. "weekdays": each day has a weekday.
   */
  schedule?: SplitScheduleMode;
};

export type SplitScheduleMode = "rotation" | "weekdays";

export type SplitDay = {
  id: string;
  orderIndex: number;
  name?: string;
  blocks: PlannedBlock[];
  /** Supersets and circuits on this day. Members point at one with `groupId`. */
  groups?: PlannedGroup[];
  /** A rest day in a rotation: takes up a calendar day, nothing to start. */
  rest?: boolean;
  /** Rotation: done on the same calendar day as the day before it (a second workout). */
  sameDayAsPrevious?: boolean;
  /** "weekdays" schedule: 0 = Sunday … 6 = Saturday. Several days can share one. */
  weekday?: number;
};

/**
 * A superset or circuit planned on a split day. Its members sit next to each other and
 * carry its id in `groupId`. The rounds are set here, not per member: starting the day
 * gives every member that many sets. The timings mean the same as on a workout's group
 * (`SupersetInfo`); unset is the default.
 */
export type PlannedGroup = {
  id: string;
  label?: string;
  /** Unset = by count: two is a superset, one or three or more a circuit. */
  kind?: GroupKind;
  rounds: number;
  roundRestMs?: number;
  memberRestMs?: number;
  leadInMs?: number;
};

export type PlannedStrength = {
  type: "strength";
  id: string;
  orderIndex: number;
  exerciseName: string;
  exerciseId?: string;
  targets?: PlannedTargets;
  groupId?: string;
};

export type PlannedCardio = {
  type: "cardio";
  id: string;
  orderIndex: number;
  activityName: string;
  groupId?: string;
};

/** A mobility drill on a split day: a timed hold or counted reps, maybe per side. */
export type PlannedMobility = {
  type: "mobility";
  id: string;
  orderIndex: number;
  drillName: string;
  drillId?: string;
  metric: MobilityMetric;
  perSide: boolean;
  targets?: PlannedMobilityTargets;
  groupId?: string;
};

export type PlannedMobilityTargets = {
  /** Sets (an L/R pair counts once). Ignored while the drill is in a group. */
  sets?: number;
  /** Seconds to hold, for a hold drill. */
  holdSec?: number;
  /** Reps, for a reps drill. */
  reps?: number;
};

export type PlannedBlock = PlannedStrength | PlannedCardio | PlannedMobility;

/** The name a planned block goes by: exercise, activity or drill. */
export function plannedBlockName(block: PlannedBlock): string {
  if (block.type === "strength") return block.exerciseName;
  if (block.type === "cardio") return block.activityName;
  return block.drillName;
}

export type PlannedTargets = {
  sets?: number;
  reps?: number;
  weight?: number;
};

export function createSplit(name: string = "New Split"): WorkoutSplit {
  const now = nowMs();
  return {
    id: createId("split"),
    name: name.trim() || "New Split",
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    days: [],
  };
}

export function touchSplit(split: WorkoutSplit): WorkoutSplit {
  return { ...split, updatedAtMs: nowMs() };
}

export function renameSplit(split: WorkoutSplit, name: string): WorkoutSplit {
  const nextName = name.trim() || "New Split";
  return touchSplit({ ...split, name: nextName });
}

export function archiveSplit(
  split: WorkoutSplit,
  archived = true,
): WorkoutSplit {
  return touchSplit({ ...split, archived });
}

export function addDay(split: WorkoutSplit, name?: string): WorkoutSplit {
  const day: SplitDay = {
    id: createId("day"),
    orderIndex: split.days.length,
    name: name?.trim() || undefined,
    blocks: [],
  };

  return touchSplit({
    ...split,
    days: [...split.days, day],
  });
}

export function addPlannedStrength(
  split: WorkoutSplit,
  dayId: string,
  exercise: {
    exerciseName: string;
    exerciseId?: string;
    targets?: PlannedTargets;
  },
): WorkoutSplit {
  const idx = split.days.findIndex((d) => d.id === dayId);
  if (idx === -1) return split;

  const day = split.days[idx]!;

  const nextBlock: PlannedStrength = {
    type: "strength",
    id: createId("pex"),
    orderIndex: day.blocks.length,
    exerciseName: exercise.exerciseName.trim(),
    exerciseId: exercise.exerciseId,
    targets: exercise.targets,
  };

  const nextDay: SplitDay = { ...day, blocks: [...day.blocks, nextBlock] };
  const nextDays = split.days.map((d, i) => (i === idx ? nextDay : d));
  return touchSplit({ ...split, days: nextDays });
}

export function addPlannedCardio(
  split: WorkoutSplit,
  dayId: string,
  activityName: string,
): WorkoutSplit {
  const idx = split.days.findIndex((d) => d.id === dayId);
  if (idx === -1) return split;

  const day = split.days[idx]!;

  const nextBlock: PlannedCardio = {
    type: "cardio",
    id: createId("pcardio"),
    orderIndex: day.blocks.length,
    activityName: activityName.trim(),
  };

  const nextDay: SplitDay = { ...day, blocks: [...day.blocks, nextBlock] };
  const nextDays = split.days.map((d, i) => (i === idx ? nextDay : d));
  return touchSplit({ ...split, days: nextDays });
}

/** Patch a planned block in place (targets, exercise identity, activity name, drill). */
export function updatePlannedBlock(
  split: WorkoutSplit,
  dayId: string,
  blockId: string,
  patch:
    | Partial<Omit<PlannedStrength, "id" | "type" | "orderIndex">>
    | Partial<Omit<PlannedCardio, "id" | "type" | "orderIndex">>
    | Partial<Omit<PlannedMobility, "id" | "type" | "orderIndex">>,
): WorkoutSplit {
  const dayIdx = split.days.findIndex((d) => d.id === dayId);
  if (dayIdx === -1) return split;
  const day = split.days[dayIdx]!;
  if (!day.blocks.some((b) => b.id === blockId)) return split;

  const nextDay: SplitDay = {
    ...day,
    blocks: day.blocks.map((b) =>
      b.id === blockId ? ({ ...b, ...patch } as PlannedBlock) : b,
    ),
  };
  return touchSplit({
    ...split,
    days: split.days.map((d, i) => (i === dayIdx ? nextDay : d)),
  });
}

/**
 * Set (or clear) the planned targets on a strength block. Empty / zero fields
 * are dropped; if nothing is left, `targets` is removed entirely.
 */
export function setPlannedTargets(
  split: WorkoutSplit,
  dayId: string,
  blockId: string,
  targets: PlannedTargets,
): WorkoutSplit {
  const clean: PlannedTargets = {};
  if (targets.sets && targets.sets > 0) clean.sets = targets.sets;
  if (targets.reps && targets.reps > 0) clean.reps = targets.reps;
  if (targets.weight != null && targets.weight !== 0) clean.weight = targets.weight;
  const next = Object.keys(clean).length > 0 ? clean : undefined;
  return updatePlannedBlock(split, dayId, blockId, { targets: next });
}

export function reorderDays(
  split: WorkoutSplit,
  fromIndex: number,
  toIndex: number,
): WorkoutSplit {
  if (fromIndex === toIndex) return split;
  const days = [...split.days];
  const [moved] = days.splice(fromIndex, 1);
  if (!moved) return split;
  days.splice(toIndex, 0, moved);
  const reindexed = days.map((d, i) => ({ ...d, orderIndex: i }));
  return touchSplit({ ...split, days: reindexed });
}

export function reorderPlannedBlocks(
  split: WorkoutSplit,
  dayId: string,
  fromIndex: number,
  toIndex: number,
): WorkoutSplit {
  const dayIdx = split.days.findIndex((d) => d.id === dayId);
  if (dayIdx === -1) return split;

  const day = split.days[dayIdx]!;
  if (fromIndex === toIndex) return split;

  const blocks = [...day.blocks];
  const [moved] = blocks.splice(fromIndex, 1);
  if (!moved) return split;
  blocks.splice(toIndex, 0, moved);

  const reindexed = blocks.map((b, i) => ({ ...b, orderIndex: i }));

  const nextDay: SplitDay = { ...day, blocks: reindexed };
  const nextDays = split.days.map((d, i) => (i === dayIdx ? nextDay : d));
  return touchSplit({ ...split, days: nextDays });
}

export function addPlannedMobility(
  split: WorkoutSplit,
  dayId: string,
  drill: {
    drillName: string;
    drillId?: string;
    metric: MobilityMetric;
    perSide: boolean;
    targets?: PlannedMobilityTargets;
  },
): WorkoutSplit {
  return updateSplitDay(split, dayId, (day) => {
    const block: PlannedMobility = {
      type: "mobility",
      id: createId("pmob"),
      orderIndex: nextOrderIndex(day),
      drillName: drill.drillName.trim(),
      ...(drill.drillId ? { drillId: drill.drillId } : {}),
      metric: drill.metric,
      perSide: drill.perSide,
      ...(drill.targets ? { targets: drill.targets } : {}),
    };
    return { ...day, blocks: [...day.blocks, block] };
  });
}

// ── Split day: groups ─────────────────────────────────────────────────────────

/** Rounds a new group gets when none of its members has a set count. */
export const DEFAULT_PLANNED_ROUNDS = 3;
export const MAX_PLANNED_ROUNDS = 20;

/** Change one day of a split (and stamp the split as edited). */
export function updateSplitDay(
  split: WorkoutSplit,
  dayId: string,
  fn: (day: SplitDay) => SplitDay,
): WorkoutSplit {
  const idx = split.days.findIndex((d) => d.id === dayId);
  if (idx === -1) return split;
  const next = fn(split.days[idx]!);
  if (next === split.days[idx]) return split;
  return touchSplit({ ...split, days: split.days.map((d, i) => (i === idx ? next : d)) });
}

function nextOrderIndex(day: SplitDay): number {
  return day.blocks.length === 0 ? 0 : Math.max(...day.blocks.map((b) => b.orderIndex)) + 1;
}

export function sortPlannedBlocks(blocks: PlannedBlock[]): PlannedBlock[] {
  return [...blocks].sort((a, b) => a.orderIndex - b.orderIndex);
}

function reindex(blocks: PlannedBlock[]): PlannedBlock[] {
  return blocks.map((b, i) => (b.orderIndex === i ? b : { ...b, orderIndex: i }));
}

/** The group a planned block is in, if any. */
export function plannedGroupOf(day: SplitDay, block: PlannedBlock): PlannedGroup | undefined {
  return block.groupId ? day.groups?.find((g) => g.id === block.groupId) : undefined;
}

/** A group's members, in day order. */
export function plannedGroupMembers(day: SplitDay, groupId: string): PlannedBlock[] {
  return sortPlannedBlocks(day.blocks).filter((b) => b.groupId === groupId);
}

/** The sets a block's own targets ask for (strength and mobility). */
function ownSets(block: PlannedBlock): number | undefined {
  if (block.type === "cardio") return undefined;
  const sets = block.targets?.sets;
  return sets && sets > 0 ? sets : undefined;
}

/**
 * How many sets a planned block gets when the day starts: its group's rounds, else its
 * own set target. Undefined when nothing says (cardio, or no target set).
 */
export function plannedSetCount(day: SplitDay, block: PlannedBlock): number | undefined {
  if (block.type === "cardio") return undefined;
  return plannedGroupOf(day, block)?.rounds ?? ownSets(block);
}

function withGroupId(block: PlannedBlock, groupId: string | undefined): PlannedBlock {
  if (groupId) return { ...block, groupId };
  const { groupId: _dropped, ...rest } = block;
  return rest as PlannedBlock;
}

/** A block taken out of its group keeps the group's rounds as its own sets. */
function leaveGroup(block: PlannedBlock, rounds: number): PlannedBlock {
  const out = withGroupId(block, undefined);
  if (out.type === "strength") return { ...out, targets: { ...out.targets, sets: rounds } };
  if (out.type === "mobility") return { ...out, targets: { ...out.targets, sets: rounds } };
  return out;
}

/**
 * Group planned blocks into a superset or circuit. Like a workout's groups: blocks
 * already in a group bring their whole group, every group involved merges into one
 * (keeping the first one's settings), and the members are pulled together at the
 * position of the first. A new group's rounds are the most sets any member asks for.
 */
export function groupPlannedBlocks(
  day: SplitDay,
  blockIds: string[],
  opts: { kind?: GroupKind; label?: string } = {},
): SplitDay {
  const sorted = sortPlannedBlocks(day.blocks);
  const ids = new Set(blockIds);
  const targets = sorted.filter((b) => ids.has(b.id));
  if (targets.length === 0) return day;

  const groups = day.groups ?? [];
  const involved = groups.filter((g) => targets.some((t) => t.groupId === g.id));
  const existing = involved[0];
  const kind = opts.kind ?? existing?.kind;
  const members = sorted.filter((b) => ids.has(b.id) || involved.some((g) => g.id === b.groupId));
  if (members.length < minGroupSize(kind)) return day;

  const label = opts.label?.trim() || existing?.label;
  const group: PlannedGroup = {
    ...(existing ?? { id: createId("pgroup") }),
    ...(label ? { label } : {}),
    ...(kind ? { kind } : {}),
    rounds: existing?.rounds ?? (Math.max(0, ...members.map((b) => ownSets(b) ?? 0)) || DEFAULT_PLANNED_ROUNDS),
  };

  const memberIds = new Set(members.map((b) => b.id));
  const rest = sorted.filter((b) => !memberIds.has(b.id));
  const anchor = sorted.findIndex((b) => memberIds.has(b.id));
  const placed = members.map((b) => withGroupId(b, group.id));
  const blocks = reindex([...rest.slice(0, anchor), ...placed, ...rest.slice(anchor)]);

  return {
    ...day,
    blocks,
    groups: [...groups.filter((g) => !involved.includes(g)), group],
  };
}

/** Break a group apart: its members stay where they are and keep its rounds as sets. */
export function ungroupPlanned(day: SplitDay, groupId: string): SplitDay {
  const group = day.groups?.find((g) => g.id === groupId);
  if (!group) return day;
  return {
    ...day,
    blocks: day.blocks.map((b) => (b.groupId === groupId ? leaveGroup(b, group.rounds) : b)),
    groups: (day.groups ?? []).filter((g) => g.id !== groupId),
  };
}

/** Remove a group and every block in it. */
export function removePlannedGroup(day: SplitDay, groupId: string): SplitDay {
  return {
    ...day,
    blocks: reindex(sortPlannedBlocks(day.blocks).filter((b) => b.groupId !== groupId)),
    groups: (day.groups ?? []).filter((g) => g.id !== groupId),
  };
}

/** Remove one planned block. A group left too small for its kind is broken up. */
export function removePlannedBlock(day: SplitDay, blockId: string): SplitDay {
  if (!day.blocks.some((b) => b.id === blockId)) return day;
  return normalizePlannedGroups({
    ...day,
    blocks: reindex(sortPlannedBlocks(day.blocks).filter((b) => b.id !== blockId)),
  });
}

/** Call a group a superset or a circuit. A one-exercise group made a superset is ungrouped. */
export function setPlannedGroupKind(day: SplitDay, groupId: string, kind: GroupKind): SplitDay {
  return normalizePlannedGroups({
    ...day,
    groups: (day.groups ?? []).map((g) => (g.id === groupId ? { ...g, kind } : g)),
  });
}

/** The group's rounds, kept between 1 and MAX_PLANNED_ROUNDS. */
export function setPlannedGroupRounds(day: SplitDay, groupId: string, rounds: number): SplitDay {
  const n = Math.max(1, Math.min(MAX_PLANNED_ROUNDS, Math.round(rounds)));
  return {
    ...day,
    groups: (day.groups ?? []).map((g) => (g.id === groupId ? { ...g, rounds: n } : g)),
  };
}

/** Name or timings, like a workout's `setGroupSettings`: `null` (or an empty name) clears. */
export function setPlannedGroupSettings(day: SplitDay, groupId: string, patch: GroupSettingsPatch): SplitDay {
  return {
    ...day,
    groups: (day.groups ?? []).map((g) => {
      if (g.id !== groupId) return g;
      const next: PlannedGroup = { ...g };
      if (patch.label !== undefined) {
        const name = patch.label?.trim();
        if (name) next.label = name;
        else delete next.label;
      }
      for (const key of ["roundRestMs", "memberRestMs", "leadInMs"] as const) {
        const v = patch[key];
        if (v === undefined) continue;
        if (v === null) delete next[key];
        else next[key] = Math.max(0, Math.round(v));
      }
      return next;
    }),
  };
}

/**
 * Put a day's blocks in this order (ids of every block). Ids missing from the list keep
 * their place after the listed ones.
 */
export function orderPlannedBlocks(day: SplitDay, orderedIds: string[]): SplitDay {
  const byId = new Map(day.blocks.map((b) => [b.id, b]));
  const listed = orderedIds.map((id) => byId.get(id)).filter((b): b is PlannedBlock => !!b);
  const listedIds = new Set(listed.map((b) => b.id));
  const others = sortPlannedBlocks(day.blocks).filter((b) => !listedIds.has(b.id));
  return { ...day, blocks: reindex([...listed, ...others]) };
}

/**
 * Keep a day's groups sound: a block pointing at a missing group leaves it, a group with
 * too few members for its kind is broken up (its members keep its rounds), and a group
 * with no members is dropped.
 */
export function normalizePlannedGroups(day: SplitDay): SplitDay {
  const groups = day.groups ?? [];
  const known = new Set(groups.map((g) => g.id));
  let blocks = day.blocks.map((b) => (b.groupId && !known.has(b.groupId) ? withGroupId(b, undefined) : b));
  const kept: PlannedGroup[] = [];
  for (const g of groups) {
    const count = blocks.filter((b) => b.groupId === g.id).length;
    if (count >= minGroupSize(g.kind)) kept.push(g);
    else if (count > 0) blocks = blocks.map((b) => (b.groupId === g.id ? leaveGroup(b, g.rounds) : b));
  }
  const changed = kept.length !== groups.length || blocks.some((b, i) => b !== day.blocks[i]);
  if (!changed) return day;
  const out: SplitDay = { ...day, blocks };
  if (kept.length > 0) out.groups = kept;
  else delete out.groups;
  return out;
}

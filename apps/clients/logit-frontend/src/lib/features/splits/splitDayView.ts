// What the split day editor shows: its rows (single blocks and groups), one-line summaries
// in the workout's style, and the rows of "Superset / circuit with…".

import type { PlannedBlock, PlannedGroup, SplitDay } from "@logit/core/domain/WorkoutSplit";
import {
  plannedBlockName,
  plannedGroupMembers,
  plannedGroupOf,
  plannedSetCount,
  sortPlannedBlocks,
} from "@logit/core/domain/WorkoutSplit";
import { groupKindOf, groupLabel, type GroupKind } from "@logit/core/domain/workout";
import { formatWeight, type WeightUnit } from "@logit/core/domain/units";
import type { GroupPickerModel, GroupPickerItem, GroupPickerSection } from "$lib/features/session/grouping";
import { formatRestMs } from "$lib/features/session/circuit/circuitSettings";

/** A block with its place in the day (index in day order). */
export type PlacedBlock = { block: PlannedBlock; idx: number };

export type DayRun =
  | { kind: "block"; block: PlannedBlock; idx: number }
  | { kind: "group"; group: PlannedGroup; members: PlacedBlock[] };

/** The day in order, a group's members together under it. */
export function dayRuns(day: SplitDay): DayRun[] {
  const runs: DayRun[] = [];
  sortPlannedBlocks(day.blocks).forEach((block, idx) => {
    const group = plannedGroupOf(day, block);
    const last = runs.at(-1);
    if (!group) runs.push({ kind: "block", block, idx });
    else if (last?.kind === "group" && last.group.id === group.id) last.members.push({ block, idx });
    else runs.push({ kind: "group", group, members: [{ block, idx }] });
  });
  return runs;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * A row's line, like the workout's: "3 × 8 · 60 kg", "3 × 30 s hold · each side",
 * "3 × 10 reps". In a group the sets are the group's rounds, so only what each round asks
 * for: "8 reps · 60 kg", "30 s hold". Null when nothing is set yet.
 */
export function plannedSummary(day: SplitDay, block: PlannedBlock, unit: WeightUnit): string | null {
  if (block.type === "cardio") return null;
  const grouped = !!plannedGroupOf(day, block);
  const sets = grouped ? undefined : plannedSetCount(day, block);
  const parts: string[] = [];

  if (block.type === "strength") {
    const reps = block.targets?.reps;
    if (sets && reps) parts.push(`${sets} × ${reps}`);
    else if (sets) parts.push(plural(sets, "set"));
    else if (reps) parts.push(plural(reps, "rep"));
    if (block.targets?.weight) parts.push(formatWeight(block.targets.weight, unit));
  } else {
    const t = block.targets;
    const each = block.metric === "hold" ? (t?.holdSec ? `${t.holdSec} s hold` : null) : t?.reps ? plural(t.reps, "rep") : null;
    if (sets && each) parts.push(`${sets} × ${each}`);
    else if (sets) parts.push(plural(sets, "set"));
    else if (each) parts.push(each);
    if (block.perSide && parts.length > 0) parts.push("each side");
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** A group's line: "Circuit · 3 exercises · 3 rounds · 1 min rest". */
export function plannedGroupSummary(group: PlannedGroup, memberCount: number): string {
  const kind = groupKindOf(memberCount, group.kind);
  const parts: string[] = [];
  if (group.label?.trim()) parts.push(kind === "circuit" ? "Circuit" : "Superset");
  parts.push(plural(memberCount, "exercise"));
  parts.push(plural(group.rounds, "round"));
  if (group.roundRestMs) parts.push(`${formatRestMs(group.roundRestMs)} rest`);
  return parts.join(" · ");
}

export function plannedGroupName(group: PlannedGroup, memberCount: number): string {
  return groupLabel(memberCount, group.label, group.kind);
}

const KIND_TITLES: Record<string, string> = { strength: "Strength", cardio: "Cardio", mobility: "Mobility" };

function pickerDetail(day: SplitDay, block: PlannedBlock, unit: WeightUnit): string {
  let detail = KIND_TITLES[block.type] ?? block.type;
  const summary = plannedSummary(day, block, unit);
  if (summary) detail += ` · ${summary}`;
  const group = plannedGroupOf(day, block);
  if (group) {
    const count = plannedGroupMembers(day, group.id).length;
    const named = group.label?.trim();
    detail += ` · in ${named ?? "a " + groupLabel(count, undefined, group.kind).toLowerCase()}`;
  }
  return detail;
}

/** "Superset / circuit with…" for a split day block: the same sheet as the workout's. */
export function plannedGroupPickerModel(day: SplitDay, anchorId: string, unit: WeightUnit): GroupPickerModel | null {
  const sorted = sortPlannedBlocks(day.blocks);
  const anchor = sorted.find((b) => b.id === anchorId);
  if (!anchor) return null;
  const group = plannedGroupOf(day, anchor);
  const groupSize = group ? plannedGroupMembers(day, group.id).length : 1;
  const pool = sorted.filter((b) => b.id !== anchorId && !(group && b.groupId === group.id));
  const row = (b: PlannedBlock): GroupPickerItem => ({
    id: b.id,
    name: plannedBlockName(b),
    detail: pickerDetail(day, b, unit),
  });
  const sections: GroupPickerSection[] = [
    { title: KIND_TITLES[anchor.type] ?? "Same kind", items: pool.filter((b) => b.type === anchor.type).map(row) },
    { title: "Other exercises", items: pool.filter((b) => b.type !== anchor.type).map(row) },
  ].filter((s) => s.items.length > 0);

  const named = group?.label?.trim();
  return {
    title: group
      ? `Add to ${named ?? groupLabel(groupSize, undefined, group.kind).toLowerCase()}`
      : `Superset / circuit with ${plannedBlockName(anchor)}`,
    sections,
    groupSize,
    alreadyGrouped: !!group,
    label: named || undefined,
    ...(group?.kind ? { kind: group.kind as GroupKind } : {}),
  };
}

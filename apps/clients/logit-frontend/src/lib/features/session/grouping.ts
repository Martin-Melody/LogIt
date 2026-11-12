// What the "Superset / circuit with…" picker shows for a workout. Kept apart from
// the sheet itself so the split day editor can feed the same sheet its own rows.

import type {
  GroupKind,
  CardioBlockData,
  MobilityBlockData,
  SessionBlock,
  StrengthBlockData,
  WorkoutSession,
} from "@logit/core/domain/workout";
import {
  blockDisplayName,
  blockGroup,
  groupCandidates,
  groupKindOf,
  groupLabel,
  supersetMembers,
} from "@logit/core/domain/workout";

export type GroupPickerItem = { id: string; name: string; detail: string };
export type GroupPickerSection = { title: string; items: GroupPickerItem[] };

export type GroupPickerModel = {
  title: string;
  sections: GroupPickerSection[];
  /** Members the anchor's group has now (1 when it isn't in one). */
  groupSize: number;
  /** The anchor is already in a superset / circuit; picking adds to it. */
  alreadyGrouped: boolean;
  /** The group's own name, if it was given one. */
  label?: string;
  /** The kind chosen for the anchor's group, if it's in one and one was chosen. */
  kind?: GroupKind;
};

const KIND_TITLES: Record<string, string> = {
  strength: "Strength",
  cardio: "Cardio",
  mobility: "Mobility",
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function blockDetail(session: WorkoutSession, b: SessionBlock): string {
  let detail: string;
  if (b.type === "strength") {
    detail = `Strength · ${plural((b.data as StrengthBlockData).sets.length, "set")}`;
  } else if (b.type === "mobility") {
    const d = b.data as MobilityBlockData;
    const sets = d.perSide ? Math.ceil(d.sets.length / 2) : d.sets.length;
    detail = `Mobility · ${plural(sets, "set")}${d.perSide ? " per side" : ""}`;
  } else if (b.type === "cardio") {
    const n = (b.data as CardioBlockData).intervals.length;
    detail = n > 0 ? `Cardio · ${plural(n, "interval")}` : "Cardio";
  } else {
    detail = KIND_TITLES[b.type] ?? b.type;
  }
  const group = blockGroup(b);
  if (group) detail += ` · in ${groupName(session, group.id, group.label, group.kind, "a ")}`;
  return detail;
}

/** "a circuit" / "a superset" (with `article`), or a named group's name as given. */
function groupName(
  session: WorkoutSession,
  groupId: string,
  label: string | undefined,
  kind: GroupKind | undefined,
  article = "",
): string {
  const named = label?.trim();
  if (named) return named;
  return article + groupLabel(supersetMembers(session, groupId).length, undefined, kind).toLowerCase();
}

export function groupPickerModel(session: WorkoutSession, anchorId: string): GroupPickerModel | null {
  const anchor = session.blocks.find((b) => b.id === anchorId);
  if (!anchor) return null;

  const group = blockGroup(anchor);
  const groupSize = group ? supersetMembers(session, group.id).length : 1;
  const { same, other } = groupCandidates(session, anchorId);
  const row = (b: SessionBlock): GroupPickerItem => ({
    id: b.id,
    name: blockDisplayName(b),
    detail: blockDetail(session, b),
  });

  const sections: GroupPickerSection[] = [
    { title: KIND_TITLES[anchor.type] ?? "Same kind", items: same.map(row) },
    { title: "Other exercises", items: other.map(row) },
  ].filter((s) => s.items.length > 0);

  return {
    title: group
      ? `Add to ${groupName(session, group.id, group.label, group.kind)}`
      : `Superset / circuit with ${blockDisplayName(anchor)}`,
    sections,
    groupSize,
    alreadyGrouped: !!group,
    label: group?.label?.trim() || undefined,
    ...(group?.kind ? { kind: group.kind } : {}),
  };
}

/**
 * Superset or circuit for a new group: the user's choice, else by count (one ticked is a
 * superset of two; none, or two or more, a circuit). A circuit can be one exercise alone.
 */
export function pickerGroupKind(pickedCount: number, chosen: GroupKind | null): GroupKind {
  if (chosen === "superset" && pickedCount === 0) return "circuit";
  return chosen ?? groupKindOf(pickedCount + 1);
}

/** Whether the picker can confirm: a superset needs another exercise, a circuit doesn't. */
export function canConfirmGroup(
  model: Pick<GroupPickerModel, "alreadyGrouped">,
  pickedCount: number,
  kind: GroupKind,
): boolean {
  return pickedCount > 0 || (!model.alreadyGrouped && kind === "circuit");
}

/**
 * The picker's confirm button: "Make superset", "Make circuit · 5 exercises",
 * "Make circuit · 1 exercise", "Add to circuit · 6 exercises".
 */
export function groupConfirmLabel(
  model: Pick<GroupPickerModel, "groupSize" | "alreadyGrouped" | "label" | "kind">,
  pickedCount: number,
  chosen: GroupKind | null = null,
): string {
  const total = model.groupSize + pickedCount;
  if (model.alreadyGrouped) {
    if (pickedCount === 0) return "Tick at least one";
    const name = model.label ?? groupLabel(total, undefined, model.kind).toLowerCase();
    return `Add to ${name}${total >= 3 ? ` · ${total} exercises` : ""}`;
  }
  const kind = pickerGroupKind(pickedCount, chosen);
  if (kind === "superset") return pickedCount === 0 ? "Tick at least one" : `Make superset${total >= 3 ? ` · ${total} exercises` : ""}`;
  return `Make circuit · ${total} exercise${total === 1 ? "" : "s"}`;
}

/**
 * Where a dragged block (or a whole group, `span` blocks from `fromIdx`) may land, as
 * insertion indices into the list with the moving blocks taken out. Keeps groups
 * whole: a member stays inside its own group, and anything else lands between
 * groups, never inside one (that split a superset in two).
 */
export function allowedDropIndices(sorted: SessionBlock[], fromIdx: number, span = 1): number[] {
  const moving = sorted[fromIdx];
  if (!moving) return [];
  const ownGroup = span === 1 ? blockGroup(moving)?.id : undefined;
  const rest = [...sorted];
  rest.splice(fromIdx, span);
  const allowed: number[] = [];
  for (let to = 0; to <= rest.length; to++) {
    const left = to > 0 ? blockGroup(rest[to - 1]!)?.id : undefined;
    const right = to < rest.length ? blockGroup(rest[to]!)?.id : undefined;
    if (ownGroup) {
      if (left === ownGroup || right === ownGroup) allowed.push(to);
    } else if (!(left && left === right)) {
      allowed.push(to);
    }
  }
  return allowed;
}

/** The allowed index nearest `target`; ties go to the one nearer where the drag started. */
export function nearestAllowed(allowed: number[], target: number, fromIdx: number): number {
  let best = fromIdx;
  let bestDist = Infinity;
  for (const i of allowed) {
    const d = Math.abs(i - target);
    if (d < bestDist || (d === bestDist && Math.abs(i - fromIdx) < Math.abs(best - fromIdx))) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

import type { SessionBlock, SetEntry, StrengthBlockData, WorkoutSession } from "./workout";

/**
 * What one change to a workout was, worked out by comparing the workout before and after,
 * for workout undo/redo: `label` names the step in the ⋯ menu ("Undo: Remove set 4"), and
 * the changes worth an Undo toast (removals, swaps, reorders) also carry what the toast
 * says before and after undoing. Ticks and typed numbers get no toast.
 */
export type WorkoutChange = { label: string; toast?: { done: string; undone: string } };

function blockName(b: SessionBlock): string {
  const d = b.data as { exerciseName?: string; activityName?: string; drillName?: string };
  return d.exerciseName ?? d.activityName ?? d.drillName ?? "exercise";
}

const byOrder = <T extends { orderIndex: number }>(xs: T[]) => [...xs].sort((a, b) => a.orderIndex - b.orderIndex);

/** "set 3" as the set row numbers it (warm-ups aside), or "warm-up set". */
function setName(sets: SetEntry[], set: SetEntry): string {
  if (set.setType === "warmup") return "warm-up set";
  return `set ${byOrder(sets).filter((x) => x.setType !== "warmup").findIndex((x) => x.id === set.id) + 1}`;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export function describeWorkoutChange(before: WorkoutSession, after: WorkoutSession): WorkoutChange {
  const beforeIds = new Set(before.blocks.map((b) => b.id));
  const afterIds = new Set(after.blocks.map((b) => b.id));
  const removed = before.blocks.filter((b) => !afterIds.has(b.id));
  const added = after.blocks.filter((b) => !beforeIds.has(b.id));

  if (removed.length === 1 && added.length === 0) {
    const n = blockName(removed[0]!);
    return { label: `Remove ${n}`, toast: { done: `${n} removed.`, undone: `${n} is back.` } };
  }
  if (removed.length > 1 && added.length === 0) {
    return { label: `Remove ${removed.length} exercises`, toast: { done: `${removed.length} exercises removed.`, undone: "They're back." } };
  }
  if (added.length > 0 && removed.length === 0) {
    return { label: added.length === 1 ? `Add ${blockName(added[0]!)}` : `Add ${added.length} exercises` };
  }
  if (added.length > 0) return { label: "Change exercises" };

  const order = (s: WorkoutSession) => byOrder(s.blocks).map((b) => b.id).join();
  if (order(before) !== order(after)) {
    return { label: "Reorder exercises", toast: { done: "Exercises reordered.", undone: "Order put back." } };
  }

  for (const a of after.blocks) {
    const b = before.blocks.find((x) => x.id === a.id)!;
    if (a.data === b.data) continue;
    if (a.type !== "strength") return { label: `Change ${blockName(a)}` };
    const was = b.data as StrengthBlockData;
    const now = a.data as StrengthBlockData;
    if (was.exerciseName !== now.exerciseName) {
      return { label: `Swap ${was.exerciseName} for ${now.exerciseName}`, toast: { done: `Swapped to ${now.exerciseName}.`, undone: `Back to ${was.exerciseName}.` } };
    }
    const gone = was.sets.filter((x) => !now.sets.some((y) => y.id === x.id));
    if (gone.length === 1) {
      const n = setName(was.sets, gone[0]!);
      return { label: `Remove ${n}`, toast: { done: `${cap(n)} removed.`, undone: `${cap(n)} is back.` } };
    }
    if (gone.length > 1) return { label: `Remove ${gone.length} sets`, toast: { done: `${gone.length} sets removed.`, undone: "Sets are back." } };
    const fresh = now.sets.filter((x) => !was.sets.some((y) => y.id === x.id));
    if (fresh.length > 0) return { label: fresh.length === 1 && fresh[0]!.setType === "warmup" ? "Add a warm-up set" : fresh.length === 1 ? "Add a set" : `Add ${fresh.length} sets` };
    const changed = now.sets.filter((x) => x !== was.sets.find((y) => y.id === x.id));
    // A tick can re-plan the sets after it in the same step; the tick is what you did.
    const ticked = changed.find((x) => !!x.completed !== !!was.sets.find((y) => y.id === x.id)!.completed);
    if (ticked) return { label: `${ticked.completed ? "Tick" : "Untick"} ${setName(now.sets, ticked)}` };
    if (changed.length === 1) return { label: `Change ${setName(now.sets, changed[0]!)}` };
    if (changed.length > 1) return { label: `Change the plan for ${now.exerciseName}` };
    return { label: "Reorder sets" };
  }
  return { label: "Last change" };
}

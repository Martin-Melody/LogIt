import type { CardioBlockData, MobilityBlockData, SessionBlock, StrengthBlockData, WorkoutSession } from "@logit/core/domain/workout";
import type { PluginBlockData } from "@logit/core/domain/blockPlugin";

/**
 * Where a block is in the workout (merged design, canvas row "v2 and v3 merged"):
 * done (folds to one line), current (lifted out as a card, open) or next (under "Up next").
 */
export type BlockStage = "done" | "current" | "next";

type Progress = { total: number; done: number };

/** How many loggable rows a block has and how many are ticked off. */
export function blockProgress(block: SessionBlock): Progress {
  switch (block.type) {
    case "strength": {
      const sets = (block.data as StrengthBlockData).sets.filter((s) => s.setType !== "warmup");
      return { total: sets.length, done: sets.filter((s) => s.completed).length };
    }
    case "mobility": {
      const sets = (block.data as MobilityBlockData).sets;
      return { total: sets.length, done: sets.filter((s) => s.completed).length };
    }
    case "cardio": {
      // Intervals have no tick: one counts once a time or a distance is in.
      const ivs = (block.data as CardioBlockData).intervals;
      return { total: ivs.length, done: ivs.filter((i) => (i.durationMs ?? 0) > 0 || (i.distanceM ?? 0) > 0).length };
    }
    default: {
      const entries = (block.data as PluginBlockData | undefined)?.entries ?? [];
      return { total: entries.length, done: entries.filter((e) => e.done).length };
    }
  }
}

function groupId(b: SessionBlock): string | undefined {
  return (b.data as { superset?: { id: string } } | undefined)?.superset?.id;
}

/**
 * Every block's stage. A superset or circuit moves as one. The current one is the first
 * started-but-unfinished one (you can jump ahead), else the first unfinished one; the
 * unfinished ones around it are "next". A block with nothing to log counts as unfinished.
 */
export function blockStages(session: Pick<WorkoutSession, "blocks">): Map<string, BlockStage> {
  const sorted = [...session.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  const units: SessionBlock[][] = [];
  for (const b of sorted) {
    const last = units.at(-1);
    const gid = groupId(b);
    if (last && gid && groupId(last[0]!) === gid) last.push(b);
    else units.push([b]);
  }
  const stats = units.map((u) => u.map(blockProgress).reduce((a, p) => ({ total: a.total + p.total, done: a.done + p.done }), { total: 0, done: 0 }));
  const finished = (i: number) => stats[i]!.total > 0 && stats[i]!.done === stats[i]!.total;
  let current = stats.findIndex((p, i) => !finished(i) && p.done > 0);
  if (current === -1) current = stats.findIndex((_, i) => !finished(i));

  const out = new Map<string, BlockStage>();
  units.forEach((u, i) => {
    const stage: BlockStage = finished(i) ? "done" : i === current ? "current" : "next";
    for (const b of u) out.set(b.id, stage);
  });
  return out;
}

/**
 * Folded or open when a block reaches a stage: the one you're on is open, done and upcoming
 * ones fold (Settings › Workout › "Fold exercises you're not on", on by default). Opening or
 * folding one by hand lasts until its stage changes.
 */
export function foldFor(stage: BlockStage, foldOthers: boolean): boolean {
  return foldOthers && stage !== "current";
}

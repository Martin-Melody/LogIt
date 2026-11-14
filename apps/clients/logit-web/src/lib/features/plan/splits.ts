import { syncApi } from "@logit/core/api/syncApi";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
import { updateOwnProfile } from "$lib/features/ownProfile";

/**
 * Splits on the dashboard: read and written straight through the sync API, the same
 * records the phone pushes and pulls. A split is one record and the newest save wins, so
 * a save first checks the server's copy hasn't changed since this page loaded it.
 */

export class SplitConflictError extends Error {
  constructor(public readonly latest: WorkoutSplit | null) {
    super(latest ? "This split was changed on another device since you opened it." : "This split was deleted on another device.");
  }
}

type Row = { id: string; updatedAtMs: number; dataJson: string | null; deletedAtMs?: number | null };

function parse(row: Row): WorkoutSplit | null {
  if (row.deletedAtMs || !row.dataJson) return null;
  try {
    return JSON.parse(row.dataJson) as WorkoutSplit;
  } catch {
    return null;
  }
}

/** Every split, archived ones included, newest first. */
export async function loadSplits(): Promise<WorkoutSplit[]> {
  const { splits } = await syncApi.pullSplits(0);
  return splits
    .map(parse)
    .filter((s): s is WorkoutSplit => s != null)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export async function loadActiveSplitId(): Promise<string | null> {
  const { profile } = await syncApi.pullProfile();
  return profile?.activeSplitId ?? null;
}

/**
 * Save a split. `baseUpdatedAtMs` is the version this page started editing from (null for
 * a new split). If the server has a newer one, throws SplitConflictError unless `overwrite`.
 * Returns the split as saved (its `updatedAtMs` is the save time).
 */
export async function saveSplit(
  split: WorkoutSplit,
  baseUpdatedAtMs: number | null,
  opts: { overwrite?: boolean } = {},
): Promise<WorkoutSplit> {
  const { splits } = await syncApi.pullSplits(0);
  const row = splits.find((r) => r.id === split.id);
  if (row && !opts.overwrite) {
    if (row.deletedAtMs) throw new SplitConflictError(null);
    if (baseUpdatedAtMs != null && row.updatedAtMs > baseUpdatedAtMs) throw new SplitConflictError(parse(row));
  }
  // Newer than anything the server has, even if this computer's clock is behind.
  const updatedAtMs = Math.max(Date.now(), (row?.updatedAtMs ?? 0) + 1);
  const saved: WorkoutSplit = { ...split, updatedAtMs };
  await syncApi.pushSplits([{ id: saved.id, updatedAtMs, dataJson: JSON.stringify(saved) }]);
  return saved;
}

/** Delete for good (the phone deletes it on its next sync). */
export async function deleteSplit(id: string): Promise<void> {
  const now = Date.now();
  await syncApi.pushSplits([{ id, updatedAtMs: now, dataJson: null, deletedAtMs: now }]);
}

/** Make a split the one the app trains from (null: none). */
export async function setActiveSplit(id: string | null): Promise<void> {
  await updateOwnProfile(() => ({ activeSplitId: id }), { bump: true });
}

import { syncApi } from "@logit/core/api/syncApi";
import { libraryApi } from "@logit/core/api/libraryApi";
import {
  libraryItemFromJson,
  libraryItemToJson,
  logitEntries,
  mergeLibrary,
  type LibraryEntry,
  type LibraryItem,
} from "@logit/core/domain/library";
import type { CoachProgram } from "@logit/core/domain/CoachProgram";

/**
 * The web's view of your library: LogIt's bank, your own items (synced; Pro and Studio)
 * and what your coaches share with you. Phone plugin packs aren't on the web.
 */
export type WebLibrary = {
  entries: LibraryEntry[];
  /** Your own items, before merging (a coach's item of the same name never hides these). */
  own: LibraryEntry[];
  /** Ids of your own items you share with your clients (coaches). */
  sharedIds: Set<string>;
};

export async function loadWebLibrary(): Promise<WebLibrary> {
  const [{ exercises }, fromCoaches] = await Promise.all([
    syncApi.pullLibrary(0),
    libraryApi.getShared().catch(() => ({ items: [] })),
  ]);

  const own: LibraryEntry[] = [];
  const sharedIds = new Set<string>();
  for (const row of exercises) {
    if (row.deletedAtMs || !row.dataJson) continue;
    const parsed = libraryItemFromJson(row.dataJson, row.kind);
    if (!parsed) continue;
    own.push({ ...parsed, source: "mine" } as LibraryEntry);
    if (row.shared) sharedIds.add(parsed.item.id);
  }

  const coach: LibraryEntry[] = [];
  for (const i of fromCoaches.items) {
    const parsed = libraryItemFromJson(i.dataJson, i.kind);
    if (parsed) coach.push({ ...parsed, source: "coach", coach: { coachId: i.coachId, coachName: i.coachName } } as LibraryEntry);
  }

  return { entries: mergeLibrary([logitEntries(), own, coach]), own, sharedIds };
}

/** Saves one of your own items (new or changed). */
export async function saveLibraryItem(entry: LibraryItem): Promise<LibraryItem> {
  const now = Date.now();
  const stamped = { ...entry, item: { ...entry.item, updatedAtMs: now } } as LibraryItem;
  const createdAtMs = (stamped.item as { createdAtMs?: number }).createdAtMs ?? now;
  await syncApi.pushExercises([{ id: stamped.item.id, createdAtMs, dataJson: libraryItemToJson(stamped) }]);
  return stamped;
}

export async function deleteLibraryItem(id: string): Promise<void> {
  await syncApi.pushExercises([{ id, createdAtMs: 0, dataJson: null, deletedAtMs: Date.now() }]);
}

/** The program names that use an item: strength by exercise id or name, cardio by name. */
export function programsUsing(entry: LibraryEntry, programs: CoachProgram[]): CoachProgram[] {
  const name = entry.item.name.trim().toLowerCase();
  return programs.filter((p) =>
    p.weeks.some((w) =>
      w.days.some((d) =>
        d.blocks.some((b) =>
          entry.kind === "strength"
            ? b.type === "strength" && (b.exerciseId === entry.item.id || b.exerciseName.trim().toLowerCase() === name)
            : entry.kind === "cardio" && b.type === "cardio" && b.activityName.trim().toLowerCase() === name,
        ),
      ),
    ),
  );
}

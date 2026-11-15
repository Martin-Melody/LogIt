import type { RemoteExercise } from "@logit/core/api/syncApi";
import type { SharedLibraryItem } from "@logit/core/api/libraryApi";
import type { ExerciseRepo } from "@logit/core/data/exercise/exerciseRepo";
import type { CoachLibraryItem, LibraryRepo } from "@logit/core/data/libraryRepo";
import { libraryItemFromJson } from "@logit/core/domain/library";

/**
 * Applying what the server sent to the phone's library. Kept apart from syncService.ts
 * (which needs the whole app to load) so it can be tested against the real repos.
 */

/** Newer wins. Items from before the library have no updatedAtMs and count as 0, so a
 * server copy only replaces a local one when someone has edited it since. */
function remoteIsNewer(remote: { updatedAtMs?: number }, local: { updatedAtMs?: number } | null | undefined): boolean {
  if (!local) return true;
  return (remote.updatedAtMs ?? 0) > (local.updatedAtMs ?? 0);
}

/** Your own items from /sync/exercises?kinds=all. Returns the rows that failed. */
export async function mergeOwnLibrary(
  remote: RemoteExercise[],
  exercises: ExerciseRepo,
  library: LibraryRepo,
  onError: (e: unknown) => void = () => {},
): Promise<void> {
  for (const entry of remote) {
    try {
      if (entry.deletedAtMs) {
        if (entry.kind === "cardio" || entry.kind === "mobility") await library.removeOwn(entry.id);
        else if ((await exercises.getById(entry.id))?.isCore === false) await exercises.remove(entry.id);
        continue;
      }
      const parsed = entry.dataJson ? libraryItemFromJson(entry.dataJson, entry.kind) : null;
      if (!parsed) continue;
      if (parsed.kind === "strength") {
        const local = await exercises.getById(parsed.item.id);
        if (local?.isCore) continue;
        if (remoteIsNewer(parsed.item, local)) await exercises.saveExercise(parsed.item);
      } else {
        const local = await library.getOwn(parsed.item.id);
        if (remoteIsNewer(parsed.item, local?.item)) await library.saveOwn(parsed);
      }
    } catch (e) {
      onError(e);
    }
  }
}

/** What your coaches share, from /coach/library/shared. Replaces the local copy whole. */
export async function replaceCoachLibrary(items: SharedLibraryItem[], library: LibraryRepo): Promise<void> {
  const parsed: CoachLibraryItem[] = [];
  for (const i of items) {
    const item = libraryItemFromJson(i.dataJson, i.kind);
    if (!item) continue;
    parsed.push({ ...item, coach: { coachId: i.coachId, coachName: i.coachName }, viaProgram: i.viaProgram } as CoachLibraryItem);
  }
  await library.replaceFromCoaches(parsed);
}

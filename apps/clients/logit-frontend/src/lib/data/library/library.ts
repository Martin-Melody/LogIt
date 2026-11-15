import type { Exercise } from "@logit/core/domain/exercise";
import type { CardioActivity } from "@logit/core/domain/cardioActivity";
import { BUILTIN_CARDIO } from "@logit/core/domain/cardioActivity";
import { BUILTIN_MOBILITY_DRILLS, type MobilityDrill } from "@logit/core/domain/mobilityDrill";
import {
  mergeLibrary,
  type LibraryEntry,
  type LibraryKind,
} from "@logit/core/domain/library";
import type { OwnLibraryItem } from "@logit/core/data/libraryRepo";
import { getExerciseRepo, getLibraryRepo } from "$lib/data/repoProvider";
import { listInstalledPluginManifests } from "$lib/plugins/catalog";
import { packMobilityDrills } from "$lib/plugins/mobilityPackStore";
import { pushDeletedLibraryItem, pushLibraryItem } from "$lib/sync/syncService";
import { nowMs } from "@logit/core/domain/time";

/**
 * The phone's library: LogIt's bank, your own items, your coaches' shared items and
 * installed packs, one entry per name (see mergeLibrary for who wins).
 */

function strengthSource(e: Exercise): LibraryEntry["source"] {
  if (e.isCore) return "logit";
  if (e.id.startsWith("pack:")) return "pack";
  return "mine";
}

async function enabledMobilityPackDrills(): Promise<MobilityDrill[]> {
  const installed = await listInstalledPluginManifests().catch(() => []);
  const ids = new Set(
    installed.filter((p) => p.enabled && p.manifest.family === "mobility-pack").map((p) => p.manifest.id),
  );
  return ids.size === 0 ? [] : packMobilityDrills(ids);
}

export async function loadLibrary(kind?: LibraryKind): Promise<LibraryEntry[]> {
  const groups: LibraryEntry[][] = [];
  const library = getLibraryRepo();

  if (!kind || kind === "strength") {
    // Built-ins come from the database, not the bank, so your machines and muscle edits show.
    const exercises = await getExerciseRepo().list({ limit: 5000 });
    groups.push(exercises.map((item) => ({ kind: "strength", source: strengthSource(item), item })));
  }
  if (!kind || kind === "cardio") {
    groups.push(BUILTIN_CARDIO.map((item) => ({ kind: "cardio", source: "logit", item })));
  }
  if (!kind || kind === "mobility") {
    groups.push(BUILTIN_MOBILITY_DRILLS.map((item) => ({ kind: "mobility", source: "logit", item })));
    groups.push((await enabledMobilityPackDrills()).map((item) => ({ kind: "mobility", source: "pack", item })));
  }

  const own = await library.listOwn().catch(() => []);
  groups.push(own.filter((e) => !kind || e.kind === kind).map((e) => ({ ...e, source: "mine" }) as LibraryEntry));

  const fromCoaches = await library.listFromCoaches().catch(() => []);
  groups.push(
    fromCoaches
      .filter((e) => !kind || e.kind === kind)
      .map((e) => ({ kind: e.kind, item: e.item, source: "coach", coach: e.coach }) as LibraryEntry),
  );

  return mergeLibrary(groups);
}

/** Mobility drills for pickers, sorted by name. */
export async function mobilityCatalog(): Promise<MobilityDrill[]> {
  return (await loadLibrary("mobility")).map((e) => e.item as MobilityDrill);
}

/** Cardio activities for pickers, sorted by name. */
export async function cardioCatalog(): Promise<CardioActivity[]> {
  return (await loadLibrary("cardio")).map((e) => e.item as CardioActivity);
}

/** Saves one of your own cardio activities or mobility drills and syncs it. */
export async function saveOwnItem(entry: OwnLibraryItem): Promise<OwnLibraryItem> {
  const stamped = { ...entry, item: { ...entry.item, updatedAtMs: nowMs() } } as OwnLibraryItem;
  await getLibraryRepo().saveOwn(stamped);
  pushLibraryItem(stamped);
  return stamped;
}

/** Deletes one of your own cardio activities or mobility drills. Past workouts keep the name. */
export async function deleteOwnItem(id: string): Promise<void> {
  await getLibraryRepo().removeOwn(id);
  pushDeletedLibraryItem(id);
}

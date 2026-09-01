import { browser } from "$app/environment";
import type { Exercise } from "@logit/core/domain/exercise";
import {
  parseExercisePack,
  packExerciseId,
  type ExercisePack,
} from "@logit/core/plugins/exercisePack";
import { verifyIntegrity } from "@logit/core/plugins/integrity";
import type { PluginManifest } from "./types";

/**
 * Local storage for installed content packs. Content plugins carry no code, so
 * unlike bundles they are fetched once, hash-verified, parsed, and the *parsed
 * result* is what we keep. Nothing here ever executes.
 *
 * Pack data is device-local and re-installable — it is deliberately not synced.
 */

const STORAGE_KEY = "logit:plugins:packs:v1";

type StoredPacks = Record<string, ExercisePack>;

function readAll(): StoredPacks {
  if (!browser) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as StoredPacks) : {};
  } catch {
    return {};
  }
}

function writeAll(packs: StoredPacks): void {
  if (!browser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
}

function artifactUrl(manifest: PluginManifest): string | null {
  const d = manifest.distribution;
  if (d.origin === "url" || d.origin === "activitypub" || d.origin === "manual") {
    return d.bundleUrl ?? null;
  }
  return null;
}

/**
 * Verify, parse, and store an exercise pack. For `inline` packs the data is
 * already in the manifest; otherwise the data file is fetched and, if the
 * manifest carries an `integrity` hash, checked against it. Throws (leaving
 * nothing stored) on any failure.
 */
export async function fetchAndStoreExercisePack(manifest: PluginManifest): Promise<ExercisePack> {
  const pack =
    manifest.distribution.origin === "inline"
      ? parseExercisePack(manifest.distribution.data, manifest.id)
      : await downloadAndParsePack(manifest);

  const all = readAll();
  all[manifest.id] = pack;
  writeAll(all);
  return pack;
}

async function downloadAndParsePack(manifest: PluginManifest): Promise<ExercisePack> {
  const url = artifactUrl(manifest);
  if (!url) {
    throw new Error("This exercise pack has no data file to install.");
  }

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not download the pack (${res.status}).`);
  }
  const text = await res.text();

  if (manifest.integrity) {
    const ok = await verifyIntegrity(text, manifest.integrity);
    if (!ok) {
      throw new Error("Pack failed its integrity check — the file does not match the manifest.");
    }
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Pack data file is not valid JSON.");
  }

  return parseExercisePack(json, manifest.id);
}

export function removeStoredPack(pluginId: string): void {
  const all = readAll();
  if (pluginId in all) {
    delete all[pluginId];
    writeAll(all);
  }
}

export function getStoredPack(pluginId: string): ExercisePack | null {
  return readAll()[pluginId] ?? null;
}

/**
 * Materialise all stored packs whose id is in `enabledIds` into catalog
 * exercises. Ids are namespaced (`pack:<pluginId>:<slug>`) so they never
 * collide with core or user exercises.
 */
export function packExercises(enabledIds: ReadonlySet<string>): Exercise[] {
  const all = readAll();
  const out: Exercise[] = [];
  for (const [pluginId, pack] of Object.entries(all)) {
    if (!enabledIds.has(pluginId)) continue;
    if (!pack || !Array.isArray(pack.exercises)) continue; // tolerate a corrupt store
    for (const ex of pack.exercises) {
      out.push({
        id: packExerciseId(pluginId, ex.name),
        name: ex.name,
        notes: ex.notes,
        isCore: false,
        createdAtMs: 0,
        primaryMuscles: ex.primaryMuscles,
        secondaryMuscles: ex.secondaryMuscles,
        exerciseType: ex.exerciseType,
      });
    }
  }
  return out;
}

import type { Exercise } from "@logit/core/domain/exercise";
import { buildExercisePack } from "@logit/core/plugins/exercisePack";
import { createId } from "@logit/core/domain/ids";
import { saveTextFile } from "$lib/platform/fileSave";
import type { PluginManifest } from "./types";

/**
 * Turn a set of exercises into a self-contained `.logit-pack.json` file and
 * hand it to the user (native share sheet / browser download). The file is a
 * plugin manifest with an `inline` distribution — one file is the whole pack,
 * installable from Plugins → Add → File.
 */
export async function exportExercisesAsPack(
  packName: string,
  exercises: Exercise[],
): Promise<void> {
  const name = packName.trim();
  if (!name) throw new Error("Give the pack a name.");
  if (exercises.length === 0) throw new Error("Nothing to export.");

  const pluginId = `local.exercise-pack.${createId()}`;
  const pack = buildExercisePack(
    pluginId,
    exercises.map((e) => ({
      name: e.name,
      primaryMuscles: e.primaryMuscles ?? [],
      secondaryMuscles: e.secondaryMuscles ?? [],
      exerciseType: e.exerciseType ?? "normal",
      notes: e.notes ?? null,
    })),
  );

  const manifest: PluginManifest = {
    id: pluginId,
    family: "exercise-pack",
    name,
    description: `${pack.exercises.length} ${pack.exercises.length === 1 ? "exercise" : "exercises"}`,
    version: "1.0.0",
    distribution: { origin: "inline", data: pack },
    capabilities: [
      { family: "exercise-pack", exercisePackId: pluginId, exerciseCount: pack.exercises.length },
    ],
  };

  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "pack";
  await saveTextFile(`${slug}.logit-pack.json`, JSON.stringify(manifest, null, 2));
}

/**
 * Genuinely user-authored exercises — excludes built-ins (and their edited
 * overlays, which keep `isCore`) and installed exercise-pack items. Works
 * across the localStorage repo (`ex_*` ids) and the SQLite repo (`exdb_*` ids).
 */
export function isUserExercise(e: Exercise): boolean {
  return !e.isCore && !e.id.startsWith("pack:");
}

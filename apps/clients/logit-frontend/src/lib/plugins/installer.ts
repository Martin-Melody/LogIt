import { installPlugin } from "./catalog";
import { fetchAndStoreExercisePack } from "./packStore";
import type { PluginManifest } from "./types";

/**
 * Install a plugin from its manifest, doing whatever fetch/verify work the
 * family needs before the install is recorded.
 *
 * - Content packs (`exercise-pack`): fetch the data file, verify its integrity,
 *   parse it, and store the parsed result. Nothing is recorded if any step
 *   fails.
 * - Code plugins: just record the manifest. The bundle is loaded lazily by the
 *   runtime, and only when Restricted Mode is off. (Bundle hash-verification at
 *   install time lands in a later slice.)
 */
export async function installPluginFromManifest(
  manifest: PluginManifest,
  enabled = true,
): Promise<void> {
  // Inline distribution embeds an artifact in the manifest — only ever allowed
  // for content families, never executable code.
  if (manifest.distribution.origin === "inline" && manifest.family !== "exercise-pack") {
    throw new Error("Only exercise packs can be installed from an inline manifest.");
  }

  if (manifest.family === "exercise-pack") {
    await fetchAndStoreExercisePack(manifest);
  }
  await installPlugin(manifest, enabled);
}

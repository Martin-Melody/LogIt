import { installPlugin } from "./catalog";
import { fetchAndStoreExercisePack } from "./packStore";
import { fetchAndStoreBundle, storeBundleMeta } from "./bundleStore";
import { isSandboxedFamily, runSandboxMeta } from "./sandboxedPlugin";
import type { PluginManifest } from "./types";

/**
 * Install a plugin from its manifest, doing whatever fetch/verify work the
 * family needs before the install is recorded. Nothing is recorded if any step
 * fails.
 *
 * - Content packs (`exercise-pack`): fetch the data file, verify its integrity,
 *   parse it, and store the parsed result.
 * - Code plugins: fetch the bundle, verify its integrity, and store the source
 *   text locally. It is only ever run inside the interpreter sandbox, and only
 *   when Restricted Mode is off.
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
  } else if (isSandboxedFamily(manifest.family)) {
    const source = await fetchAndStoreBundle(manifest);
    // Cache the plugin's metadata now so listing it later needs no VM.
    const meta = await runSandboxMeta(source, manifest.family);
    if (meta) storeBundleMeta(manifest.id, meta);
  }
  // Widgets still load their bundle lazily by URL — Phase 6.

  await installPlugin(manifest, enabled);
}

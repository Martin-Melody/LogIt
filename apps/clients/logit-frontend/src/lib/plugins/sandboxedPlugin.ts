import { extractEntryExport } from "@logit/core/plugins/sandboxProtocol";
import {
  getStoredBundleMeta,
  getStoredBundleSource,
  type BundleMeta,
} from "./bundleStore";
import { runInSandbox } from "./sandbox";
import { isCommunityPluginsEnabled } from "./settings";
import type { InstalledPlugin, PluginFamily } from "./types";

/**
 * Families whose plugins run in the interpreter sandbox: all pure-function
 * families. Widgets (Decision 4 compute/view split) are the last holdout and
 * still use the legacy loader.
 */
export const SANDBOXED_FAMILIES: ReadonlySet<PluginFamily> = new Set([
  "progression-algorithm",
  "analytics",
  "nutrition-algorithm",
  "nutrition-analytics",
]);

export function isSandboxedFamily(family: PluginFamily): boolean {
  return SANDBOXED_FAMILIES.has(family);
}

function defaultEntry(family: PluginFamily): string {
  return family === "widget" ? "widget" : "algorithm";
}

export type { BundleMeta };

/** Run one `meta` call against a bundle source. Used at install to cache metadata. */
export async function runSandboxMeta(
  source: string,
  family: PluginFamily,
): Promise<BundleMeta | null> {
  const entry = extractEntryExport(source) ?? defaultEntry(family);
  try {
    const meta = await runInSandbox(source, entry, { kind: "meta" });
    return meta && typeof meta === "object" ? (meta as BundleMeta) : null;
  } catch {
    return null;
  }
}

/**
 * Plugin metadata: the copy cached at install time if present, else one live
 * sandbox call. null if disabled / not installed locally / invalid.
 */
export async function sandboxedMeta(plugin: InstalledPlugin): Promise<BundleMeta | null> {
  if (!isCommunityPluginsEnabled()) return null;
  const cached = getStoredBundleMeta(plugin.manifest.id);
  if (cached) return cached;
  const source = getStoredBundleSource(plugin.manifest.id);
  if (!source) return null;
  return runSandboxMeta(source, plugin.manifest.family);
}

/**
 * Returns an async function that runs one plugin method in a fresh sandbox VM.
 * Throws if community plugins are off, the plugin isn't installed locally, or
 * the sandbox rejects.
 */
export function sandboxedCall<T>(
  plugin: InstalledPlugin,
  method: string,
): (input: unknown) => Promise<T> {
  return async (input: unknown) => {
    if (!isCommunityPluginsEnabled()) {
      throw new Error("Community plugins are turned off.");
    }
    const source = getStoredBundleSource(plugin.manifest.id);
    if (!source) throw new Error(`${plugin.manifest.name} is not installed on this device.`);
    const entry = extractEntryExport(source) ?? defaultEntry(plugin.manifest.family);
    return (await runInSandbox(source, entry, { kind: "call", method, input })) as T;
  };
}

/**
 * List enabled, locally-installed plugins of one sandboxed family. Uses cached
 * metadata — no VM per entry. `build` turns (plugin, meta) into the shape the
 * caller wants, or returns null to skip.
 */
export async function listSandboxedPlugins<T>(
  installed: InstalledPlugin[],
  family: PluginFamily,
  hasCapability: (plugin: InstalledPlugin) => boolean,
  build: (plugin: InstalledPlugin, meta: BundleMeta) => T | null,
): Promise<T[]> {
  if (!isCommunityPluginsEnabled()) return [];
  const out: T[] = [];
  for (const plugin of installed) {
    if (!plugin.enabled || plugin.manifest.family !== family) continue;
    if (!hasCapability(plugin)) continue;
    if (!getStoredBundleSource(plugin.manifest.id)) continue;
    const meta = (await sandboxedMeta(plugin)) ?? {};
    const built = build(plugin, meta);
    if (built) out.push(built);
  }
  return out;
}

/** Find one enabled, locally-installed plugin of a sandboxed family by capability id. */
export function findSandboxedPlugin(
  installed: InstalledPlugin[],
  family: PluginFamily,
  matches: (plugin: InstalledPlugin) => boolean,
): InstalledPlugin | null {
  if (!isCommunityPluginsEnabled()) return null;
  return (
    installed.find(
      (p) => p.enabled && p.manifest.family === family && matches(p),
    ) ?? null
  );
}

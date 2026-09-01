import { extractEntryExport } from "@logit/core/plugins/sandboxProtocol";
import { getStoredBundleSource } from "./bundleStore";
import { runInSandbox } from "./sandbox";
import { isCommunityPluginsEnabled } from "./settings";
import type { InstalledPlugin, PluginFamily } from "./types";

/**
 * Families whose plugins run in the interpreter sandbox. Others (widgets, and
 * for now the remaining analytics/nutrition families) still use the legacy
 * loader — they migrate here in later slices.
 */
export const SANDBOXED_FAMILIES: ReadonlySet<PluginFamily> = new Set([
  "progression-algorithm",
]);

export function isSandboxedFamily(family: PluginFamily): boolean {
  return SANDBOXED_FAMILIES.has(family);
}

function defaultEntry(family: PluginFamily): string {
  return family === "widget" ? "widget" : "algorithm";
}

export type SandboxedMeta = {
  id?: string;
  name?: string;
  description?: string;
  author?: string;
  defaultState?: unknown;
  defaultPreferences?: unknown;
  preferencesSchema?: unknown;
  metricDefinitions?: unknown;
};

/** Read a plugin's metadata via one sandbox call. null if disabled/unavailable/invalid. */
export async function sandboxedMeta(plugin: InstalledPlugin): Promise<SandboxedMeta | null> {
  if (!isCommunityPluginsEnabled()) return null;
  const source = getStoredBundleSource(plugin.manifest.id);
  if (!source) return null;
  const entry = extractEntryExport(source) ?? defaultEntry(plugin.manifest.family);
  try {
    const meta = await runInSandbox(source, entry, { kind: "meta" });
    return meta && typeof meta === "object" ? (meta as SandboxedMeta) : null;
  } catch {
    return null;
  }
}

/**
 * Returns an async function that runs one plugin method in a fresh sandbox VM.
 * Throws if the plugin isn't installed locally or the sandbox rejects.
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

import { browser } from "$app/environment";
import { verifyIntegrity } from "@logit/core/plugins/integrity";
import { fetchWithTimeout } from "./net";
import type { PluginManifest } from "./types";

/**
 * Local storage for community code bundles. Unlike the live `import(url)` this
 * replaces, a bundle is fetched once at install, hash-verified against
 * `manifest.integrity`, and its *source text* kept locally — so it runs offline
 * afterwards and updates are an explicit, reviewable action.
 *
 * The source is only ever handed to the interpreter sandbox, never evaluated in
 * the app context. Alongside it we cache the plugin's metadata (one sandbox
 * `meta` call at install time) so listing plugins doesn't spin up a VM per entry.
 */

const STORAGE_KEY = "logit:plugins:bundles:v1";

/** Metadata read from a plugin at install time — see sandboxProtocol's `meta` op. */
export type BundleMeta = {
  id?: string;
  name?: string;
  description?: string;
  author?: string;
  defaultState?: unknown;
  defaultPreferences?: unknown;
  preferencesSchema?: unknown;
  metricDefinitions?: unknown;
  /** widget: declared data needs. */
  needs?: unknown;
};

type StoredBundle = {
  source: string;
  integrity?: string;
  fetchedAtMs: number;
  meta?: BundleMeta;
};

type StoredBundles = Record<string, StoredBundle>;

function readAll(): StoredBundles {
  if (!browser) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as StoredBundles) : {};
  } catch {
    return {};
  }
}

function writeAll(bundles: StoredBundles): void {
  if (!browser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bundles));
}

function bundleUrl(manifest: PluginManifest): string | null {
  const d = manifest.distribution;
  if (d.origin === "url" || d.origin === "activitypub" || d.origin === "manual") {
    return d.bundleUrl ?? null;
  }
  return null;
}

/**
 * Fetch, verify, and store a plugin's code bundle. Throws (storing nothing) if
 * there is no bundle URL, the download fails, or the integrity check fails.
 */
export async function fetchAndStoreBundle(manifest: PluginManifest): Promise<string> {
  const url = bundleUrl(manifest);
  if (!url) throw new Error("This plugin has no code bundle to install.");

  const res = await fetchWithTimeout(url, {
    headers: { Accept: "text/javascript, application/javascript" },
  });
  if (!res.ok) throw new Error(`Could not download the plugin (${res.status}).`);
  const source = await res.text();

  if (manifest.integrity) {
    const ok = await verifyIntegrity(source, manifest.integrity);
    if (!ok) {
      throw new Error("Plugin failed its integrity check — the bundle does not match the manifest.");
    }
  }

  const all = readAll();
  all[manifest.id] = { source, integrity: manifest.integrity, fetchedAtMs: Date.now() };
  writeAll(all);
  return source;
}

export function storeBundleMeta(pluginId: string, meta: BundleMeta): void {
  const all = readAll();
  const existing = all[pluginId];
  if (!existing) return;
  all[pluginId] = { ...existing, meta };
  writeAll(all);
}

export function getStoredBundleMeta(pluginId: string): BundleMeta | null {
  return readAll()[pluginId]?.meta ?? null;
}

export function getStoredBundleSource(pluginId: string): string | null {
  return readAll()[pluginId]?.source ?? null;
}

export function removeStoredBundle(pluginId: string): void {
  const all = readAll();
  if (pluginId in all) {
    delete all[pluginId];
    writeAll(all);
  }
}

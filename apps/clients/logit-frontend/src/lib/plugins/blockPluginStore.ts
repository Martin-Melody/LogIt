// Installed workout-block plugins' declarations (docs/plugin-workout-blocks.md). The renderer
// reads them here; installing a `workout-block` plugin fills this. Device-local, like content
// packs: blocks already logged carry their own shape, so history doesn't need it.
import { browser } from "$app/environment";
import { parseBlockDeclaration, type BlockDeclaration } from "@logit/core/domain/blockPlugin";
import { verifyIntegrity } from "@logit/core/plugins/integrity";
import { fetchWithTimeout } from "./net";
import type { PluginManifest } from "./types";

const STORAGE_KEY = "logit:plugins:workout-blocks:v1";

function readAll(): Record<string, BlockDeclaration> {
  if (!browser) return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, BlockDeclaration>;
  } catch {
    return {};
  }
}

/** Turned off in Plugins: kept, but not offered or run (set by the catalog). */
let isOff: (pluginId: string) => boolean = () => false;
export function setBlockPluginOffCheck(fn: (pluginId: string) => boolean): void {
  isOff = fn;
}

export function listBlockDeclarations(): BlockDeclaration[] {
  return Object.entries(readAll()).filter(([id]) => !isOff(id)).map(([, d]) => d);
}

export function getBlockDeclaration(pluginId: string): BlockDeclaration | null {
  return isOff(pluginId) ? null : (readAll()[pluginId] ?? null);
}

/** Install step: the declaration file, hash-checked and parsed (or inline in the manifest). */
export async function fetchAndStoreBlockDeclaration(manifest: PluginManifest): Promise<BlockDeclaration> {
  const d = manifest.distribution;
  if (d.origin === "inline") return saveBlockDeclaration(d.data, manifest.id);
  const url = d.origin === "url" || d.origin === "activitypub" || d.origin === "manual" ? d.bundleUrl : undefined;
  if (!url) throw new Error("This block has no file to install.");
  const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Couldn't download the block (${res.status}).`);
  const text = await res.text();
  if (manifest.integrity && !(await verifyIntegrity(text, manifest.integrity))) {
    throw new Error("The block failed its integrity check: the file doesn't match the manifest.");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The block's file isn't valid JSON.");
  }
  return saveBlockDeclaration(json, manifest.id);
}

/** Checks and keeps a declaration; throws the parser's readable error. */
export function saveBlockDeclaration(raw: unknown, pluginId: string): BlockDeclaration {
  const decl = parseBlockDeclaration(raw, pluginId);
  const all = readAll();
  all[pluginId] = decl;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return decl;
}

export function removeBlockDeclaration(pluginId: string): void {
  const all = readAll();
  delete all[pluginId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

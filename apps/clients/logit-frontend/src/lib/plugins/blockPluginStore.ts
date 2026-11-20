// Installed workout-block plugins' declarations (docs/plugin-workout-blocks.md). The renderer
// reads them here; installing a `workout-block` plugin fills this (build step 3). Device-local,
// like content packs: blocks already logged carry their own shape, so history doesn't need it.
import { browser } from "$app/environment";
import { parseBlockDeclaration, type BlockDeclaration } from "@logit/core/domain/blockPlugin";

const STORAGE_KEY = "logit:plugins:workout-blocks:v1";

function readAll(): Record<string, BlockDeclaration> {
  if (!browser) return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, BlockDeclaration>;
  } catch {
    return {};
  }
}

export function listBlockDeclarations(): BlockDeclaration[] {
  return Object.values(readAll());
}

export function getBlockDeclaration(pluginId: string): BlockDeclaration | null {
  return readAll()[pluginId] ?? null;
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

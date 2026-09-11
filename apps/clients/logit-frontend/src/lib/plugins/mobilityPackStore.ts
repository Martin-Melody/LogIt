import { browser } from "$app/environment";
import type { MobilityDrill } from "@logit/core/domain/mobilityDrill";
import {
  parseMobilityPack,
  packMobilityDrillId,
  type MobilityPack,
} from "@logit/core/plugins/mobilityPack";
import { verifyIntegrity } from "@logit/core/plugins/integrity";
import { fetchWithTimeout } from "./net";
import type { PluginManifest } from "./types";

/**
 * Local storage for installed mobility packs — the stretching counterpart of
 * packStore.ts. Content plugins carry no code, so the pack is fetched once,
 * hash-verified, parsed, and the parsed result is what we keep. Device-local
 * and re-installable; deliberately not synced.
 */

const STORAGE_KEY = "logit:plugins:mobility-packs:v1";

type StoredPacks = Record<string, MobilityPack>;

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

export async function fetchAndStoreMobilityPack(manifest: PluginManifest): Promise<MobilityPack> {
  const pack =
    manifest.distribution.origin === "inline"
      ? parseMobilityPack(manifest.distribution.data, manifest.id)
      : await downloadAndParsePack(manifest);

  const all = readAll();
  all[manifest.id] = pack;
  writeAll(all);
  return pack;
}

async function downloadAndParsePack(manifest: PluginManifest): Promise<MobilityPack> {
  const url = artifactUrl(manifest);
  if (!url) throw new Error("This mobility pack has no data file to install.");

  const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Could not download the pack (${res.status}).`);
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
  return parseMobilityPack(json, manifest.id);
}

export function removeStoredMobilityPack(pluginId: string): void {
  const all = readAll();
  if (pluginId in all) {
    delete all[pluginId];
    writeAll(all);
  }
}

export function getStoredMobilityPack(pluginId: string): MobilityPack | null {
  return readAll()[pluginId] ?? null;
}

/** Materialise all enabled mobility packs into catalog drills. */
export function packMobilityDrills(enabledIds: ReadonlySet<string>): MobilityDrill[] {
  const all = readAll();
  const out: MobilityDrill[] = [];
  for (const [pluginId, pack] of Object.entries(all)) {
    if (!enabledIds.has(pluginId)) continue;
    if (!pack || !Array.isArray(pack.drills)) continue;
    for (const d of pack.drills) {
      out.push({
        id: packMobilityDrillId(pluginId, d.name),
        name: d.name,
        area: d.area,
        defaultMetric: d.defaultMetric,
        perSide: d.perSide,
        cues: d.cues,
        notes: d.notes,
        isCore: false,
      });
    }
  }
  return out;
}

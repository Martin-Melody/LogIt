import type { MobilityDrill } from "@logit/core/domain/mobilityDrill";
import { BUILTIN_MOBILITY_DRILLS } from "@logit/core/domain/mobilityDrill";
import { listInstalledPluginManifests } from "$lib/plugins/catalog";
import { packMobilityDrills } from "$lib/plugins/mobilityPackStore";

/**
 * The Mobility-block drill catalog: the bundled seed list plus drills from any
 * installed, enabled mobility packs. Used for drill-name autocomplete and to
 * seed a block's metric / per-side defaults. A core drill always wins over a
 * pack drill with the same name.
 */
export async function getMobilityDrillCatalog(): Promise<MobilityDrill[]> {
  const installed = await listInstalledPluginManifests();
  const enabledIds = new Set(
    installed
      .filter((p) => p.enabled && p.manifest.family === "mobility-pack")
      .map((p) => p.manifest.id),
  );
  const packDrills = enabledIds.size === 0 ? [] : packMobilityDrills(enabledIds);

  const seen = new Set(BUILTIN_MOBILITY_DRILLS.map((d) => d.name.toLowerCase()));
  const merged = [
    ...BUILTIN_MOBILITY_DRILLS,
    ...packDrills.filter((d) => !seen.has(d.name.toLowerCase())),
  ];
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

export async function findMobilityDrill(nameOrId: string): Promise<MobilityDrill | undefined> {
  const q = nameOrId.toLowerCase().trim();
  const catalog = await getMobilityDrillCatalog();
  return catalog.find((d) => d.id === nameOrId || d.name.toLowerCase() === q);
}

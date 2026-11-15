import type { MobilityDrill } from "@logit/core/domain/mobilityDrill";
import { mobilityCatalog } from "$lib/data/library/library";

/**
 * The Mobility-block drill catalog: LogIt's drills, your own, your coach's and any
 * installed, enabled mobility packs, one per name (see loadLibrary). Used for drill-name
 * autocomplete and to seed a block's metric / per-side defaults.
 */
export async function getMobilityDrillCatalog(): Promise<MobilityDrill[]> {
  return mobilityCatalog();
}

export async function findMobilityDrill(nameOrId: string): Promise<MobilityDrill | undefined> {
  const q = nameOrId.toLowerCase().trim();
  const catalog = await getMobilityDrillCatalog();
  return catalog.find((d) => d.id === nameOrId || d.name.toLowerCase() === q);
}

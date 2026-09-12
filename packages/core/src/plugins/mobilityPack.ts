import type { MobilityArea } from "../domain/mobilityDrill";
import { MOBILITY_AREAS, mobilityDrillSlug } from "../domain/mobilityDrill";
import type { MobilityMetric } from "../domain/workout";

/**
 * Mobility pack — a content plugin, the stretching counterpart of an exercise
 * pack. Pure data: a list of drill definitions a user installs into their
 * Mobility-block catalog. No executable code, so it installs regardless of
 * Restricted Mode.
 */

export const MOBILITY_PACK_FORMAT_VERSION = 1 as const;

/** Hard cap so a hostile or broken pack can't blow up the catalog. */
export const MAX_PACK_DRILLS = 500;

const AREAS: ReadonlySet<string> = new Set<string>(MOBILITY_AREAS);
const METRICS: ReadonlySet<string> = new Set<MobilityMetric>(["hold", "reps"]);

export type MobilityPackDrill = {
  name: string;
  area: MobilityArea;
  defaultMetric: MobilityMetric;
  perSide: boolean;
  cues: string[];
  notes: string | null;
};

export type MobilityPack = {
  formatVersion: typeof MOBILITY_PACK_FORMAT_VERSION;
  pluginId: string;
  drills: MobilityPackDrill[];
};

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function coerceCues(raw: unknown, drillName: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`Drill "${drillName}": cues must be an array of strings.`);
  }
  return raw
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.trim())
    .slice(0, 6);
}

/**
 * Parse and validate a raw mobility-pack payload. Throws a human-readable error
 * on any structural problem. `expectedPluginId`, when given, must match the
 * pack's declared `pluginId`.
 */
export function parseMobilityPack(raw: unknown, expectedPluginId?: string): MobilityPack {
  if (!isObject(raw)) {
    throw new Error("Mobility pack must be a JSON object.");
  }
  if (raw.formatVersion !== MOBILITY_PACK_FORMAT_VERSION) {
    throw new Error(`Unsupported mobility pack format (expected ${MOBILITY_PACK_FORMAT_VERSION}).`);
  }
  if (!isNonEmptyString(raw.pluginId)) {
    throw new Error("Mobility pack is missing a pluginId.");
  }
  if (expectedPluginId && raw.pluginId !== expectedPluginId) {
    throw new Error(
      `Mobility pack pluginId "${raw.pluginId}" does not match manifest "${expectedPluginId}".`,
    );
  }
  if (!Array.isArray(raw.drills) || raw.drills.length === 0) {
    throw new Error("Mobility pack has no drills.");
  }
  if (raw.drills.length > MAX_PACK_DRILLS) {
    throw new Error(`Mobility pack exceeds the ${MAX_PACK_DRILLS}-drill limit.`);
  }

  const seen = new Set<string>();
  const drills: MobilityPackDrill[] = [];

  for (const entry of raw.drills) {
    if (!isObject(entry) || !isNonEmptyString(entry.name)) {
      throw new Error("Every drill needs a non-empty name.");
    }
    const name = entry.name.trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue; // silently drop in-pack duplicates
    seen.add(key);

    if (typeof entry.area !== "string" || !AREAS.has(entry.area)) {
      throw new Error(`Drill "${name}": unknown area "${String(entry.area)}".`);
    }
    const defaultMetric =
      entry.defaultMetric === undefined
        ? "hold"
        : typeof entry.defaultMetric === "string" && METRICS.has(entry.defaultMetric)
          ? (entry.defaultMetric as MobilityMetric)
          : (() => {
              throw new Error(`Drill "${name}": defaultMetric must be "hold" or "reps".`);
            })();

    drills.push({
      name,
      area: entry.area as MobilityArea,
      defaultMetric,
      perSide: entry.perSide === true,
      cues: coerceCues(entry.cues, name),
      notes: isNonEmptyString(entry.notes) ? entry.notes.trim() : null,
    });
  }

  if (drills.length === 0) {
    throw new Error("Mobility pack has no usable drills.");
  }

  return { formatVersion: MOBILITY_PACK_FORMAT_VERSION, pluginId: raw.pluginId, drills };
}

/** Stable, collision-resistant id for a pack-provided drill. */
export function packMobilityDrillId(pluginId: string, drillName: string): string {
  return `pack:${pluginId}:${mobilityDrillSlug(drillName)}`;
}

/** Build a mobility-pack payload from a set of drills (used by "export as pack"). */
export function buildMobilityPack(pluginId: string, drills: MobilityPackDrill[]): MobilityPack {
  return parseMobilityPack(
    { formatVersion: MOBILITY_PACK_FORMAT_VERSION, pluginId, drills },
    pluginId,
  );
}

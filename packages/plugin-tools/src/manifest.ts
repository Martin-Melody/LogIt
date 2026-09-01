/**
 * Standalone plugin-manifest validation for the registry linter. Mirrors the
 * app's `PluginManifest` contract (apps/.../lib/plugins/types.ts) — kept
 * separate on purpose so the linter has zero app dependencies.
 */

export const PLUGIN_FAMILIES = [
  "widget",
  "progression-algorithm",
  "analytics",
  "nutrition-algorithm",
  "nutrition-analytics",
  "exercise-pack",
] as const;
export type PluginFamily = (typeof PLUGIN_FAMILIES)[number];

/** Families that ship an executable code bundle (vs a data file). */
export const CODE_FAMILIES: ReadonlySet<PluginFamily> = new Set([
  "widget",
  "progression-algorithm",
  "analytics",
  "nutrition-algorithm",
  "nutrition-analytics",
]);

export type PluginManifest = {
  id: string;
  family: PluginFamily;
  name: string;
  description: string;
  version: string;
  author?: string;
  integrity?: string;
  minAppVersion?: string;
  homepageUrl?: string;
  sourceUrl?: string;
  distribution: Record<string, unknown>;
  capabilities: Array<Record<string, unknown>>;
};

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const CAPABILITY_ID_FIELD: Record<PluginFamily, string> = {
  widget: "widgetId",
  "progression-algorithm": "algorithmId",
  analytics: "analyticsId",
  "nutrition-algorithm": "algorithmId",
  "nutrition-analytics": "analyticsId",
  "exercise-pack": "exercisePackId",
};

export type ManifestCheck = {
  valid: boolean;
  errors: string[];
  manifest?: PluginManifest;
};

export function validateManifest(raw: unknown): ManifestCheck {
  const errors: string[] = [];
  const push = (m: string) => errors.push(m);

  if (!isObj(raw)) return { valid: false, errors: ["manifest is not a JSON object"] };

  if (!isStr(raw.id)) push("id: required non-empty string");
  if (!PLUGIN_FAMILIES.includes(raw.family as PluginFamily)) {
    push(`family: must be one of ${PLUGIN_FAMILIES.join(", ")}`);
  }
  if (!isStr(raw.name)) push("name: required non-empty string");
  if (typeof raw.description !== "string") push("description: required string");
  if (!isStr(raw.version)) push("version: required non-empty string");
  else if (!/^\d+\.\d+\.\d+/.test(raw.version)) push("version: should be semver-ish (x.y.z)");

  if (raw.integrity !== undefined && !/^sha256-[A-Za-z0-9+/=]+$/.test(String(raw.integrity))) {
    push("integrity: must be `sha256-<base64>`");
  }
  if (raw.minAppVersion !== undefined && !isStr(raw.minAppVersion)) {
    push("minAppVersion: must be a string");
  }

  // Distribution
  const d = raw.distribution;
  if (!isObj(d)) {
    push("distribution: required object");
  } else {
    const origin = d.origin;
    if (origin === "url") {
      if (!isStr(d.manifestUrl)) push("distribution.manifestUrl: required for origin 'url'");
      if (!isStr(d.bundleUrl)) push("distribution.bundleUrl: required (path to the bundle/data file)");
    } else if (origin === "inline") {
      if (d.data === undefined || d.data === null) push("distribution.data: required for origin 'inline'");
      if (raw.family !== "exercise-pack") push("distribution 'inline' is only allowed for exercise-pack");
    } else {
      push("distribution.origin: registry plugins must use 'url' (or 'inline' for packs)");
    }
  }

  // Capabilities
  if (!Array.isArray(raw.capabilities) || raw.capabilities.length === 0) {
    push("capabilities: required non-empty array");
  } else {
    const family = raw.family as PluginFamily;
    const idField = CAPABILITY_ID_FIELD[family];
    for (const [i, cap] of raw.capabilities.entries()) {
      if (!isObj(cap)) {
        push(`capabilities[${i}]: not an object`);
        continue;
      }
      if (cap.family !== family) push(`capabilities[${i}].family: must match manifest family "${family}"`);
      if (idField && !isStr(cap[idField])) push(`capabilities[${i}].${idField}: required non-empty string`);
      if (idField && isStr(cap[idField]) && isStr(raw.id) && cap[idField] !== raw.id) {
        push(`capabilities[${i}].${idField}: should equal the manifest id`);
      }
    }
  }

  return errors.length === 0
    ? { valid: true, errors, manifest: raw as PluginManifest }
    : { valid: false, errors };
}

import { browser } from "$app/environment";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { localWidgetRegistry } from "$lib/features/widgets/localWidgetRegistry";
import { createLocalAlgorithmRegistry } from "@logit/core/progression/localAlgorithmRegistry";
import { createLocalMobilityAlgorithmRegistry } from "@logit/core/progression/localMobilityAlgorithmRegistry";
import { createLocalMuscleGroupInsightAlgorithmRegistry } from "@logit/core/progression/localMuscleGroupInsightAlgorithmRegistry";
import { createLocalAnalyticsRegistry } from "@logit/core/progression/localAnalyticsRegistry";
import { createLocalNutritionAlgorithmRegistry } from "@logit/core/nutrition/algorithmRegistry";
import { createLocalNutritionAnalyticsRegistry } from "@logit/core/nutrition/analyticsRegistry";
import type { InstalledPlugin, PluginManifest } from "./types";
import { removeStoredPack } from "./packStore";
import { removeStoredMobilityPack } from "./mobilityPackStore";
import { removeStoredBundle } from "./bundleStore";
import { removeBlockDeclaration, setBlockPluginOffCheck } from "./blockPluginStore";

// Families that install from a fetched artifact (code bundle or pack data file)
// and therefore need a bundleUrl on the manifest.
const BUNDLED_BUNDLE_FAMILIES = new Set<PluginManifest["family"]>([
  "widget",
  "progression-algorithm",
  "mobility-progression",
  "analytics",
  "nutrition-algorithm",
  "nutrition-analytics",
  "exercise-pack",
  "mobility-pack",
  "muscle-group-insight",
]);

const INSTALLED_STORAGE_KEY = "logit:plugins:installed:v1";
const HOME_STORAGE_KEY = "logit:home-config:v1";

// A block plugin turned off in Plugins isn't offered or run (it stays installed).
setBlockPluginOffCheck((id) => loadInstalled().some((p) => p.manifest.id === id && !p.enabled));

function loadInstalled(): InstalledPlugin[] {
  if (!browser) return [];

  try {
    const raw = getAccountItem(INSTALLED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InstalledPlugin[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveInstalled(installed: InstalledPlugin[]): void {
  if (!browser) return;
  setAccountItem(INSTALLED_STORAGE_KEY, JSON.stringify(installed));
}

function validateInstallableManifest(manifest: PluginManifest): void {
  if (manifest.distribution.origin === "builtin") return;
  // Inline packs carry their data in the manifest — no artifact URL needed.
  if (manifest.distribution.origin === "inline") return;

  if (BUNDLED_BUNDLE_FAMILIES.has(manifest.family) && !manifest.distribution.bundleUrl) {
    throw new Error(
      `Plugin ${manifest.id} is missing a bundleUrl and cannot be installed yet.`,
    );
  }
}

function getWidgetCapability(manifest: PluginManifest) {
  return manifest.capabilities.find((cap) => cap.family === "widget");
}

function syncHomeWidgets(manifest: PluginManifest, action: "add" | "remove"): void {
  if (!browser) return;
  if (manifest.family !== "widget") return;

  const capability = getWidgetCapability(manifest);
  if (!capability || capability.family !== "widget") return;

  try {
    const raw = getAccountItem(HOME_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as { slots?: Array<{ id: string; enabled: boolean; orderIndex: number }> };
    if (!parsed || !Array.isArray(parsed.slots)) return;

    if (action === "remove") {
      const next = parsed.slots.filter((slot) => slot.id !== capability.widgetId);
      setAccountItem(HOME_STORAGE_KEY, JSON.stringify({ slots: next }));
      return;
    }

    const existing = parsed.slots.find((slot) => slot.id === capability.widgetId);
    if (existing) {
      return;
    }

    const nextOrder =
      parsed.slots.length === 0
        ? 0
        : Math.max(...parsed.slots.map((slot) => slot.orderIndex)) + 1;

    parsed.slots.push({
      id: capability.widgetId,
      enabled: true,
      orderIndex: nextOrder,
    });
    setAccountItem(HOME_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore malformed home config; the home store will repair it on load.
  }
}

function makeWidgetManifest(): PluginManifest[] {
  return localWidgetRegistry.list().map((widget) => ({
    id: `builtin.widget.${widget.id}`,
    family: "widget",
    name: widget.label,
    description: widget.description,
    version: "1.0.0",
    author: "logit",
    distribution: { origin: "builtin" },
    capabilities: [
      {
        family: "widget",
        widgetId: widget.id,
        slot: "home",
        defaultEnabled: widget.defaultEnabled,
        defaultOrder: widget.defaultOrder,
      },
    ],
  }));
}

async function makeProgressionManifests(): Promise<PluginManifest[]> {
  const registry = createLocalAlgorithmRegistry();
  const algorithms = await registry.list();

  return algorithms.map((algo) => ({
    id: `builtin.progression.${algo.id}`,
    family: "progression-algorithm",
    name: algo.name,
    description: algo.description,
    version: "1.0.0",
    author: algo.author ?? "logit",
    distribution: { origin: "builtin" },
    capabilities: [{ family: "progression-algorithm", algorithmId: algo.id }],
  }));
}

async function makeMobilityProgressionManifests(): Promise<PluginManifest[]> {
  const algorithms = await createLocalMobilityAlgorithmRegistry().list();
  return algorithms.map((algo) => ({
    id: `builtin.mobility-progression.${algo.id}`,
    family: "mobility-progression",
    name: algo.name,
    description: algo.description,
    version: "1.0.0",
    author: algo.author ?? "logit",
    distribution: { origin: "builtin" },
    capabilities: [{ family: "mobility-progression", algorithmId: algo.id }],
  }));
}

async function makeAnalyticsManifests(): Promise<PluginManifest[]> {
  const registry = createLocalAnalyticsRegistry();
  const plugins = await registry.list();

  return plugins.map((plugin) => ({
    id: `builtin.analytics.${plugin.id}`,
    family: "analytics",
    name: plugin.name,
    description: plugin.description,
    version: "1.0.0",
    author: plugin.author ?? "logit",
    distribution: { origin: "builtin" },
    capabilities: [{ family: "analytics", analyticsId: plugin.id }],
  }));
}

async function makeMuscleGroupInsightManifests(): Promise<PluginManifest[]> {
  const algorithms = await createLocalMuscleGroupInsightAlgorithmRegistry().list();
  return algorithms.map((algo) => ({
    id: `builtin.muscle-group-insight.${algo.id}`,
    family: "muscle-group-insight",
    name: algo.name,
    description: algo.description,
    version: "1.0.0",
    author: algo.author ?? "logit",
    distribution: { origin: "builtin" },
    capabilities: [{ family: "muscle-group-insight", algorithmId: algo.id }],
  }));
}

async function makeNutritionAlgorithmManifests(): Promise<PluginManifest[]> {
  const algorithms = await createLocalNutritionAlgorithmRegistry().list();
  return algorithms.map((algo) => ({
    id: `builtin.nutrition-algorithm.${algo.id}`,
    family: "nutrition-algorithm",
    name: algo.name,
    description: algo.description,
    version: "1.0.0",
    author: algo.author ?? "logit",
    distribution: { origin: "builtin" },
    capabilities: [{ family: "nutrition-algorithm", algorithmId: algo.id }],
  }));
}

async function makeNutritionAnalyticsManifests(): Promise<PluginManifest[]> {
  const plugins = await createLocalNutritionAnalyticsRegistry().list();
  return plugins.map((plugin) => ({
    id: `builtin.nutrition-analytics.${plugin.id}`,
    family: "nutrition-analytics",
    name: plugin.name,
    description: plugin.description,
    version: "1.0.0",
    author: plugin.author ?? "logit",
    distribution: { origin: "builtin" },
    capabilities: [{ family: "nutrition-analytics", analyticsId: plugin.id }],
  }));
}

export async function listBuiltinPluginManifests(): Promise<PluginManifest[]> {
  return [
    ...makeWidgetManifest(),
    ...(await makeProgressionManifests()),
    ...(await makeMobilityProgressionManifests()),
    ...(await makeAnalyticsManifests()),
    ...(await makeNutritionAlgorithmManifests()),
    ...(await makeNutritionAnalyticsManifests()),
    ...(await makeMuscleGroupInsightManifests()),
  ];
}

export async function listInstalledPluginManifests(): Promise<InstalledPlugin[]> {
  return loadInstalled();
}

export async function getInstalledPlugin(
  id: string,
): Promise<InstalledPlugin | null> {
  const installed = loadInstalled();
  return installed.find((plugin) => plugin.manifest.id === id) ?? null;
}

export async function listPluginManifests(): Promise<PluginManifest[]> {
  const installed = loadInstalled().map((plugin) => plugin.manifest);
  return [...(await listBuiltinPluginManifests()), ...installed];
}

export async function getPluginManifest(
  id: string,
): Promise<PluginManifest | null> {
  const builtins = await listBuiltinPluginManifests();
  const builtin = builtins.find((plugin) => plugin.id === id);
  if (builtin) return builtin;

  const installed = await getInstalledPlugin(id);
  return installed?.manifest ?? null;
}

/** A local change to the installed list, for syncing it (see pluginSync.ts). */
export type InstalledPluginChange =
  | { kind: "saved"; plugin: InstalledPlugin }
  | { kind: "removed"; id: string; createdAtMs: number; updatedAtMs: number };

let changeListener: ((change: InstalledPluginChange) => void) | null = null;

/** pluginSync registers here so installs, removals and switches reach your other devices. */
export function onInstalledPluginChange(listener: (change: InstalledPluginChange) => void): void {
  changeListener = listener;
}

/** `fromSync`: the change came from another device, so it isn't pushed back. */
export type InstallChangeOptions = {
  fromSync?: boolean;
  updatedAtMs?: number;
  source?: InstalledPlugin["source"];
};

export async function installPlugin(
  manifest: PluginManifest,
  enabled = true,
  opts: InstallChangeOptions = {},
): Promise<void> {
  validateInstallableManifest(manifest);

  const installed = loadInstalled();
  const existing = installed.find((plugin) => plugin.manifest.id === manifest.id);
  const now = Date.now();
  const next: InstalledPlugin = {
    manifest,
    enabled,
    installedAtMs: existing?.installedAtMs ?? now,
    updatedAtMs: opts.updatedAtMs ?? Math.max(now, (existing?.updatedAtMs ?? 0) + 1),
    source: opts.source ?? existing?.source ?? "registry",
  };
  const filtered = installed.filter((plugin) => plugin.manifest.id !== manifest.id);
  saveInstalled([...filtered, next]);
  syncHomeWidgets(manifest, "add");
  if (!opts.fromSync) changeListener?.({ kind: "saved", plugin: next });
}

export async function uninstallPlugin(id: string, opts: InstallChangeOptions = {}): Promise<void> {
  const installed = loadInstalled();
  const next = installed.filter((plugin) => plugin.manifest.id !== id);
  const removed = installed.find((plugin) => plugin.manifest.id === id) ?? null;
  saveInstalled(next);
  if (removed) {
    syncHomeWidgets(removed.manifest, "remove");
    if (removed.manifest.family === "exercise-pack") {
      removeStoredPack(id);
    } else if (removed.manifest.family === "mobility-pack") {
      removeStoredMobilityPack(id);
    } else if (removed.manifest.family === "workout-block") {
      removeBlockDeclaration(id);
    } else {
      removeStoredBundle(id);
    }
    if (!opts.fromSync) {
      changeListener?.({
        kind: "removed",
        id,
        createdAtMs: removed.installedAtMs,
        updatedAtMs: Math.max(Date.now(), (removed.updatedAtMs ?? 0) + 1),
      });
    }
  }
}

export async function setPluginEnabled(
  id: string,
  enabled: boolean,
  opts: InstallChangeOptions = {},
): Promise<void> {
  const installed = loadInstalled();
  let changed: InstalledPlugin | null = null;
  const next = installed.map((plugin) => {
    if (plugin.manifest.id !== id) return plugin;
    changed = {
      ...plugin,
      enabled,
      updatedAtMs: opts.updatedAtMs ?? Math.max(Date.now(), (plugin.updatedAtMs ?? 0) + 1),
    };
    return changed;
  });
  saveInstalled(next);
  if (changed && !opts.fromSync) changeListener?.({ kind: "saved", plugin: changed });
}

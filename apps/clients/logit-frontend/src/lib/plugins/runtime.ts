import { browser } from "$app/environment";
import type { WidgetDefinition } from "$lib/features/widgets/widget";
import { localWidgetRegistry } from "$lib/features/widgets/localWidgetRegistry";
import type { AlgorithmRegistry } from "@logit/core/progression/algorithmRegistry";
import type {
  ProgressionAlgorithm,
  ProgressionAlgorithmMeta,
  ProgressionOutput,
} from "@logit/core/domain/progression";
import { createLocalAlgorithmRegistry } from "$lib/progression/localAlgorithmRegistry";
import { createLocalAnalyticsRegistry } from "@logit/core/progression/localAnalyticsRegistry";
import { createLocalNutritionAlgorithmRegistry } from "@logit/core/nutrition/algorithmRegistry";
import { createLocalNutritionAnalyticsRegistry } from "@logit/core/nutrition/analyticsRegistry";
import { listInstalledPluginManifests } from "./catalog";
import { isCommunityPluginsEnabled } from "./settings";
import { getStoredBundleSource } from "./bundleStore";
import { sandboxedCall, sandboxedMeta } from "./sandboxedPlugin";
import {
  describePluginBundleContract,
  isPluginAlgorithm,
  isPluginAnalytics,
  isPluginNutritionAlgorithm,
  isPluginNutritionAnalytics,
  isPluginWidgetComponent,
  isPluginWidgetRenderer,
  resolvePluginBundleContract,
  resolvePluginBundleEntry,
  type PluginBundleContract,
  type PluginBundleModule,
} from "./bundle";
import WidgetHost from "./WidgetHost.svelte";
import type {
  AnalyticsPluginCapability,
  NutritionAlgorithmPluginCapability,
  NutritionAnalyticsPluginCapability,
  PluginCapability,
  PluginManifest,
  ProgressionAlgorithmPluginCapability,
  WidgetPluginCapability,
} from "./types";
import type { AnalyticsPlugin, AnalyticsPluginMeta, AnalyticsRegistry } from "@logit/core/domain/analytics";
import type {
  NutritionAlgorithm,
  NutritionAlgorithmMeta,
  NutritionAlgorithmRegistry,
} from "@logit/core/domain/nutritionAlgorithm";
import type {
  NutritionAnalyticsPlugin,
  NutritionAnalyticsPluginMeta,
  NutritionAnalyticsRegistry,
} from "@logit/core/domain/nutritionAnalytics";

export type RuntimeWidgetDefinition = WidgetDefinition & {
  source: "builtin" | "installed";
  pluginEnabled: boolean;
  bundleContract: PluginBundleContract | null;
};

export type BundleInspection = {
  bundleUrl: string | null;
  contract: PluginBundleContract | null;
  loadable: boolean;
  entryType:
    | "widget"
    | "progression-algorithm"
    | "analytics"
    | "nutrition-algorithm"
    | "nutrition-analytics"
    | "unknown"
    | null;
};

const moduleCache = new Map<string, Promise<PluginBundleModule | null>>();

function isWidgetCapability(
  capability: PluginCapability,
): capability is WidgetPluginCapability {
  return capability.family === "widget";
}

function isProgressionCapability(
  capability: PluginCapability,
): capability is ProgressionAlgorithmPluginCapability {
  return capability.family === "progression-algorithm";
}

function getWidgetCapability(manifest: PluginManifest): WidgetPluginCapability | null {
  return manifest.capabilities.find(isWidgetCapability) ?? null;
}

function getProgressionCapability(
  manifest: PluginManifest,
): ProgressionAlgorithmPluginCapability | null {
  return manifest.capabilities.find(isProgressionCapability) ?? null;
}

function isAnalyticsCapability(
  capability: PluginCapability,
): capability is AnalyticsPluginCapability {
  return capability.family === "analytics";
}

function getAnalyticsCapability(manifest: PluginManifest): AnalyticsPluginCapability | null {
  return manifest.capabilities.find(isAnalyticsCapability) ?? null;
}

function getNutritionAlgorithmCapability(
  manifest: PluginManifest,
): NutritionAlgorithmPluginCapability | null {
  return (
    (manifest.capabilities.find(
      (c) => c.family === "nutrition-algorithm",
    ) as NutritionAlgorithmPluginCapability | undefined) ?? null
  );
}

function getNutritionAnalyticsCapability(
  manifest: PluginManifest,
): NutritionAnalyticsPluginCapability | null {
  return (
    (manifest.capabilities.find(
      (c) => c.family === "nutrition-analytics",
    ) as NutritionAnalyticsPluginCapability | undefined) ?? null
  );
}

function getBundleUrl(manifest: PluginManifest): string | null {
  switch (manifest.distribution.origin) {
    case "builtin":
      return null;
    case "manual":
      return manifest.distribution.bundleUrl ?? null;
    case "url":
      return manifest.distribution.bundleUrl ?? null;
    case "activitypub":
      return manifest.distribution.bundleUrl ?? null;
    case "inline":
      return null;
  }
}

async function loadBundle(url: string): Promise<PluginBundleModule | null> {
  if (!browser) return null;

  // Restricted Mode: never execute a non-builtin bundle unless the user has
  // explicitly enabled community plugins. This is the hard trust gate — every
  // community code path (widgets, algorithms, analytics) funnels through here.
  if (!isCommunityPluginsEnabled()) return null;

  const cached = moduleCache.get(url);
  if (cached) return cached;

  const promise = import(/* @vite-ignore */ url)
    .then((module) => module as PluginBundleModule)
    .catch((error) => {
      console.warn("[plugin-runtime] failed to load bundle", url, error);
      return null;
    });

  moduleCache.set(url, promise);
  return promise;
}

function builtinWidgets(): RuntimeWidgetDefinition[] {
  return localWidgetRegistry.list().map((widget) => ({
    ...widget,
    source: "builtin",
    pluginEnabled: true,
    bundleContract: null,
  }));
}

async function installedWidgetDefinitions(): Promise<RuntimeWidgetDefinition[]> {
  const installed = await listInstalledPluginManifests();
  const widgets: RuntimeWidgetDefinition[] = [];

  for (const plugin of installed) {
    if (plugin.manifest.family !== "widget") continue;

    const capability = getWidgetCapability(plugin.manifest);
    if (!capability) continue;

    const bundleUrl = getBundleUrl(plugin.manifest);
    if (!bundleUrl) continue;

    const module = await loadBundle(bundleUrl);
    if (!module) continue;

    const contract = resolvePluginBundleContract(module, plugin.manifest);
    const entry = resolvePluginBundleEntry(module, contract);
    const component = isPluginWidgetComponent(entry)
      ? entry
      : isPluginWidgetRenderer(entry)
        ? WidgetHost
        : null;
    if (!component) continue;

    widgets.push({
      id: capability.widgetId,
      label: plugin.manifest.name,
      description: plugin.manifest.description,
      component,
      props: isPluginWidgetRenderer(entry) ? { renderHtml: entry.renderHtml } : undefined,
      defaultEnabled: capability.defaultEnabled,
      defaultOrder: capability.defaultOrder,
      source: "installed",
      pluginEnabled: plugin.enabled,
      bundleContract: contract,
    });
  }

  return widgets;
}

async function installedAlgorithms(): Promise<ProgressionAlgorithmMeta[]> {
  if (!isCommunityPluginsEnabled()) return [];
  const installed = await listInstalledPluginManifests();
  const algorithms: ProgressionAlgorithmMeta[] = [];

  for (const plugin of installed) {
    if (!plugin.enabled || plugin.manifest.family !== "progression-algorithm") continue;
    const capability = getProgressionCapability(plugin.manifest);
    if (!capability) continue;
    if (!getStoredBundleSource(plugin.manifest.id)) continue;

    algorithms.push({
      id: capability.algorithmId,
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
    });
  }

  return algorithms;
}

async function installedAlgorithmById(id: string): Promise<ProgressionAlgorithm | null> {
  if (!isCommunityPluginsEnabled()) return null;
  const installed = await listInstalledPluginManifests();
  const plugin = installed.find(
    (entry) =>
      entry.enabled &&
      entry.manifest.family === "progression-algorithm" &&
      getProgressionCapability(entry.manifest)?.algorithmId === id,
  );
  if (!plugin) return null;

  const meta = await sandboxedMeta(plugin);
  if (!meta) return null;

  const suggest = sandboxedCall<ProgressionOutput>(plugin, "suggest");

  return {
    id,
    name: plugin.manifest.name,
    description: plugin.manifest.description,
    author: plugin.manifest.author,
    defaultState: meta.defaultState ?? {},
    defaultPreferences: meta.defaultPreferences,
    preferencesSchema: meta.preferencesSchema as ProgressionAlgorithm["preferencesSchema"],
    suggest: (input) => suggest(input),
  };
}

async function installedAnalyticsList(): Promise<AnalyticsPluginMeta[]> {
  const installed = await listInstalledPluginManifests();
  const result: AnalyticsPluginMeta[] = [];

  for (const plugin of installed) {
    if (!plugin.enabled || plugin.manifest.family !== "analytics") continue;

    const capability = getAnalyticsCapability(plugin.manifest);
    if (!capability) continue;

    const bundleUrl = getBundleUrl(plugin.manifest);
    if (!bundleUrl) continue;

    const module = await loadBundle(bundleUrl);
    const contract = module ? resolvePluginBundleContract(module, plugin.manifest) : null;
    const entry = module ? resolvePluginBundleEntry(module, contract) : null;
    if (!isPluginAnalytics(entry)) continue;

    result.push({
      id: capability.analyticsId,
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
      metricDefinitions: entry.metricDefinitions,
    });
  }

  return result;
}

async function installedAnalyticsById(id: string): Promise<AnalyticsPlugin | null> {
  const installed = await listInstalledPluginManifests();
  const plugin = installed.find(
    (entry) =>
      entry.enabled &&
      entry.manifest.family === "analytics" &&
      getAnalyticsCapability(entry.manifest)?.analyticsId === id,
  );

  if (!plugin) return null;

  const bundleUrl = getBundleUrl(plugin.manifest);
  if (!bundleUrl) return null;

  const module = await loadBundle(bundleUrl);
  if (!module) return null;

  const contract = resolvePluginBundleContract(module, plugin.manifest);
  const entry = resolvePluginBundleEntry(module, contract);
  return isPluginAnalytics(entry) ? entry : null;
}

// ── Nutrition algorithms ─────────────────────────────────────────────────────

async function installedNutritionAlgorithms(): Promise<NutritionAlgorithmMeta[]> {
  const installed = await listInstalledPluginManifests();
  const out: NutritionAlgorithmMeta[] = [];
  for (const plugin of installed) {
    if (!plugin.enabled || plugin.manifest.family !== "nutrition-algorithm") continue;
    const capability = getNutritionAlgorithmCapability(plugin.manifest);
    const bundleUrl = getBundleUrl(plugin.manifest);
    if (!capability || !bundleUrl) continue;
    const module = await loadBundle(bundleUrl);
    const contract = module ? resolvePluginBundleContract(module, plugin.manifest) : null;
    const entry = module ? resolvePluginBundleEntry(module, contract) : null;
    if (!isPluginNutritionAlgorithm(entry)) continue;
    out.push({
      id: capability.algorithmId,
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
    });
  }
  return out;
}

async function installedNutritionAlgorithmById(id: string): Promise<NutritionAlgorithm | null> {
  const installed = await listInstalledPluginManifests();
  const plugin = installed.find(
    (p) =>
      p.enabled &&
      p.manifest.family === "nutrition-algorithm" &&
      getNutritionAlgorithmCapability(p.manifest)?.algorithmId === id,
  );
  if (!plugin) return null;
  const bundleUrl = getBundleUrl(plugin.manifest);
  if (!bundleUrl) return null;
  const module = await loadBundle(bundleUrl);
  if (!module) return null;
  const contract = resolvePluginBundleContract(module, plugin.manifest);
  const entry = resolvePluginBundleEntry(module, contract);
  return isPluginNutritionAlgorithm(entry) ? entry : null;
}

function nutritionAlgorithmRegistry(): NutritionAlgorithmRegistry {
  const builtin = createLocalNutritionAlgorithmRegistry();
  return {
    async list() {
      return [...(await builtin.list()), ...(await installedNutritionAlgorithms())];
    },
    async get(id: string) {
      return (await builtin.get(id)) ?? installedNutritionAlgorithmById(id);
    },
  };
}

// ── Nutrition analytics ──────────────────────────────────────────────────────

async function installedNutritionAnalytics(): Promise<NutritionAnalyticsPluginMeta[]> {
  const installed = await listInstalledPluginManifests();
  const out: NutritionAnalyticsPluginMeta[] = [];
  for (const plugin of installed) {
    if (!plugin.enabled || plugin.manifest.family !== "nutrition-analytics") continue;
    const capability = getNutritionAnalyticsCapability(plugin.manifest);
    const bundleUrl = getBundleUrl(plugin.manifest);
    if (!capability || !bundleUrl) continue;
    const module = await loadBundle(bundleUrl);
    const contract = module ? resolvePluginBundleContract(module, plugin.manifest) : null;
    const entry = module ? resolvePluginBundleEntry(module, contract) : null;
    if (!isPluginNutritionAnalytics(entry)) continue;
    out.push({
      id: capability.analyticsId,
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
      metricDefinitions: entry.metricDefinitions,
    });
  }
  return out;
}

async function installedNutritionAnalyticsById(id: string): Promise<NutritionAnalyticsPlugin | null> {
  const installed = await listInstalledPluginManifests();
  const plugin = installed.find(
    (p) =>
      p.enabled &&
      p.manifest.family === "nutrition-analytics" &&
      getNutritionAnalyticsCapability(p.manifest)?.analyticsId === id,
  );
  if (!plugin) return null;
  const bundleUrl = getBundleUrl(plugin.manifest);
  if (!bundleUrl) return null;
  const module = await loadBundle(bundleUrl);
  if (!module) return null;
  const contract = resolvePluginBundleContract(module, plugin.manifest);
  const entry = resolvePluginBundleEntry(module, contract);
  return isPluginNutritionAnalytics(entry) ? entry : null;
}

function nutritionAnalyticsRegistry(): NutritionAnalyticsRegistry {
  const builtin = createLocalNutritionAnalyticsRegistry();
  return {
    async list() {
      return [...(await builtin.list()), ...(await installedNutritionAnalytics())];
    },
    async get(id: string) {
      return (await builtin.get(id)) ?? installedNutritionAnalyticsById(id);
    },
  };
}

function analyticsRegistry(): AnalyticsRegistry {
  const builtin = createLocalAnalyticsRegistry();

  return {
    async list(): Promise<AnalyticsPluginMeta[]> {
      return [...(await builtin.list()), ...(await installedAnalyticsList())];
    },

    async get(id: string): Promise<AnalyticsPlugin | null> {
      const builtinPlugin = await builtin.get(id);
      if (builtinPlugin) return builtinPlugin;
      return installedAnalyticsById(id);
    },
  };
}

function algorithmRegistry(): AlgorithmRegistry {
  const builtin = createLocalAlgorithmRegistry();

  return {
    async list(): Promise<ProgressionAlgorithmMeta[]> {
      return [...(await builtin.list()), ...(await installedAlgorithms())];
    },

    async get(id: string): Promise<ProgressionAlgorithm | null> {
      const builtinAlgorithm = await builtin.get(id);
      if (builtinAlgorithm) return builtinAlgorithm;
      return installedAlgorithmById(id);
    },
  };
}

export async function inspectPluginBundle(
  manifest: PluginManifest,
): Promise<BundleInspection> {
  const bundleUrl = getBundleUrl(manifest);
  if (!bundleUrl) {
    return {
      bundleUrl: null,
      contract: null,
      loadable: false,
      entryType: null,
    };
  }

  const module = await loadBundle(bundleUrl);
  if (!module) {
    return {
      bundleUrl,
      contract: null,
      loadable: false,
      entryType: null,
    };
  }

  const contract = resolvePluginBundleContract(module, manifest);
  const entry = resolvePluginBundleEntry(module, contract);
  const entryType = isPluginWidgetComponent(entry)
    ? "widget"
    : isPluginWidgetRenderer(entry)
      ? "widget"
    : isPluginAlgorithm(entry)
      ? "progression-algorithm"
    : isPluginAnalytics(entry)
      ? "analytics"
    : isPluginNutritionAlgorithm(entry)
      ? "nutrition-algorithm"
    : isPluginNutritionAnalytics(entry)
      ? "nutrition-analytics"
      : contract?.family ?? "unknown";

  return {
    bundleUrl,
    contract,
    loadable: true,
    entryType,
  };
}

export function createPluginRuntime() {
  return {
    listWidgets: async (): Promise<RuntimeWidgetDefinition[]> => [
      ...builtinWidgets(),
      ...(await installedWidgetDefinitions()),
    ],
    getWidget: async (id: string): Promise<RuntimeWidgetDefinition | null> => {
      const builtin = builtinWidgets().find((widget) => widget.id === id);
      if (builtin) return builtin;

      const installed = await installedWidgetDefinitions();
      return installed.find((widget) => widget.id === id) ?? null;
    },
    algorithms: algorithmRegistry(),
    analytics: analyticsRegistry(),
    nutritionAlgorithms: nutritionAlgorithmRegistry(),
    nutritionAnalytics: nutritionAnalyticsRegistry(),
    describeBundle: describePluginBundleContract,
    inspectPluginBundle,
  };
}

export const pluginRuntime = createPluginRuntime();

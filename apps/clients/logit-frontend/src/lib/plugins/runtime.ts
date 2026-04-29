import { browser } from "$app/environment";
import type { WidgetDefinition } from "$lib/features/widgets/widget";
import { localWidgetRegistry } from "$lib/features/widgets/localWidgetRegistry";
import type { AlgorithmRegistry } from "$lib/progression/algorithmRegistry";
import type {
  ProgressionAlgorithm,
  ProgressionAlgorithmMeta,
} from "$lib/domain/progression";
import { createLocalAlgorithmRegistry } from "$lib/progression/localAlgorithmRegistry";
import { listInstalledPluginManifests } from "./catalog";
import {
  describePluginBundleContract,
  isPluginAlgorithm,
  isPluginWidgetComponent,
  isPluginWidgetRenderer,
  resolvePluginBundleContract,
  resolvePluginBundleEntry,
  type PluginBundleContract,
  type PluginBundleModule,
} from "./bundle";
import WidgetHost from "./WidgetHost.svelte";
import type {
  PluginCapability,
  PluginManifest,
  ProgressionAlgorithmPluginCapability,
  WidgetPluginCapability,
} from "./types";

export type RuntimeWidgetDefinition = WidgetDefinition & {
  source: "builtin" | "installed";
  pluginEnabled: boolean;
  bundleContract: PluginBundleContract | null;
};

export type BundleInspection = {
  bundleUrl: string | null;
  contract: PluginBundleContract | null;
  loadable: boolean;
  entryType: "widget" | "progression-algorithm" | "unknown" | null;
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
  }
}

async function loadBundle(url: string): Promise<PluginBundleModule | null> {
  if (!browser) return null;

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
  const installed = await listInstalledPluginManifests();
  const algorithms: ProgressionAlgorithmMeta[] = [];

  for (const plugin of installed) {
    if (!plugin.enabled || plugin.manifest.family !== "progression-algorithm") continue;

    const capability = getProgressionCapability(plugin.manifest);
    if (!capability) continue;

    const bundleUrl = getBundleUrl(plugin.manifest);
    if (!bundleUrl) continue;

    const module = await loadBundle(bundleUrl);
    const contract = module ? resolvePluginBundleContract(module, plugin.manifest) : null;
    const entry = module ? resolvePluginBundleEntry(module, contract) : null;
    const algorithm = isPluginAlgorithm(entry) ? entry : null;
    if (!algorithm) continue;

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
  const installed = await listInstalledPluginManifests();
  const plugin = installed.find(
    (entry) =>
      entry.enabled &&
      entry.manifest.family === "progression-algorithm" &&
      getProgressionCapability(entry.manifest)?.algorithmId === id,
  );

  if (!plugin) return null;

  const bundleUrl = getBundleUrl(plugin.manifest);
  if (!bundleUrl) return null;

  const module = await loadBundle(bundleUrl);
  if (!module) return null;

  const contract = resolvePluginBundleContract(module, plugin.manifest);
  const entry = resolvePluginBundleEntry(module, contract);
  return isPluginAlgorithm(entry) ? entry : null;
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
    describeBundle: describePluginBundleContract,
    inspectPluginBundle,
  };
}

export const pluginRuntime = createPluginRuntime();

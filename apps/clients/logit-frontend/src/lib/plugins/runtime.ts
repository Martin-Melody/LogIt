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
import {
  findSandboxedPlugin,
  listSandboxedPlugins,
  sandboxedCall,
  sandboxedMeta,
} from "./sandboxedPlugin";
import WidgetCard from "$lib/features/widgets/render/WidgetCard.svelte";
import type {
  WidgetDataNeed,
  WidgetPlugin,
  WidgetView,
} from "@logit/core/plugins/widgetView";
import type {
  AnalyticsPluginCapability,
  NutritionAlgorithmPluginCapability,
  NutritionAnalyticsPluginCapability,
  PluginCapability,
  PluginManifest,
  ProgressionAlgorithmPluginCapability,
  WidgetPluginCapability,
} from "./types";
import type {
  AnalyticsOutput,
  AnalyticsPlugin,
  AnalyticsPluginMeta,
  AnalyticsRegistry,
} from "@logit/core/domain/analytics";
import type {
  NutritionAlgorithm,
  NutritionAlgorithmMeta,
  NutritionAlgorithmOutput,
  NutritionAlgorithmRegistry,
} from "@logit/core/domain/nutritionAlgorithm";
import type {
  NutritionAnalyticsOutput,
  NutritionAnalyticsPlugin,
  NutritionAnalyticsPluginMeta,
  NutritionAnalyticsRegistry,
} from "@logit/core/domain/nutritionAnalytics";

export type RuntimeWidgetDefinition = WidgetDefinition & {
  source: "builtin" | "installed";
  pluginEnabled: boolean;
};

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

function builtinWidgets(): RuntimeWidgetDefinition[] {
  return localWidgetRegistry.list().map((widget) => ({
    ...widget,
    source: "builtin",
    pluginEnabled: true,
  }));
}

const WIDGET_NEEDS: ReadonlySet<WidgetDataNeed> = new Set([
  "workouts",
  "exercises",
  "session",
  "todaysPlan",
  "progressionTargets",
  "nutrition",
  "bodyweight",
]);

async function installedWidgetDefinitions(): Promise<RuntimeWidgetDefinition[]> {
  const installed = await listInstalledPluginManifests();
  return listSandboxedPlugins(
    installed,
    "widget",
    (p) => !!getWidgetCapability(p.manifest),
    (plugin, meta): RuntimeWidgetDefinition => {
      const cap = getWidgetCapability(plugin.manifest)!;
      const compute = sandboxedCall<WidgetView>(plugin, "compute");
      const widgetPlugin: WidgetPlugin = {
        id: cap.widgetId,
        name: plugin.manifest.name,
        description: plugin.manifest.description,
        needs: (Array.isArray(meta.needs) ? meta.needs : []).filter(
          (n): n is WidgetDataNeed => typeof n === "string" && WIDGET_NEEDS.has(n as WidgetDataNeed),
        ),
        compute: (input) => compute(input),
      };
      return {
        id: cap.widgetId,
        label: plugin.manifest.name,
        description: plugin.manifest.description,
        component: WidgetCard,
        props: { plugin: widgetPlugin },
        defaultEnabled: cap.defaultEnabled,
        defaultOrder: cap.defaultOrder,
        source: "installed",
        pluginEnabled: plugin.enabled,
      };
    },
  );
}

async function installedAlgorithms(): Promise<ProgressionAlgorithmMeta[]> {
  const installed = await listInstalledPluginManifests();
  return listSandboxedPlugins(
    installed,
    "progression-algorithm",
    (p) => !!getProgressionCapability(p.manifest),
    (plugin) => ({
      id: getProgressionCapability(plugin.manifest)!.algorithmId,
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
    }),
  );
}

async function installedAlgorithmById(id: string): Promise<ProgressionAlgorithm | null> {
  const installed = await listInstalledPluginManifests();
  const plugin = findSandboxedPlugin(
    installed,
    "progression-algorithm",
    (p) => getProgressionCapability(p.manifest)?.algorithmId === id,
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
  return listSandboxedPlugins(
    installed,
    "analytics",
    (p) => !!getAnalyticsCapability(p.manifest),
    (plugin, meta) => ({
      id: getAnalyticsCapability(plugin.manifest)!.analyticsId,
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
      metricDefinitions: (meta.metricDefinitions ?? []) as AnalyticsPluginMeta["metricDefinitions"],
    }),
  );
}

async function installedAnalyticsById(id: string): Promise<AnalyticsPlugin | null> {
  const installed = await listInstalledPluginManifests();
  const plugin = findSandboxedPlugin(
    installed,
    "analytics",
    (p) => getAnalyticsCapability(p.manifest)?.analyticsId === id,
  );
  if (!plugin) return null;

  const meta = await sandboxedMeta(plugin);
  const compute = sandboxedCall<AnalyticsOutput>(plugin, "compute");
  return {
    id,
    name: plugin.manifest.name,
    description: plugin.manifest.description,
    author: plugin.manifest.author,
    metricDefinitions: (meta?.metricDefinitions ?? []) as AnalyticsPlugin["metricDefinitions"],
    compute: (input) => compute(input),
  };
}

// ── Nutrition algorithms ─────────────────────────────────────────────────────

async function installedNutritionAlgorithms(): Promise<NutritionAlgorithmMeta[]> {
  const installed = await listInstalledPluginManifests();
  return listSandboxedPlugins(
    installed,
    "nutrition-algorithm",
    (p) => !!getNutritionAlgorithmCapability(p.manifest),
    (plugin) => ({
      id: getNutritionAlgorithmCapability(plugin.manifest)!.algorithmId,
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
    }),
  );
}

async function installedNutritionAlgorithmById(id: string): Promise<NutritionAlgorithm | null> {
  const installed = await listInstalledPluginManifests();
  const plugin = findSandboxedPlugin(
    installed,
    "nutrition-algorithm",
    (p) => getNutritionAlgorithmCapability(p.manifest)?.algorithmId === id,
  );
  if (!plugin) return null;

  const meta = await sandboxedMeta(plugin);
  const computeTargets = sandboxedCall<NutritionAlgorithmOutput>(plugin, "computeTargets");
  return {
    id,
    name: plugin.manifest.name,
    description: plugin.manifest.description,
    author: plugin.manifest.author,
    defaultPreferences: meta?.defaultPreferences,
    preferencesSchema: meta?.preferencesSchema as NutritionAlgorithm["preferencesSchema"],
    computeTargets: (input) => computeTargets(input),
  };
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
  return listSandboxedPlugins(
    installed,
    "nutrition-analytics",
    (p) => !!getNutritionAnalyticsCapability(p.manifest),
    (plugin, meta) => ({
      id: getNutritionAnalyticsCapability(plugin.manifest)!.analyticsId,
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      author: plugin.manifest.author,
      metricDefinitions: (meta.metricDefinitions ?? []) as NutritionAnalyticsPluginMeta["metricDefinitions"],
    }),
  );
}

async function installedNutritionAnalyticsById(id: string): Promise<NutritionAnalyticsPlugin | null> {
  const installed = await listInstalledPluginManifests();
  const plugin = findSandboxedPlugin(
    installed,
    "nutrition-analytics",
    (p) => getNutritionAnalyticsCapability(p.manifest)?.analyticsId === id,
  );
  if (!plugin) return null;

  const meta = await sandboxedMeta(plugin);
  const compute = sandboxedCall<NutritionAnalyticsOutput>(plugin, "compute");
  return {
    id,
    name: plugin.manifest.name,
    description: plugin.manifest.description,
    author: plugin.manifest.author,
    metricDefinitions: (meta?.metricDefinitions ?? []) as NutritionAnalyticsPlugin["metricDefinitions"],
    compute: (input) => compute(input),
  };
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
  };
}

export const pluginRuntime = createPluginRuntime();

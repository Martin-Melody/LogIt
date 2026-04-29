import type { Component } from "svelte";
import type { PluginManifest, PluginFamily } from "./types";
import type { ProgressionAlgorithm } from "$lib/domain/progression";

export const PLUGIN_BUNDLE_FORMAT_VERSION = 1 as const;

export type PluginBundleFamily = Extract<PluginFamily, "widget" | "progression-algorithm">;

export type PluginBundleContract = {
  formatVersion: typeof PLUGIN_BUNDLE_FORMAT_VERSION;
  pluginId: string;
  family: PluginBundleFamily;
  entryExport: string;
};

export type PluginBundleModule = Record<string, unknown> & {
  pluginBundle?: unknown;
};

export type PluginWidgetRenderer = {
  renderHtml: () => string;
};

type BundleEntry = Component | ProgressionAlgorithm | PluginWidgetRenderer | unknown;

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBundleFamily(value: unknown): value is PluginBundleFamily {
  return value === "widget" || value === "progression-algorithm";
}

export function isPluginBundleContract(value: unknown): value is PluginBundleContract {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.formatVersion === PLUGIN_BUNDLE_FORMAT_VERSION &&
    isString(record.pluginId) &&
    isBundleFamily(record.family) &&
    isString(record.entryExport)
  );
}

export function resolvePluginBundleContract(
  module: PluginBundleModule,
  manifest: PluginManifest,
): PluginBundleContract | null {
  const raw = module.pluginBundle;
  if (!isPluginBundleContract(raw)) return null;
  if (raw.pluginId !== manifest.id) return null;
  if (raw.family !== manifest.family) return null;
  return raw;
}

function resolveLegacyEntry(module: PluginBundleModule): BundleEntry | null {
  const candidates = [module.widget, module.algorithm, module.default];
  for (const candidate of candidates) {
    if (candidate) return candidate as BundleEntry;
  }
  return null;
}

export function resolvePluginBundleEntry(
  module: PluginBundleModule,
  contract: PluginBundleContract | null,
): BundleEntry | null {
  if (!contract) {
    return resolveLegacyEntry(module);
  }

  const entry =
    contract.entryExport === "default" ? module.default : module[contract.entryExport];
  return (entry ?? null) as BundleEntry | null;
}

export function isPluginWidgetComponent(value: unknown): value is Component {
  return typeof value === "function";
}

export function isPluginWidgetRenderer(value: unknown): value is PluginWidgetRenderer {
  return (
    !!value &&
    typeof value === "object" &&
    "renderHtml" in value &&
    typeof (value as PluginWidgetRenderer).renderHtml === "function"
  );
}

export function isPluginAlgorithm(value: unknown): value is ProgressionAlgorithm {
  return (
    !!value &&
    typeof value === "object" &&
    "suggest" in value &&
    typeof (value as ProgressionAlgorithm).suggest === "function"
  );
}

export function describePluginBundleContract(
  contract: PluginBundleContract | null,
): string {
  if (!contract) return "Legacy bundle";
  return `v${contract.formatVersion} ${contract.family} export: ${contract.entryExport}`;
}

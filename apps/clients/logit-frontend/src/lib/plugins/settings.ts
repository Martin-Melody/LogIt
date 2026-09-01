import { browser } from "$app/environment";
import { writable } from "svelte/store";
import type { PluginFamily } from "./types";

/**
 * Families whose plugins ship executable code and therefore run only when
 * community plugins are enabled. Content families (exercise packs, etc.) are
 * pure data and install regardless of Restricted Mode.
 */
const EXECUTABLE_FAMILIES: ReadonlySet<PluginFamily> = new Set([
  "widget",
  "progression-algorithm",
  "analytics",
  "nutrition-algorithm",
  "nutrition-analytics",
]);

export function isExecutablePluginFamily(family: PluginFamily): boolean {
  return EXECUTABLE_FAMILIES.has(family);
}

/**
 * Plugin trust settings. Community plugins are OFF by default ("Restricted Mode",
 * borrowing Obsidian's term): the app ships and runs with only builtin extension
 * points until the user makes a deliberate choice to enable community code.
 *
 * This is the first line of the trust model — a hard gate on ever executing a
 * non-builtin bundle. Bundle hashing, local install, and the interpreter sandbox
 * layer on top of it; none of them replace it.
 */
export type PluginSettings = {
  /** Master switch for running community (non-builtin) plugins. */
  communityPluginsEnabled: boolean;
  /** Set once the user has seen and dismissed the enable-time warning. */
  acknowledgedRisk: boolean;
};

const STORAGE_KEY = "logit:plugin-settings:v1";

function defaults(): PluginSettings {
  return { communityPluginsEnabled: false, acknowledgedRisk: false };
}

function load(): PluginSettings {
  if (!browser) return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<PluginSettings>;
    return {
      communityPluginsEnabled: parsed.communityPluginsEnabled === true,
      acknowledgedRisk: parsed.acknowledgedRisk === true,
    };
  } catch {
    return defaults();
  }
}

// Synchronous mirror so non-reactive callers (the plugin runtime) can gate
// without subscribing.
let current: PluginSettings = load();

function persist(next: PluginSettings): void {
  current = next;
  if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function createPluginSettingsStore() {
  const store = writable<PluginSettings>(current);

  function set(patch: Partial<PluginSettings>): void {
    const next = { ...current, ...patch };
    persist(next);
    store.set(next);
  }

  return {
    subscribe: store.subscribe,
    /** Enable community plugins and record that the warning was acknowledged. */
    enableCommunityPlugins(): void {
      set({ communityPluginsEnabled: true, acknowledgedRisk: true });
    },
    disableCommunityPlugins(): void {
      set({ communityPluginsEnabled: false });
    },
  };
}

export const pluginSettings = createPluginSettingsStore();

/** Synchronous gate for the runtime. Never executes a community bundle when false. */
export function isCommunityPluginsEnabled(): boolean {
  return current.communityPluginsEnabled === true;
}

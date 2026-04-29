import { browser } from "$app/environment";
import { writable, type Writable } from "svelte/store";
import type { HomeConfig, WidgetSlot } from "$lib/features/widgets/widget";
import { localWidgetRegistry } from "$lib/features/widgets/localWidgetRegistry";
import { listInstalledPluginManifests } from "$lib/plugins/catalog";
import type { PluginManifest, WidgetPluginCapability } from "$lib/plugins";

const STORAGE_KEY = "logit:home-config:v1";

function defaultConfig(): HomeConfig {
  const slots: WidgetSlot[] = localWidgetRegistry
    .list()
    .map((w) => ({ id: w.id, enabled: w.defaultEnabled, orderIndex: w.defaultOrder }));
  return { slots };
}

function getWidgetCapability(manifest: PluginManifest): WidgetPluginCapability | null {
  return (
    manifest.capabilities.find(
      (cap): cap is WidgetPluginCapability => cap.family === "widget",
    ) ?? null
  );
}

function load(): HomeConfig {
  if (typeof localStorage === "undefined") return defaultConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw) as HomeConfig;

    // merge in any new widgets the registry knows about
    const known = localWidgetRegistry.list();
    const existing = new Set(parsed.slots.map((s) => s.id));
    const merged = [...parsed.slots];
    let nextOrder = merged.length;
    for (const w of known) {
      if (!existing.has(w.id)) {
        merged.push({ id: w.id, enabled: w.defaultEnabled, orderIndex: nextOrder++ });
      }
    }
    return { slots: merged };
  } catch {
    return defaultConfig();
  }
}

async function reconcileInstalledWidgets(store: Writable<HomeConfig>): Promise<void> {
  const installed = await listInstalledPluginManifests();
  const widgetSlots = installed
    .map((plugin) => {
      const capability = getWidgetCapability(plugin.manifest);
      if (!capability) return null;
      return {
        id: capability.widgetId,
        enabled: plugin.enabled && capability.defaultEnabled,
        orderIndex: capability.defaultOrder,
      } satisfies WidgetSlot;
    })
    .filter((slot): slot is WidgetSlot => slot !== null);

  if (widgetSlots.length === 0) return;

  store.update((config) => {
    const existing = new Set(config.slots.map((slot) => slot.id));
    const merged = [...config.slots];
    let nextOrder = merged.length;

    for (const slot of widgetSlots) {
      if (!existing.has(slot.id)) {
        merged.push({ ...slot, orderIndex: nextOrder++ });
      }
    }

    if (merged.length === config.slots.length) return config;

    const next = { slots: merged };
    save(next);
    return next;
  });
}

function save(config: HomeConfig) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function createHomeConfigStore() {
  const store = writable<HomeConfig>(load());

  if (browser) {
    void reconcileInstalledWidgets(store);
  }

  function update(fn: (c: HomeConfig) => HomeConfig) {
    store.update((c) => {
      const next = fn(c);
      save(next);
      return next;
    });
  }

  function toggleWidget(id: string) {
    update((c) => ({
      ...c,
      slots: c.slots.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    }));
  }

  function moveUp(id: string) {
    update((c) => {
      const slots = [...c.slots].sort((a, b) => a.orderIndex - b.orderIndex);
      const idx = slots.findIndex((s) => s.id === id);
      if (idx <= 0) return c;
      [slots[idx - 1], slots[idx]] = [slots[idx], slots[idx - 1]];
      return { slots: slots.map((s, i) => ({ ...s, orderIndex: i })) };
    });
  }

  function moveDown(id: string) {
    update((c) => {
      const slots = [...c.slots].sort((a, b) => a.orderIndex - b.orderIndex);
      const idx = slots.findIndex((s) => s.id === id);
      if (idx < 0 || idx >= slots.length - 1) return c;
      [slots[idx], slots[idx + 1]] = [slots[idx + 1], slots[idx]];
      return { slots: slots.map((s, i) => ({ ...s, orderIndex: i })) };
    });
  }

  async function reconcilePlugins(): Promise<void> {
    await reconcileInstalledWidgets(store);
  }

  return { subscribe: store.subscribe, toggleWidget, moveUp, moveDown, reconcilePlugins };
}

export const homeConfig = createHomeConfigStore();

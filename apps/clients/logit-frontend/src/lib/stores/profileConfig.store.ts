import { browser } from "$app/environment";
import { writable } from "svelte/store";
import type { HomeConfig, WidgetSlot } from "$lib/features/widgets/widget";
import { localProfileWidgetRegistry } from "$lib/features/profileWidgets/localProfileWidgetRegistry";

const STORAGE_KEY = "logit:profile-config:v1";

function defaultConfig(): HomeConfig {
  const slots: WidgetSlot[] = localProfileWidgetRegistry
    .list()
    .map((w) => ({ id: w.id, enabled: w.defaultEnabled, orderIndex: w.defaultOrder }));
  return { slots };
}

function load(): HomeConfig {
  if (!browser) return defaultConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw) as HomeConfig;

    // merge in any new widgets the registry knows about
    const known = localProfileWidgetRegistry.list();
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

function save(config: HomeConfig) {
  if (!browser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function createProfileConfigStore() {
  const store = writable<HomeConfig>(load());

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

  return { subscribe: store.subscribe, toggleWidget, moveUp, moveDown };
}

export const profileConfig = createProfileConfigStore();

import { browser } from "$app/environment";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { onActiveOwnerChange } from "$lib/data/activeOwner";
import { writable } from "svelte/store";
import type { HomeConfig, WidgetSlot } from "$lib/features/widgets/widget";
import { localProfileWidgetRegistry } from "$lib/features/profileWidgets/localProfileWidgetRegistry";

const STORAGE_KEY = "logit:profile-config:v1";

function defaultConfig(): HomeConfig {
  if (!localProfileWidgetRegistry) return { slots: [] };
  const slots: WidgetSlot[] = localProfileWidgetRegistry
    .list()
    .map((w) => ({ id: w.id, enabled: w.defaultEnabled, orderIndex: w.defaultOrder }));
  return { slots };
}

function load(): HomeConfig {
  if (!browser) return { slots: [] };
  try {
    const raw = getAccountItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    return withRegistry(JSON.parse(raw) as HomeConfig);
  } catch {
    return defaultConfig();
  }
}

/** Add any card the registry knows that the saved config doesn't have yet (at the end). */
function withRegistry(parsed: HomeConfig): HomeConfig {
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
}

function save(config: HomeConfig) {
  if (!browser) return;
  setAccountItem(STORAGE_KEY, JSON.stringify(config));
}

// The card config rides along on the synced profile (profileConfigJson), so the dashboard
// can edit it too. Same pattern as homeConfig.store.ts.
function scheduleProfilePush() {
  if (!browser) return;
  void import("$lib/sync/syncService").then(({ pushNavConfig }) => pushNavConfig());
}

let _current: HomeConfig = { slots: [] };

function createProfileConfigStore() {
  const store = writable<HomeConfig>(load());
  store.subscribe((c) => { _current = c; });

  function update(fn: (c: HomeConfig) => HomeConfig) {
    store.update((c) => {
      const next = fn(c);
      save(next);
      scheduleProfilePush();
      return next;
    });
  }

  /** A newer config pulled from the server (edited on the dashboard). Doesn't push back. */
  function applyRemote(config: HomeConfig) {
    if (!Array.isArray(config?.slots)) return;
    const known = new Set(localProfileWidgetRegistry.list().map((w) => w.id));
    const merged = withRegistry({ slots: config.slots.filter((s) => known.has(s.id)) });
    save(merged);
    store.set(merged);
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

  return { subscribe: store.subscribe, toggleWidget, moveUp, moveDown, applyRemote, reloadForAccount: () => store.set(load()) };
}

export const profileConfig = createProfileConfigStore();
// Each account on the phone has its own copy (lib/data/accountStorage.ts): reload on a switch.
onActiveOwnerChange(() => profileConfig.reloadForAccount());

export function getProfileConfigJson(): string {
  return JSON.stringify(_current);
}

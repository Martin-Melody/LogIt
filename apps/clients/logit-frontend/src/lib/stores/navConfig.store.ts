import { browser } from "$app/environment";
import { writable } from "svelte/store";
import {
  House,
  List,
  Rss,
  User,
  SquareChartGantt,
  ChartNoAxesColumn,
  Dumbbell,
  Settings,
  Sparkles,
  MessagesSquare,
  Apple,
  CircleCheckBig,
} from "lucide-svelte";
export type NavItemId =
  | "home"
  | "sessions"
  | "social"
  | "messages"
  | "profile"
  | "splits"
  | "progress"
  | "exercises"
  | "nutrition"
  | "habits"
  | "settings"
  | "plugins";

export type NavItemDef = {
  id: NavItemId;
  href: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  authRequired: boolean;
  tourId?: string;
};

export const NAV_ITEM_DEFS: NavItemDef[] = [
  { id: "home",      href: "/",          label: "Home",      icon: House,             authRequired: false, tourId: "nav-home"     },
  { id: "social",    href: "/social",     label: "Social",    icon: Rss,               authRequired: true                         },
  { id: "messages",  href: "/messages",   label: "Messages",  icon: MessagesSquare,    authRequired: true                         },
  { id: "sessions",  href: "/sessions",   label: "Sessions",  icon: List,              authRequired: false, tourId: "nav-sessions" },
  { id: "profile",   href: "/profile",    label: "Profile",   icon: User,              authRequired: false, tourId: "nav-profile"  },
  { id: "splits",    href: "/splits",     label: "Splits",    icon: SquareChartGantt,  authRequired: false                        },
  { id: "progress",  href: "/progress",   label: "Progress",  icon: ChartNoAxesColumn, authRequired: false                        },
  { id: "exercises", href: "/exercises",  label: "Exercises", icon: Dumbbell,          authRequired: false                        },
  { id: "nutrition", href: "/nutrition",  label: "Nutrition", icon: Apple,             authRequired: false                        },
  { id: "habits",    href: "/habits",     label: "Habits",    icon: CircleCheckBig,    authRequired: false                        },
  { id: "settings",  href: "/settings",   label: "Settings",  icon: Settings,          authRequired: false                        },
  { id: "plugins",   href: "/plugins",    label: "Plugins",   icon: Sparkles,          authRequired: false                        },
];

/** Number of customisable slots in the bottom bar (excludes the fixed FAB and More button). */
export const BAR_SLOTS = 3;

export type NavConfig = {
  bar: NavItemId[];  // up to BAR_SLOTS items shown in the bottom bar
  more: NavItemId[]; // items shown in the More drawer
};

const STORAGE_KEY = "logit:nav-config:v1";

const ALL_IDS = NAV_ITEM_DEFS.map((d) => d.id);

function defaultConfig(): NavConfig {
  return {
    bar: ["home", "social", "profile"],
    more: ["messages", "sessions", "splits", "progress", "exercises", "nutrition", "habits", "settings", "plugins"],
  };
}

function ensureComplete(config: NavConfig): NavConfig {
  const existing = new Set([...config.bar, ...config.more]);
  const missing = ALL_IDS.filter((id) => !existing.has(id));
  if (missing.length === 0) return config;
  return { ...config, more: [...config.more, ...missing] };
}

function load(): NavConfig {
  if (!browser) return defaultConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw) as NavConfig;
    return ensureComplete({ bar: parsed.bar ?? [], more: parsed.more ?? [] });
  } catch {
    return defaultConfig();
  }
}

// Track current value synchronously for getNavConfigJson()
let _current: NavConfig = defaultConfig();

function saveToStorage(config: NavConfig) {
  if (!browser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function createNavConfigStore() {
  const store = writable<NavConfig>(load());
  store.subscribe((c) => { _current = c; });

  function update(fn: (c: NavConfig) => NavConfig) {
    store.update((c) => {
      const next = fn(c);
      saveToStorage(next);
      scheduleProfilePush();
      return next;
    });
  }

  function reorderBar(from: number, to: number) {
    update((c) => {
      const bar = [...c.bar];
      const [item] = bar.splice(from, 1);
      bar.splice(to, 0, item!);
      return { ...c, bar };
    });
  }

  function reorderMore(from: number, to: number) {
    update((c) => {
      const more = [...c.more];
      const [item] = more.splice(from, 1);
      more.splice(to, 0, item!);
      return { ...c, more };
    });
  }

  function moveToBar(id: NavItemId) {
    update((c) => {
      if (c.bar.length >= BAR_SLOTS || c.bar.includes(id)) return c;
      return { bar: [...c.bar, id], more: c.more.filter((x) => x !== id) };
    });
  }

  function moveToMore(id: NavItemId) {
    update((c) => {
      if (!c.bar.includes(id)) return c;
      return { bar: c.bar.filter((x) => x !== id), more: [id, ...c.more] };
    });
  }

  function moveBarUp(id: NavItemId) {
    update((c) => {
      const bar = [...c.bar];
      const idx = bar.indexOf(id);
      if (idx <= 0) return c;
      [bar[idx - 1], bar[idx]] = [bar[idx], bar[idx - 1]];
      return { ...c, bar };
    });
  }

  function moveBarDown(id: NavItemId) {
    update((c) => {
      const bar = [...c.bar];
      const idx = bar.indexOf(id);
      if (idx < 0 || idx >= bar.length - 1) return c;
      [bar[idx], bar[idx + 1]] = [bar[idx + 1], bar[idx]];
      return { ...c, bar };
    });
  }

  function moveMoreUp(id: NavItemId) {
    update((c) => {
      const more = [...c.more];
      const idx = more.indexOf(id);
      if (idx <= 0) return c;
      [more[idx - 1], more[idx]] = [more[idx], more[idx - 1]];
      return { ...c, more };
    });
  }

  function moveMoreDown(id: NavItemId) {
    update((c) => {
      const more = [...c.more];
      const idx = more.indexOf(id);
      if (idx < 0 || idx >= more.length - 1) return c;
      [more[idx], more[idx + 1]] = [more[idx + 1], more[idx]];
      return { ...c, more };
    });
  }

  /** Apply a config pulled from remote sync without triggering a re-push. */
  function applyRemote(config: NavConfig) {
    const complete = ensureComplete(config);
    saveToStorage(complete);
    store.set(complete);
  }

  /**
   * Offline accounts can't use Social (it requires an online account), so swap it for
   * Exercises wherever it sits — keeping bar/more symmetrical instead of leaving a gap.
   * No-ops if Social isn't in the config (e.g. already reconciled).
   */
  function reconcileForOffline() {
    if (!_current.bar.includes("social") && !_current.more.includes("social")) return;
    update((c) => {
      const swap = (arr: NavItemId[]) =>
        arr.map((id) => (id === "social" ? "exercises" : id === "exercises" ? "social" : id));
      return { bar: swap(c.bar), more: swap(c.more) };
    });
  }

  return {
    subscribe: store.subscribe,
    reorderBar,
    reorderMore,
    moveToBar,
    moveToMore,
    moveBarUp,
    moveBarDown,
    moveMoreUp,
    moveMoreDown,
    applyRemote,
    reconcileForOffline,
  };
}

export const navConfig = createNavConfigStore();

export function getNavConfigJson(): string {
  return JSON.stringify(_current);
}

function scheduleProfilePush() {
  if (!browser) return;
  void import("$lib/sync/syncService").then(({ pushNavConfig }) => pushNavConfig());
}

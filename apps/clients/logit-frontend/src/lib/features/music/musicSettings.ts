import { browser } from "$app/environment";
import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
import { onActiveOwnerChange } from "$lib/data/activeOwner";
import { writable } from "svelte/store";
import type { WorkoutPlaylist } from "./workoutPlaylists";

/** Per phone (the music apps are per phone too), so kept on the device, not synced. */
export type MusicSettings = {
  /** Show the bar above the finish button in a workout. */
  barEnabled: boolean;
  /** Start the day's playlist when a workout starts. */
  autoplay: boolean;
  /** Pause the music after Finish workout. */
  pauseOnFinish: boolean;
  /** "Not now" on the set-up prompt: the bar then shows nothing until set up from Settings. */
  setupDismissed: boolean;
  playlists: WorkoutPlaylist[];
};

const STORAGE_KEY = "logit:music:v1";

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  barEnabled: true,
  autoplay: false,
  pauseOnFinish: false,
  setupDismissed: false,
  playlists: [],
};

export function parseMusicSettings(raw: string | null): MusicSettings {
  if (!raw) return { ...DEFAULT_MUSIC_SETTINGS };
  try {
    const v = JSON.parse(raw) as Partial<MusicSettings>;
    return {
      barEnabled: typeof v.barEnabled === "boolean" ? v.barEnabled : DEFAULT_MUSIC_SETTINGS.barEnabled,
      autoplay: typeof v.autoplay === "boolean" ? v.autoplay : DEFAULT_MUSIC_SETTINGS.autoplay,
      pauseOnFinish:
        typeof v.pauseOnFinish === "boolean" ? v.pauseOnFinish : DEFAULT_MUSIC_SETTINGS.pauseOnFinish,
      setupDismissed: v.setupDismissed === true,
      playlists: Array.isArray(v.playlists)
        ? v.playlists.filter(
            (p): p is WorkoutPlaylist =>
              !!p && typeof p.id === "string" && typeof p.url === "string" && typeof p.name === "string",
          )
        : [],
    };
  } catch {
    return { ...DEFAULT_MUSIC_SETTINGS };
  }
}

function load(): MusicSettings {
  if (!browser) return { ...DEFAULT_MUSIC_SETTINGS };
  try {
    return parseMusicSettings(getAccountItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_MUSIC_SETTINGS };
  }
}

function createMusicSettings() {
  const store = writable<MusicSettings>(load());
  store.subscribe((v) => {
    if (!browser) return;
    try {
      setAccountItem(STORAGE_KEY, JSON.stringify(v));
    } catch {
      // Storage full or blocked: the settings still hold for this run.
    }
  });
  return {
    subscribe: store.subscribe,
    reloadForAccount: () => store.set(load()),
    patch(p: Partial<MusicSettings>) {
      store.update((s) => ({ ...s, ...p }));
    },
    addPlaylist(p: WorkoutPlaylist) {
      store.update((s) => ({ ...s, playlists: [...s.playlists, p] }));
    },
    updatePlaylist(id: string, p: Partial<WorkoutPlaylist>) {
      store.update((s) => ({
        ...s,
        playlists: s.playlists.map((x) => (x.id === id ? { ...x, ...p } : x)),
      }));
    },
    removePlaylist(id: string) {
      store.update((s) => ({ ...s, playlists: s.playlists.filter((x) => x.id !== id) }));
    },
  };
}

export const musicSettings = createMusicSettings();
// Each account on the phone has its own copy (lib/data/accountStorage.ts): reload on a switch.
onActiveOwnerChange(() => musicSettings.reloadForAccount());

import { browser } from "$app/environment";
import { initRepos } from "$lib/data/repoProvider";
import { authStore } from "$lib/api/authStore.svelte";
import { activeSplit } from "$lib/stores/activeSplit.store";
import { appReady, appInitError } from "$lib/stores/appReady.store";
import { currentSession } from "$lib/stores/currentSession.store";
import { recentSessions } from "$lib/stores/recentSessions.store";
import { splits } from "$lib/stores/splits.store";
import { exercisesStore } from "$lib/stores/exercises.store";
import { navConfig } from "$lib/stores/navConfig.store";
import { setupKeyboard } from "./keyboard";
import { setupNativeShell } from "./nativeShell";
import { syncAll, reloadLastSyncedAt } from "$lib/sync/syncService";

let didInit = false;

// ── Background sync ──────────────────────────────────────────────────────────
// Every 5 minutes and whenever the app comes back to the foreground, plus the unread
// notification badge. Started for any signed-in user: at startup if already signed in, and
// on login/register. It used to be set up only at startup, so someone who signed in later
// got no background sync or badge updates until they restarted the app.

const BACKGROUND_SYNC_MS = 5 * 60 * 1000;
let backgroundTimer: ReturnType<typeof setInterval> | null = null;

function syncWhenVisible() {
  if (document.visibilityState === "visible" && authStore.isAuthenticated) void syncAll();
}

export function startBackgroundSync(): void {
  if (!browser || backgroundTimer) return;
  backgroundTimer = setInterval(() => {
    if (authStore.isAuthenticated) void syncAll();
  }, BACKGROUND_SYNC_MS);
  document.addEventListener("visibilitychange", syncWhenVisible);
  void import("$lib/stores/notifications.store").then((m) => m.unreadNotifications.start());
}

export function stopBackgroundSync(): void {
  if (!browser || !backgroundTimer) return;
  clearInterval(backgroundTimer);
  backgroundTimer = null;
  document.removeEventListener("visibilitychange", syncWhenVisible);
  void import("$lib/stores/notifications.store").then((m) => m.unreadNotifications.stop());
}

/**
 * Clear all data-bearing stores and reload them from the current active owner.
 * Call this any time the active account changes (login, logout, account switch).
 */
export async function rehydrateStores(): Promise<void> {
  // Clear first so nothing from the previous account lingers
  recentSessions.clear();
  splits.clear();
  activeSplit.clear();
  currentSession.clear();
  exercisesStore.clear();
  // Sync bookkeeping is per profile; show this profile's last sync, not the previous one's.
  reloadLastSyncedAt();

  // Reload from repos (which are already re-initialized with the new owner)
  await recentSessions.refresh(5);
  await splits.refresh({ limit: 20 });
  await activeSplit.load();
  await currentSession.loadDraft();
}

export async function appInit(): Promise<void> {
  if (!browser) return;

  if (didInit) return;
  didInit = true;

  try {
    await initRepos();

    // Auth check runs in background — never blocks startup; sync follows if authenticated
    authStore.init()
      .then(() => {
        if (!authStore.isAuthenticated) {
          navConfig.reconcileForOffline();
          return;
        }
        void syncAll();
        startBackgroundSync();
      })
      .catch(() => {});

    await rehydrateStores();

    try {
      await setupKeyboard();
    } catch (e) {
      console.warn("[appInit] keyboard setup failed (continuing)", e);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[appInit] startup failed", error);
    appInitError.set(msg);
  } finally {
    appReady.set(true);
    // Runs even if startup failed, so the native splash always yields to the
    // web layer (the error screen included) rather than hanging.
    setupNativeShell().catch((e) =>
      console.warn("[appInit] native shell setup failed (continuing)", e),
    );
  }
}

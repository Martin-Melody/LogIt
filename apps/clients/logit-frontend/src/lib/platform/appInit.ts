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
import { syncAll } from "$lib/sync/syncService";

let didInit = false;

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

        // Periodic background sync
        setInterval(() => { if (authStore.isAuthenticated) void syncAll(); }, 5 * 60 * 1000);

        // Sync when the app returns to foreground (e.g. switching back on mobile)
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible" && authStore.isAuthenticated) void syncAll();
        });
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
  }
}

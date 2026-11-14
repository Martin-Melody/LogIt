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
import { log, captureGlobalErrors } from "@logit/core/platform/log";
import { getDeviceInfo } from "./deviceInfo";

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

  captureGlobalErrors();
  const started = Date.now();
  void getDeviceInfo().then((info) =>
    log.info("app", "App started", {
      version: info.appVersion,
      build: info.build,
      platform: info.platform,
      server: info.serverMode,
    }),
  );

  try {
    await initRepos();
    log.debug("app", "Local database ready", { ms: Date.now() - started });

    // Auth check runs in background — never blocks startup; sync follows if authenticated
    authStore.init()
      .then(() => {
        if (!authStore.isAuthenticated) {
          navConfig.reconcileForOffline();
          return;
        }
        void syncAll();
        startBackgroundSync();
        // Reports Play purchases the server hasn't seen (restores, purchases finished while the
        // app was closed) and keeps the plan status fresh.
        void import("$lib/billing/billing.svelte").then((m) => m.billing.start());
      })
      .catch((e) => log.error("auth", "Could not restore the signed-in session", e));

    // Follows the in-progress workout's rests from here on, on every screen.
    const { startRestTimers } = await import("$lib/services/restTimerService");
    startRestTimers();

    await rehydrateStores();

    try {
      await setupKeyboard();
    } catch (e) {
      log.warn("app", "Keyboard setup failed (continuing)", e);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("app", "Startup failed", error);
    appInitError.set(msg);
  } finally {
    appReady.set(true);
    log.debug("app", "Startup finished", { ms: Date.now() - started });
    // Runs even if startup failed, so the native splash always yields to the
    // web layer (the error screen included) rather than hanging.
    setupNativeShell().catch((e) =>
      log.warn("app", "Native shell setup failed (continuing)", e),
    );
  }
}

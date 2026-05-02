import { browser } from "$app/environment";
import { initRepos } from "$lib/data/repoProvider";
import { authStore } from "$lib/api/authStore.svelte";
import { activeSplit } from "$lib/stores/activeSplit.store";
import { appReady, appInitError } from "$lib/stores/appReady.store";
import { currentSession } from "$lib/stores/currentSession.store";
import { recentSessions } from "$lib/stores/recentSessions.store";
import { splits } from "$lib/stores/splits.store";
import { setupKeyboard } from "./keyboard";

let didInit = false;

export async function appInit(): Promise<void> {
  if (!browser) return;

  if (didInit) return;
  didInit = true;

  console.log("[appInit] starting");

  try {
    // ---- storage init ----
    await initRepos();
    console.log("[appInit] storage initialized");

    // ---- auth (optional — never blocks or throws) ----
    authStore.init().catch(() => {});
    console.log("[appInit] auth init kicked off");

    // ---- hydrate stores ----
    await recentSessions.refresh(5);
    await splits.refresh({ limit: 20 });
    await activeSplit.load();
    console.log("[appInit] stores hydrated");

    // ---- Keyboard Setup ----
    try {
      await setupKeyboard();
      console.log("[appInit] keyboard configured");
    } catch (e) {
      console.warn("[appInit] keyboard setup failed (continuing)", e);
    }

    // ---- restore draft session ----
    await currentSession.loadDraft();
    console.log("[appInit] draft restore checked");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[appInit] startup failed", error);
    appInitError.set(msg);
  } finally {
    appReady.set(true);
    console.log("[appInit] complete");
  }
}

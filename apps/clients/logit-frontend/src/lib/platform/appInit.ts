import { browser } from "$app/environment";
import { initRepos } from "$lib/data/repoProvider";
import { activeSplit } from "$lib/stores/activeSplit.store";
import { appReady } from "$lib/stores/appReady.store";
import { currentSession } from "$lib/stores/currentSession.store";
import { recentSessions } from "$lib/stores/recentSessions.store";
import { splits } from "$lib/stores/splits.store";
import { setupKeyboard } from "./keyboard";

let didInit = false;

export async function appInit(): Promise<void> {
  // Never run during SSR
  if (!browser) return;

  // Prevent double init (HMR, layout remounts, etc.)
  if (didInit) return;
  didInit = true;

  console.log("[appInit] starting");

  // ---- storage init ----
  await initRepos();
  console.log("[appInit] storage initialized");

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

  appReady.set(true);
  console.log("[appInit] complete");
}

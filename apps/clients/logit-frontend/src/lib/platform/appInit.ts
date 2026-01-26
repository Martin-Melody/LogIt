import { browser } from "$app/environment";
import { initRepo } from "$lib/data/repoProvider";
import { appReady } from "$lib/stores/appReady.store";
import { currentSession } from "$lib/stores/currentSession.store";
import { recentSessions } from "$lib/stores/recentSessions.store";

let didInit = false;

export async function appInit(): Promise<void> {
  // Never run during SSR
  if (!browser) return;

  // Prevent double init (HMR, layout remounts, etc.)
  if (didInit) return;
  didInit = true;

  console.log("[appInit] starting");

  // ---- storage init ----
  await initRepo();
  console.log("[appInit] storage initialized");

  // ---- hydrate stores ----
  await recentSessions.refresh(5);
  console.log("[appInit] stores hydrated");

  // ---- restore draft session ----
  await currentSession.loadDraft();
  console.log("[appInit] draft restore checked");

  appReady.set(true);
  console.log("[appInit] complete");
}

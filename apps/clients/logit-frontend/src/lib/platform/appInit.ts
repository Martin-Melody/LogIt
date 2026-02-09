import { browser } from "$app/environment";
import { initRepos } from "$lib/data/repoProvider";
import { activeSplit } from "$lib/stores/activeSplit.store";
import { appReady } from "$lib/stores/appReady.store";
import { currentSession } from "$lib/stores/currentSession.store";
import { recentSessions } from "$lib/stores/recentSessions.store";
import { splits } from "$lib/stores/splits.store";
import { Capacitor } from "@capacitor/core";
import { setupKeyboard } from "./keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { LocalNotifications } from "@capacitor/local-notifications";

let didInit = false;

export async function appInit(): Promise<void> {
  if (!browser) return;
  if (didInit) return;
  didInit = true;

  console.log("[appInit] starting");

  await initNotifications();

  await initRepos();
  console.log("[appInit] storage initialized");

  await recentSessions.refresh(5);
  await splits.refresh({ limit: 20 });
  await activeSplit.load();
  console.log("[appInit] stores hydrated");

  await currentSession.loadDraft();
  console.log("[appInit] draft restore checked");

  // ✅ Only native-only UI tweaks behind the platform guard
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.show();
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setBackgroundColor({ color: "#ffffff" });
    } catch (e) {
      console.warn("[appInit] status bar setup failed (continuing)", e);
    }

    try {
      await setupKeyboard();
      console.log("[appInit] keyboard configured");
    } catch (e) {
      console.warn("[appInit] keyboard setup failed (continuing)", e);
    }
  }

  appReady.set(true);
  console.log("[appInit] complete");
}

export async function initNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  const perm = await LocalNotifications.requestPermissions();
  // perm.display === "granted" (on iOS); Android generally grants at install on older versions,
  // but Android 13+ needs runtime permission too, Capacitor handles this via requestPermissions().
}

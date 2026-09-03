import { Capacitor } from "@capacitor/core";

let didSetup = false;

/**
 * Native-only shell wiring: dismiss the splash screen once the web layer is up,
 * keep the status bar styled to match the current theme, and make the Android
 * hardware back button behave (navigate back, exit at the root).
 *
 * Safe to call on web — it no-ops. Called from appInit() after the first render.
 */
export async function setupNativeShell(): Promise<void> {
  if (didSetup) return;
  didSetup = true;

  if (!Capacitor.isNativePlatform()) return;

  await Promise.allSettled([syncStatusBar(), hideSplash(), wireBackButton()]);
}

async function hideSplash(): Promise<void> {
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    // plugin not present / already hidden
  }
}

async function syncStatusBar(): Promise<void> {
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");

    const apply = async (dark: boolean) => {
      // Style.Dark = light text (for dark backgrounds), Style.Light = dark text.
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      if (Capacitor.getPlatform() === "android") {
        await StatusBar.setBackgroundColor({ color: dark ? "#1C1D21" : "#FFFFFF" });
      }
    };

    const isDark = () => document.documentElement.classList.contains("dark");
    await apply(isDark());

    // mode-watcher toggles `.dark` on <html>; follow it.
    const observer = new MutationObserver(() => void apply(isDark()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  } catch {
    // plugin not present
  }
}

async function wireBackButton(): Promise<void> {
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });
  } catch {
    // plugin not present
  }
}

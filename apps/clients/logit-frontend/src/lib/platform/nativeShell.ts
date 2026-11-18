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

  await Promise.allSettled([syncStatusBar(), hideSplash(), wireBackButton(), wireAppLinks()]);
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
        // Dark value is --background from layout.css (oklch 0.145 0.01 260).
        await StatusBar.setBackgroundColor({ color: dark ? "#080A0E" : "#FFFFFF" });
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
    const { handleBack } = await import("$lib/components/sheet/sheet");
    const { takeEdgeSwipe, watchEdgeSwipes } = await import("$lib/platform/edgeSwipe");
    watchEdgeSwipes();
    await App.addListener("backButton", ({ canGoBack }) => {
      // A swipe on a set row that started at the screen edge, which Android read as back.
      if (takeEdgeSwipe()) return;
      // An open sheet or dialog closes first, newest first; then the previous screen.
      if (handleBack()) return;
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

/** Where a link that opened the app should go, or null to ignore it. */
export function routeForAppLink(url: string): string | null {
  // A shared algorithm: logit://a?c=logit-alg1:… or https://getlogit.app/a#logit-alg1:…
  const code = url.match(/logit-alg1:[A-Za-z0-9_-]+/)?.[0];
  if (code) return `/settings?algorithmCode=${encodeURIComponent(code)}#sec-progression`;
  return null;
}

async function wireAppLinks(): Promise<void> {
  try {
    const { App } = await import("@capacitor/app");
    const { goto } = await import("$app/navigation");
    const open = (url: string | undefined) => {
      const route = url ? routeForAppLink(url) : null;
      if (route) void goto(route);
    };
    open((await App.getLaunchUrl())?.url);
    await App.addListener("appUrlOpen", ({ url }) => open(url));
  } catch {
    // plugin not present
  }
}

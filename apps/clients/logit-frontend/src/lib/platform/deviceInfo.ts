import { Capacitor } from "@capacitor/core";
import { apiClient } from "@logit/core/api/client";
import { getServerMode, getSelfHostUrl, type ServerMode } from "@logit/core/api/serverConfig";

export interface DeviceInfo {
  appVersion: string;
  build: string;
  platform: string;
  userAgent: string;
  serverMode: ServerMode;
  /** Host of a self-hosted server; empty otherwise. */
  server: string;
  signedIn: boolean;
  tier: string;
}

let nativeVersion: Promise<string> | null = null;

/** The installed app's version on Android/iOS (versionName + build number); "web" in a browser. */
function appVersion(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve("web");
  nativeVersion ??= import("@capacitor/app")
    .then(({ App }) => App.getInfo())
    .then((info) => `${info.version} (${info.build})`)
    .catch(() => "unknown");
  return nativeVersion;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** What a diagnostics report says about this device and connection. No account names. */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  const serverMode = getServerMode();
  return {
    appVersion: await appVersion(),
    build: typeof __LOGIT_BUILD__ === "string" ? __LOGIT_BUILD__ : "dev",
    platform: Capacitor.getPlatform(),
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    serverMode,
    server: serverMode === "selfhosted" ? hostOf(getSelfHostUrl()) : "",
    signedIn: apiClient.isAuthenticated(),
    tier: apiClient.getUser()?.tier ?? "",
  };
}

/** Header lines for an exported or sent log. */
export function deviceInfoHeader(info: DeviceInfo): Record<string, string> {
  return {
    App: `${info.appVersion}, build ${info.build}`,
    Platform: info.platform,
    Browser: info.userAgent,
    Server: info.serverMode === "selfhosted" ? `self-hosted (${info.server})` : info.serverMode,
    "Signed in": info.signedIn ? `yes${info.tier ? `, ${info.tier}` : ""}` : "no",
  };
}

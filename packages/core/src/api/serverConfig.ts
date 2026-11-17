import { browser } from "$app/environment";
import { apiClient } from "./client";
import { sessionKey } from "./sessionScope";

export type ServerMode = "offline" | "cloud" | "selfhosted";

/** Stored per account on the phone, like the rest of a sign-in (sessionScope.ts). */
export const MODE_KEY = "logit:server:mode";

export function getServerMode(): ServerMode {
  if (!browser) return "offline";
  return (localStorage.getItem(sessionKey(MODE_KEY)) as ServerMode) ?? "offline";
}

export function getSelfHostUrl(): string {
  if (!browser) return "";
  return localStorage.getItem(sessionKey("logit:api:baseUrl")) ?? "";
}

export function setServerMode(mode: ServerMode, selfHostUrl?: string): void {
  if (!browser) return;
  localStorage.setItem(sessionKey(MODE_KEY), mode);
  if (mode === "selfhosted" && selfHostUrl) {
    apiClient.setBaseUrl(selfHostUrl);
  } else if (mode === "cloud") {
    apiClient.resetBaseUrl();
  }
}

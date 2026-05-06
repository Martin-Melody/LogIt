import { browser } from "$app/environment";
import { apiClient } from "./client";

export type ServerMode = "offline" | "cloud" | "selfhosted";

const MODE_KEY = "logit:server:mode";

export function getServerMode(): ServerMode {
  if (!browser) return "offline";
  return (localStorage.getItem(MODE_KEY) as ServerMode) ?? "offline";
}

export function getSelfHostUrl(): string {
  if (!browser) return "";
  return localStorage.getItem("logit:api:baseUrl") ?? "";
}

export function setServerMode(mode: ServerMode, selfHostUrl?: string): void {
  if (!browser) return;
  localStorage.setItem(MODE_KEY, mode);
  if (mode === "selfhosted" && selfHostUrl) {
    apiClient.setBaseUrl(selfHostUrl);
  } else if (mode === "cloud") {
    apiClient.resetBaseUrl();
  }
}

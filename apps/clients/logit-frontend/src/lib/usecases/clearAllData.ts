import { browser } from "$app/environment";
import { isNativePlatform } from "$lib/platform/isNative";
import { clearAllSqliteData } from "$lib/data/db/sqlite";

const LOGIT_KEY_PREFIX = "logit:";

/** Full factory reset — wipes all data on all platforms. Use for troubleshooting or account deletion. */
export async function clearAllData(): Promise<void> {
  if (!browser) return;

  if (isNativePlatform()) {
    await clearAllSqliteData();
  }

  // Clear all logit localStorage keys (covers stores, local repos, tours, onboarding)
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(LOGIT_KEY_PREFIX));
  for (const key of keys) {
    localStorage.removeItem(key);
  }

  // Hard reload so all in-memory stores and repos reinitialise from scratch
  window.location.href = "/";
}

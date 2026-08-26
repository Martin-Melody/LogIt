import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { isNativePlatform } from "../platform/isNative";

const ACCESS_KEY = "logit:auth:access";
const REFRESH_KEY = "logit:auth:refresh";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

/** Resolves to null instead of rejecting when the key doesn't exist. */
async function secureGet(key: string): Promise<string | null> {
  try {
    return (await SecureStoragePlugin.get({ key })).value;
  } catch {
    return null;
  }
}

export const tokenStorage = {
  async get(): Promise<StoredTokens | null> {
    if (isNativePlatform()) {
      // Keychain (iOS) / EncryptedSharedPreferences (Android) — tokens are the most sensitive
      // thing this app stores locally, unlike general app settings which stay in Preferences.
      const [a, r] = await Promise.all([secureGet(ACCESS_KEY), secureGet(REFRESH_KEY)]);
      if (!a || !r) return null;
      return { accessToken: a, refreshToken: r };
    }
    const raw = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (!raw || !refresh) return null;
    return { accessToken: raw, refreshToken: refresh };
  },

  async set(tokens: StoredTokens): Promise<void> {
    if (isNativePlatform()) {
      await Promise.all([
        SecureStoragePlugin.set({ key: ACCESS_KEY, value: tokens.accessToken }),
        SecureStoragePlugin.set({ key: REFRESH_KEY, value: tokens.refreshToken }),
      ]);
      return;
    }
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  },

  async clear(): Promise<void> {
    if (isNativePlatform()) {
      await Promise.all([
        SecureStoragePlugin.remove({ key: ACCESS_KEY }).catch(() => {}),
        SecureStoragePlugin.remove({ key: REFRESH_KEY }).catch(() => {}),
      ]);
      return;
    }
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

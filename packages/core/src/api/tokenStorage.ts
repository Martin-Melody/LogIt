import { Preferences } from "@capacitor/preferences";
import { isNativePlatform } from "../platform/isNative";

const ACCESS_KEY = "logit:auth:access";
const REFRESH_KEY = "logit:auth:refresh";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export const tokenStorage = {
  async get(): Promise<StoredTokens | null> {
    if (isNativePlatform()) {
      const [a, r] = await Promise.all([
        Preferences.get({ key: ACCESS_KEY }),
        Preferences.get({ key: REFRESH_KEY }),
      ]);
      if (!a.value || !r.value) return null;
      return { accessToken: a.value, refreshToken: r.value };
    }
    const raw = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (!raw || !refresh) return null;
    return { accessToken: raw, refreshToken: refresh };
  },

  async set(tokens: StoredTokens): Promise<void> {
    if (isNativePlatform()) {
      await Promise.all([
        Preferences.set({ key: ACCESS_KEY, value: tokens.accessToken }),
        Preferences.set({ key: REFRESH_KEY, value: tokens.refreshToken }),
      ]);
      return;
    }
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  },

  async clear(): Promise<void> {
    if (isNativePlatform()) {
      await Promise.all([
        Preferences.remove({ key: ACCESS_KEY }),
        Preferences.remove({ key: REFRESH_KEY }),
      ]);
      return;
    }
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

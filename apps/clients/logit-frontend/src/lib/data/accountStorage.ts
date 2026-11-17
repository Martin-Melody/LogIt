import { getActiveOwnerId } from "$lib/data/activeOwner";

/**
 * Settings that belong to the person using the app, not to the phone: the nav bar, the home
 * layout, profile cards, installed plugins and their settings, tours seen, equipment, music,
 * and the like. Several accounts can live on one phone, and these used to be stored once for
 * the whole phone, so the next account inherited them (and synced them up as its own).
 *
 * On the phone each account gets its own copy, keyed by the active account. On the web there
 * is no active account (one account per browser, and signing out clears every `logit:` key), so
 * the key is used as it is. Stores that keep a setting in memory reload it through
 * onActiveOwnerChange when the account changes.
 *
 * Device-wide things stay on plain localStorage: the server address, sign-in tokens, the log,
 * caches, the theme. Sync bookkeeping has its own per-account keys (syncStorageKey).
 */
export function accountKey(key: string): string {
  const owner = getActiveOwnerId();
  return owner ? key.replace(/^logit:/, `logit:acct:${owner}:`) : key;
}

/**
 * Reads an account setting. A value saved before settings were per account (under the plain
 * key) is handed to the first account that reads it, and only to that one: it moves across,
 * so the next account on the phone starts from the defaults.
 */
export function getAccountItem(key: string): string | null {
  try {
    const scoped = accountKey(key);
    const value = localStorage.getItem(scoped);
    if (value !== null || scoped === key) return value;
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      localStorage.setItem(scoped, legacy);
      localStorage.removeItem(key);
    }
    return legacy;
  } catch {
    return null;
  }
}

export function setAccountItem(key: string, value: string): void {
  try {
    localStorage.setItem(accountKey(key), value);
  } catch {
    // Storage full or blocked: the setting lasts until the app closes.
  }
}

export function removeAccountItem(key: string): void {
  try {
    localStorage.removeItem(accountKey(key));
  } catch {
    // Nothing to remove.
  }
}

import { getActiveOwnerId } from "$lib/data/activeOwner";

/**
 * The localStorage key for a piece of sync bookkeeping (pull cursors, last-synced time,
 * profile timestamp, the offline outbox), scoped to the active profile.
 *
 * On the phone several local profiles share one device, and these keys used to be shared
 * too: a second account's first pull started from the first account's cursor (so older
 * server data never came down), and writes the first account had queued offline were sent
 * with the second account's sign-in. Each profile now gets its own keys.
 *
 * On the web there is no active owner (one account per browser, and logout clears every
 * `logit:` key), so the key is returned unchanged.
 */
export function syncStorageKey(key: string): string {
  const owner = getActiveOwnerId();
  return owner ? key.replace(/^logit:sync:/, `logit:sync:${owner}:`) : key;
}

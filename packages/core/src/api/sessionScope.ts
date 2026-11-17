/**
 * Whose sign-in the API client is using. Several accounts can live on one phone, each signed in
 * to its own server; the phone app sets the scope to the active account, and every piece of a
 * sign-in (tokens, the cached user, the server address and mode) is stored under it, so
 * switching accounts restores that account's session without a password.
 *
 * No scope (null) is the web app, where one browser has one account, and the neutral area the
 * phone signs in from before the session is handed to the account it belongs to
 * (ApiClient.moveSessionFrom).
 */
let scope: string | null = null;

export function setSessionScope(next: string | null): void {
  scope = next;
}

export function getSessionScope(): string | null {
  return scope;
}

/** The storage key for a piece of sign-in state in a scope (the current one by default). */
export function sessionKey(key: string, forScope: string | null = scope): string {
  return forScope ? `${key}@${forScope}` : key;
}

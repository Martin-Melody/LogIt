import { browser } from "$app/environment";

const ACTIVE_OWNER_KEY = "logit:active_owner";

let _currentOwnerId: string | null = null;

export function loadActiveOwnerId(): void {
  if (!browser) return;
  _currentOwnerId = localStorage.getItem(ACTIVE_OWNER_KEY) ?? null;
}

export function getActiveOwnerId(): string | null {
  return _currentOwnerId;
}

export function setActiveOwnerId(id: string | null): void {
  _currentOwnerId = id;
  if (!browser) return;
  if (id) localStorage.setItem(ACTIVE_OWNER_KEY, id);
  else localStorage.removeItem(ACTIVE_OWNER_KEY);
}

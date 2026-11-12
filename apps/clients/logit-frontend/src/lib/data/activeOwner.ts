import { browser } from "$app/environment";

const ACTIVE_OWNER_KEY = "logit:active_owner";

let _currentOwnerId: string | null = null;
const listeners = new Set<() => void>();

/** Run `fn` whenever the active local account changes (per-account caches reload). */
export function onActiveOwnerChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

export function loadActiveOwnerId(): void {
  if (!browser) return;
  _currentOwnerId = localStorage.getItem(ACTIVE_OWNER_KEY) ?? null;
  notify();
}

export function getActiveOwnerId(): string | null {
  return _currentOwnerId;
}

export function setActiveOwnerId(id: string | null): void {
  const changed = id !== _currentOwnerId;
  _currentOwnerId = id;
  if (changed) notify();
  if (!browser) return;
  if (id) localStorage.setItem(ACTIVE_OWNER_KEY, id);
  else localStorage.removeItem(ACTIVE_OWNER_KEY);
}

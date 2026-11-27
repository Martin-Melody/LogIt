import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";

/**
 * Plugins allowed for a coach's programs only (canvas PG8): a client can let the one community
 * plugin their coach's program uses run, without turning community plugins on for everything.
 * It still runs in the sandbox, with no network. Per account on this phone; the coach is told
 * through the server (coachPluginConsent).
 */
const KEY = "logit:plugins:coach-allowed:v1";

export function coachAllowedPlugins(): Set<string> {
  try {
    const raw = getAccountItem(KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function setCoachAllowed(pluginId: string, allowed: boolean): void {
  const ids = coachAllowedPlugins();
  if (allowed) ids.add(pluginId);
  else ids.delete(pluginId);
  setAccountItem(KEY, JSON.stringify([...ids]));
}

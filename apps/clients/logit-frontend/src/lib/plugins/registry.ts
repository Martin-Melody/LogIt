import { browser } from "$app/environment";
import { writable } from "svelte/store";
import type { PluginFamily } from "./types";

export type RegistryEntry = {
  id: string;
  name: string;
  description: string;
  family: PluginFamily;
  author?: string;
  manifestUrl: string;
  tags?: string[];
  featured?: boolean;
  /** Filled in by the client — which registry this entry came from. */
  sourceUrl: string;
  sourceLabel: string;
};

export type RegistrySource = {
  url: string;
  label: string;
  /** The bundled default registry — always present, cannot be removed. */
  builtin: boolean;
};

/**
 * A registry is just a static JSON array of entries. The app ships with two
 * built-in sources — the community registry and a handful of bundled example
 * plugins — and users (or self-hosters) can point at more. Discovery never
 * needs a server: install-by-URL and install-by-paste always work with no
 * registry at all.
 */
const COMMUNITY_REGISTRY_URL = import.meta.env.DEV
  ? "/sample-plugins/registry.json"
  : "https://martin-melody.github.io/logit-plugin-registry/registry.json";

/** Bundled with the app — always reachable, works fully offline. */
const BUNDLED_REGISTRY_URL = "/sample-plugins/registry.json";

export function builtinRegistrySources(): RegistrySource[] {
  // Bundled first: it's same-origin, always reachable, and its entries win the
  // de-dupe. The remote community registry is a bonus that must never gate the UI.
  const sources: RegistrySource[] = [
    { url: BUNDLED_REGISTRY_URL, label: "Bundled examples", builtin: true },
  ];
  // In dev the community URL already points at the bundled file — don't list it twice.
  if (BUNDLED_REGISTRY_URL !== COMMUNITY_REGISTRY_URL) {
    sources.push({ url: COMMUNITY_REGISTRY_URL, label: "Logit registry", builtin: true });
  }
  return sources;
}

const STORAGE_KEY = "logit:plugins:registries:v1";

const KNOWN_FAMILIES: ReadonlySet<string> = new Set<PluginFamily>([
  "widget", "progression-algorithm", "exercise-pack", "analytics",
  "nutrition-algorithm", "nutrition-analytics",
]);

// ── User registry sources ────────────────────────────────────────────────────

function loadUserSources(): RegistrySource[] {
  if (!browser) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is { url: string; label?: string } =>
          !!s && typeof s === "object" && typeof (s as { url: unknown }).url === "string",
      )
      .map((s) => ({ url: s.url, label: s.label || hostLabel(s.url), builtin: false }));
  } catch {
    return [];
  }
}

function saveUserSources(sources: RegistrySource[]): void {
  if (!browser) return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sources.map((s) => ({ url: s.url, label: s.label }))),
  );
}

function hostLabel(url: string): string {
  try {
    return new URL(url, browser ? location.origin : "https://logit.ie").host || url;
  } catch {
    return url;
  }
}

function createRegistrySourcesStore() {
  const store = writable<RegistrySource[]>([...builtinRegistrySources(), ...loadUserSources()]);

  function persist(all: RegistrySource[]) {
    saveUserSources(all.filter((s) => !s.builtin));
    store.set(all);
  }

  return {
    subscribe: store.subscribe,
    add(url: string, label?: string): void {
      const trimmed = url.trim();
      if (!trimmed) return;
      let normalized: string;
      try {
        normalized = new URL(trimmed).toString();
      } catch {
        throw new Error("That doesn't look like a valid URL.");
      }
      store.update((all) => {
        if (all.some((s) => s.url === normalized)) return all;
        return persistReturn([
          ...all,
          { url: normalized, label: label?.trim() || hostLabel(normalized), builtin: false },
        ]);
      });
    },
    remove(url: string): void {
      store.update((all) => persistReturn(all.filter((s) => s.builtin || s.url !== url)));
    },
  };

  function persistReturn(all: RegistrySource[]): RegistrySource[] {
    persist(all);
    return all;
  }
}

export const registrySources = createRegistrySourcesStore();

// ── Fetching + merging ───────────────────────────────────────────────────────

function isValidRawEntry(v: unknown): v is Omit<RegistryEntry, "sourceUrl" | "sourceLabel"> {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" && e.id.length > 0 &&
    typeof e.name === "string" && e.name.length > 0 &&
    typeof e.description === "string" &&
    typeof e.family === "string" && KNOWN_FAMILIES.has(e.family) &&
    typeof e.manifestUrl === "string" && e.manifestUrl.length > 0
  );
}

/** Per-source fetch timeout — a slow or unreachable registry must not stall the rest. */
const FETCH_TIMEOUT_MS = 8000;

async function fetchOneRegistry(source: RegistrySource): Promise<RegistryEntry[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(source.url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(
      controller.signal.aborted
        ? `${source.label} timed out`
        : `${source.label} unavailable`,
      { cause: e },
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`${source.label} unavailable (${res.status})`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error(`${source.label} returned an invalid registry`);
  return data
    .filter(isValidRawEntry)
    .map((e) => ({ ...e, sourceUrl: source.url, sourceLabel: source.label }));
}

export type RegistryFetchResult = {
  entries: RegistryEntry[];
  errors: string[];
  /** True while this result is served from cache and a fresh fetch is still running. */
  stale?: boolean;
};

const CACHE_KEY = "logit:plugins:registry-cache:v1";

function readCache(): RegistryEntry[] | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as RegistryEntry[]) : null;
  } catch {
    return null;
  }
}

function writeCache(entries: RegistryEntry[]): void {
  if (browser) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
    } catch {
      /* quota — non-fatal */
    }
  }
}

/** Return partial results after this long rather than waiting on a slow source. */
const SOFT_DEADLINE_MS = 4000;

function merge(results: RegistryEntry[][]): RegistryEntry[] {
  const seen = new Set<string>();
  const out: RegistryEntry[] = [];
  for (const list of results) {
    for (const entry of list) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

/**
 * Fetch every configured registry and merge. Each source has its own timeout,
 * and the whole call returns after a soft deadline with whatever has arrived —
 * a slow or unreachable registry never blocks the UI. Slower sources keep going
 * and refresh the cache in the background. If nothing arrives, the last good
 * merge (cache) is returned.
 */
export async function fetchRegistry(sources?: RegistrySource[]): Promise<RegistryFetchResult> {
  const list = sources ?? [...builtinRegistrySources(), ...loadUserSources()];

  const ok: RegistryEntry[][] = [];
  const errors: string[] = [];
  let done = 0;

  const jobs = list.map((source) =>
    fetchOneRegistry(source).then(
      (entries) => {
        ok.push(entries);
        done += 1;
      },
      (reason: unknown) => {
        errors.push(reason instanceof Error ? reason.message : `${source.label} failed`);
        done += 1;
      },
    ),
  );

  const all = Promise.allSettled(jobs);
  await Promise.race([all, new Promise((r) => setTimeout(r, SOFT_DEADLINE_MS))]);

  // Keep merging into the cache once the stragglers finish.
  if (done < list.length) {
    void all.then(() => {
      if (ok.length > 0) writeCache(merge(ok));
    });
  }

  if (ok.length > 0) {
    const entries = merge(ok);
    writeCache(entries);
    return { entries, errors, stale: done < list.length };
  }

  const cached = readCache();
  if (cached && cached.length > 0) return { entries: cached, errors, stale: true };
  return { entries: [], errors };
}

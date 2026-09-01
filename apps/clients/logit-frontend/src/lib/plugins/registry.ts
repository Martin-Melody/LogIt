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
 * A registry is just a static JSON array of entries. The app ships with one
 * default; users (and self-hosters) can point at more. Discovery never needs a
 * server — install-by-URL and install-by-paste always work with no registry at
 * all.
 */
export const DEFAULT_REGISTRY_URL = import.meta.env.DEV
  ? "/sample-plugins/registry.json"
  : "https://martin-melody.github.io/logit-plugin-registry/registry.json";

const DEFAULT_SOURCE: RegistrySource = {
  url: DEFAULT_REGISTRY_URL,
  label: "Logit registry",
  builtin: true,
};

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
  const store = writable<RegistrySource[]>([DEFAULT_SOURCE, ...loadUserSources()]);

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

async function fetchOneRegistry(source: RegistrySource): Promise<RegistryEntry[]> {
  const res = await fetch(source.url, { headers: { Accept: "application/json" } });
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
};

/**
 * Fetch every configured registry and merge. One bad source never blocks the
 * others — its error is collected and returned. Entry ids are de-duplicated,
 * first source (default registry first) wins.
 */
export async function fetchRegistry(sources?: RegistrySource[]): Promise<RegistryFetchResult> {
  const list = sources ?? [DEFAULT_SOURCE, ...loadUserSources()];
  const settled = await Promise.allSettled(list.map(fetchOneRegistry));

  const seen = new Set<string>();
  const entries: RegistryEntry[] = [];
  const errors: string[] = [];

  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      errors.push(
        result.reason instanceof Error ? result.reason.message : `${list[i]!.label} failed`,
      );
      return;
    }
    for (const entry of result.value) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push(entry);
    }
  });

  return { entries, errors };
}

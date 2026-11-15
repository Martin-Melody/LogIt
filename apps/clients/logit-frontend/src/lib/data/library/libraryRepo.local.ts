import { browser } from "$app/environment";
import type { CoachLibraryItem, LibraryRepo, OwnLibraryItem } from "@logit/core/data/libraryRepo";

// The browser build keeps one flat list, like the rest of its web-only state.
const OWN_KEY = "logit:library:own:v1";
const COACH_KEY = "logit:library:coach:v1";

function read<T>(key: string): T[] {
  if (!browser) return [];
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[]) {
  if (browser) localStorage.setItem(key, JSON.stringify(items));
}

export function createLocalLibraryRepo(): LibraryRepo {
  return {
    async listOwn(kind) {
      return read<OwnLibraryItem>(OWN_KEY)
        .filter((e) => !kind || e.kind === kind)
        .sort((a, b) => a.item.name.localeCompare(b.item.name));
    },
    async getOwn(id) {
      return read<OwnLibraryItem>(OWN_KEY).find((e) => e.item.id === id) ?? null;
    },
    async saveOwn(entry) {
      const rest = read<OwnLibraryItem>(OWN_KEY).filter((e) => e.item.id !== entry.item.id);
      write(OWN_KEY, [...rest, entry]);
    },
    async removeOwn(id) {
      write(OWN_KEY, read<OwnLibraryItem>(OWN_KEY).filter((e) => e.item.id !== id));
    },
    async listFromCoaches() {
      return read<CoachLibraryItem>(COACH_KEY);
    },
    async replaceFromCoaches(items) {
      write(COACH_KEY, items);
    },
  };
}

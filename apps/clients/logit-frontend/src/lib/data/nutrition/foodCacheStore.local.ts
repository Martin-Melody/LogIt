import { browser } from "$app/environment";
import type { FoodCacheStore } from "@logit/core/data/cachingFoodDbRepo";
import type { FoodRef } from "@logit/core/domain/nutrition";

const KEY = "logit:foodCache:v1"; // Record<id, FoodRef & { cachedAtMs }>

type Entry = FoodRef & { cachedAtMs: number };

function readAll(): Record<string, Entry> {
  if (!browser) return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Entry>;
  } catch {
    return {};
  }
}

function writeAll(m: Record<string, Entry>): void {
  if (!browser) return;
  // Keep the cache bounded — drop the oldest entries past a soft cap.
  const entries = Object.values(m);
  if (entries.length > 1500) {
    entries.sort((a, b) => b.cachedAtMs - a.cachedAtMs);
    m = Object.fromEntries(entries.slice(0, 1200).map((e) => [e.id, e]));
  }
  localStorage.setItem(KEY, JSON.stringify(m));
}

/** localStorage-backed cache of online Open Food Facts lookups (web builds). */
export function createLocalFoodCacheStore(): FoodCacheStore {
  return {
    async getByBarcode(barcode) {
      const bc = barcode.trim();
      return Object.values(readAll()).find((f) => f.barcode === bc) ?? null;
    },

    async getById(id) {
      return readAll()[id] ?? null;
    },

    async search(q, limit) {
      const ql = q.trim().toLowerCase();
      if (!ql) return [];
      return Object.values(readAll())
        .filter(
          (f) =>
            f.name.toLowerCase().includes(ql) ||
            (f.brand ?? "").toLowerCase().includes(ql),
        )
        .sort((a, b) => b.cachedAtMs - a.cachedAtMs)
        .slice(0, limit);
    },

    async put(foods) {
      if (foods.length === 0) return;
      const map = readAll();
      const now = Date.now();
      for (const f of foods) map[f.id] = { ...f, cachedAtMs: now };
      writeAll(map);
    },
  };
}

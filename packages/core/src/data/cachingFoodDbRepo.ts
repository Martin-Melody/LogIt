import type { FoodDbRepo, FoodSearchOptions } from "./foodDbRepo";
import type { FoodRef } from "../domain/nutrition";

/**
 * A small writable store for foods pulled from the online Open Food Facts lookup, so they're
 * available offline the next time. Reference data — not owner-scoped, not synced. Backed by
 * a SQLite table on native and localStorage on web (see the frontend implementations).
 */
export interface FoodCacheStore {
  getByBarcode(barcode: string): Promise<FoodRef | null>;
  getById(id: string): Promise<FoodRef | null>;
  /** Case-insensitive substring match over name + brand, most-recently-cached first. */
  search(query: string, limit: number): Promise<FoodRef[]>;
  /** Upsert; keyed on FoodRef.id. Cheap no-op on an empty list. */
  put(foods: FoodRef[]): Promise<void>;
}

export interface CachingFoodDbRepoDeps {
  /** The bundled read-only DB repo, or null when this build shipped without the asset. */
  bundled: FoodDbRepo | null;
  /** Writable local cache of previously-fetched online results. */
  cache: FoodCacheStore;
  /** Online source (Open Food Facts). Its hits are written back into `cache`. */
  online: FoodDbRepo;
  /** Gate the online calls (default: `navigator.onLine`, or always-on off-browser). */
  isOnline?: () => boolean;
}

/** Below this many local hits, a search also reaches for the online source. */
const THIN_RESULTS = 8;

function defaultIsOnline(): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    return navigator.onLine;
  }
  return true;
}

function dedupe(...lists: FoodRef[][]): FoodRef[] {
  const seen = new Set<string>();
  const out: FoodRef[] = [];
  for (const list of lists) {
    for (const f of list) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
  }
  return out;
}

/**
 * Layers bundled DB → local cache → online, and folds every online result back into the
 * cache. Also the only place a build *with* a bundled DB gets an online fallback for
 * barcode misses.
 */
export function createCachingFoodDbRepo(deps: CachingFoodDbRepoDeps): FoodDbRepo {
  const { bundled, cache, online } = deps;
  const isOnline = deps.isOnline ?? defaultIsOnline;

  async function cachePut(foods: FoodRef[]): Promise<void> {
    if (foods.length === 0) return;
    try {
      await cache.put(foods);
    } catch {
      /* cache is best-effort */
    }
  }

  return {
    isOfflineAvailable: () => bundled?.isOfflineAvailable() ?? false,

    async searchFoods(query, opts: FoodSearchOptions = {}) {
      const q = query.trim();
      if (!q) return [];
      const limit = Math.min(opts.limit ?? 25, 100);

      const [fromBundled, fromCache] = await Promise.all([
        bundled ? bundled.searchFoods(q, opts).catch(() => []) : Promise.resolve([]),
        cache.search(q, limit).catch(() => []),
      ]);

      let merged = dedupe(fromBundled, filterSource(fromCache, opts));

      // Reach online when local coverage is thin. Online only has packaged ("off") foods,
      // so skip it when the caller asked specifically for generics.
      if (merged.length < THIN_RESULTS && opts.source !== "usda" && isOnline()) {
        const fromOnline = await online.searchFoods(q, { ...opts, limit }).catch(() => []);
        await cachePut(fromOnline);
        merged = dedupe(merged, fromOnline);
      }

      return merged.slice(0, limit);
    },

    async getFood(id) {
      const local =
        (bundled ? await bundled.getFood(id).catch(() => null) : null) ??
        (await cache.getById(id).catch(() => null));
      if (local) return local;

      if (!isOnline()) return null;
      const remote = await online.getFood(id).catch(() => null);
      if (remote) await cachePut([remote]);
      return remote;
    },

    async getFoodByBarcode(barcode) {
      const code = barcode.trim();
      if (!code) return null;

      const local =
        (bundled ? await bundled.getFoodByBarcode(code).catch(() => null) : null) ??
        (await cache.getByBarcode(code).catch(() => null));
      if (local) return local;

      if (!isOnline()) return null;
      const remote = await online.getFoodByBarcode(code).catch(() => null);
      if (remote) await cachePut([remote]);
      return remote;
    },
  };
}

function filterSource(foods: FoodRef[], opts: FoodSearchOptions): FoodRef[] {
  return opts.source ? foods.filter((f) => f.source === opts.source) : foods;
}

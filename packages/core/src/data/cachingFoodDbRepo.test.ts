import { describe, it, expect } from "vitest";
import { createCachingFoodDbRepo, type FoodCacheStore } from "./cachingFoodDbRepo";
import type { FoodDbRepo } from "./foodDbRepo";
import type { FoodRef } from "../domain/nutrition";

function food(id: string, name: string, barcode?: string): FoodRef {
  return {
    id,
    source: barcode ? "off" : "usda",
    name,
    barcode,
    per100g: { kcal: 100, proteinG: 5, carbsG: 10, fatG: 2 },
    servings: [{ id: "g", label: "100 g", grams: 100 }],
  };
}

function memoryCache(): FoodCacheStore & { store: Map<string, FoodRef>; puts: number } {
  const store = new Map<string, FoodRef>();
  return {
    store,
    puts: 0,
    async getByBarcode(bc) {
      return [...store.values()].find((f) => f.barcode === bc) ?? null;
    },
    async getById(id) {
      return store.get(id) ?? null;
    },
    async search(q, limit) {
      const ql = q.toLowerCase();
      return [...store.values()].filter((f) => f.name.toLowerCase().includes(ql)).slice(0, limit);
    },
    async put(foods) {
      this.puts++;
      for (const f of foods) store.set(f.id, f);
    },
  };
}

function fakeRepo(opts: {
  byBarcode?: Record<string, FoodRef>;
  search?: FoodRef[];
  onCall?: () => void;
}): FoodDbRepo {
  return {
    isOfflineAvailable: () => true,
    async getFood(id) {
      opts.onCall?.();
      return Object.values(opts.byBarcode ?? {}).find((f) => f.id === id) ?? null;
    },
    async getFoodByBarcode(bc) {
      opts.onCall?.();
      return opts.byBarcode?.[bc] ?? null;
    },
    async searchFoods() {
      opts.onCall?.();
      return opts.search ?? [];
    },
  };
}

describe("createCachingFoodDbRepo", () => {
  it("serves a bundled barcode hit without touching the cache or the network", async () => {
    let onlineCalls = 0;
    const cache = memoryCache();
    const repo = createCachingFoodDbRepo({
      bundled: fakeRepo({ byBarcode: { "123": food("off:123", "Bundled Bar", "123") } }),
      cache,
      online: fakeRepo({ onCall: () => onlineCalls++ }),
      isOnline: () => true,
    });

    const hit = await repo.getFoodByBarcode("123");
    expect(hit?.name).toBe("Bundled Bar");
    expect(onlineCalls).toBe(0);
    expect(cache.puts).toBe(0);
  });

  it("falls through to online on a miss, caches it, and reuses the cache next time", async () => {
    let onlineCalls = 0;
    const cache = memoryCache();
    const repo = createCachingFoodDbRepo({
      bundled: fakeRepo({}),
      cache,
      online: fakeRepo({
        byBarcode: { "999": food("off:999", "Online Snack", "999") },
        onCall: () => onlineCalls++,
      }),
      isOnline: () => true,
    });

    const first = await repo.getFoodByBarcode("999");
    expect(first?.name).toBe("Online Snack");
    expect(onlineCalls).toBe(1);
    expect(cache.store.get("off:999")).toBeTruthy();

    const second = await repo.getFoodByBarcode("999");
    expect(second?.name).toBe("Online Snack");
    expect(onlineCalls).toBe(1); // served from cache
  });

  it("reaches online for search only when local results are thin", async () => {
    let onlineCalls = 0;
    const thick = Array.from({ length: 10 }, (_, i) => food(`usda:${i}`, `Oats ${i}`));
    const repo = createCachingFoodDbRepo({
      bundled: fakeRepo({ search: thick }),
      cache: memoryCache(),
      online: fakeRepo({ onCall: () => onlineCalls++ }),
      isOnline: () => true,
    });

    await repo.searchFoods("oats");
    expect(onlineCalls).toBe(0);
  });

  it("merges + caches online search results when local coverage is thin", async () => {
    let onlineCalls = 0;
    const cache = memoryCache();
    const repo = createCachingFoodDbRepo({
      bundled: fakeRepo({ search: [food("usda:1", "Oat milk")] }),
      cache,
      online: fakeRepo({
        search: [food("off:5", "Oatly Barista", "5"), food("off:6", "Oat bar", "6")],
        onCall: () => onlineCalls++,
      }),
      isOnline: () => true,
    });

    const results = await repo.searchFoods("oat");
    expect(onlineCalls).toBe(1);
    expect(results.map((r) => r.id)).toEqual(["usda:1", "off:5", "off:6"]);
    expect(cache.puts).toBe(1);
    expect(cache.store.size).toBe(2);
  });

  it("never calls online when offline", async () => {
    let onlineCalls = 0;
    const repo = createCachingFoodDbRepo({
      bundled: fakeRepo({}),
      cache: memoryCache(),
      online: fakeRepo({
        byBarcode: { "1": food("off:1", "x", "1") },
        onCall: () => onlineCalls++,
      }),
      isOnline: () => false,
    });

    expect(await repo.getFoodByBarcode("1")).toBeNull();
    expect(await repo.searchFoods("anything")).toEqual([]);
    expect(onlineCalls).toBe(0);
  });

  it("skips the online source when the caller asked for generics only", async () => {
    let onlineCalls = 0;
    const repo = createCachingFoodDbRepo({
      bundled: fakeRepo({ search: [food("usda:1", "Rice")] }),
      cache: memoryCache(),
      online: fakeRepo({ onCall: () => onlineCalls++ }),
      isOnline: () => true,
    });

    await repo.searchFoods("rice", { source: "usda" });
    expect(onlineCalls).toBe(0);
  });

  it("reports offline availability from the bundled repo", () => {
    const withBundle = createCachingFoodDbRepo({
      bundled: fakeRepo({}),
      cache: memoryCache(),
      online: fakeRepo({}),
    });
    const without = createCachingFoodDbRepo({
      bundled: null,
      cache: memoryCache(),
      online: fakeRepo({}),
    });
    expect(withBundle.isOfflineAvailable()).toBe(true);
    expect(without.isOfflineAvailable()).toBe(false);
  });
});

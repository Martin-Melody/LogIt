import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenFoodFactsRepo } from "./openFoodFactsRepo";

const hit = {
  code: "5000000000001",
  product_name: "Skyr Natural",
  brands: ["Arla"],
  nutriments: { "energy-kcal_100g": 63, proteins_100g: 11, carbohydrates_100g: 4, fat_100g: 0.2 },
};

function respond(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("open food facts search in a browser", () => {
  beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null }));
  afterEach(() => vi.unstubAllGlobals());

  it("goes through the LogIt server's /foods/search", async () => {
    const fetch = vi.fn(async () => respond({ hits: [hit] }));
    vi.stubGlobal("fetch", fetch);

    const found = await createOpenFoodFactsRepo().searchFoods("skyr", { limit: 5 });

    expect(String(fetch.mock.calls[0][0])).toMatch(/\/foods\/search\?q=skyr&limit=5$/);
    expect(found[0]).toMatchObject({ id: "off:5000000000001", name: "Skyr Natural", brand: "Arla" });
  });

  it("falls back to the old Open Food Facts search when the server can't help", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes("/foods/search") ? respond({}, false) : respond({ products: [{ ...hit, brands: "Arla, Other" }] }),
    );
    vi.stubGlobal("fetch", fetch);

    const found = await createOpenFoodFactsRepo().searchFoods("skyr");

    expect(String(fetch.mock.calls[1][0])).toContain("world.openfoodfacts.org/cgi/search.pl");
    expect(found[0]?.brand).toBe("Arla");
  });
});

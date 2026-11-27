import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brandName, createOpenFoodFactsRepo } from "./openFoodFactsRepo";

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
    const fetch = vi.fn(async (_url: string) => respond({ hits: [hit] }));
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

describe("open food facts nutrients", async () => {
  const { offNutrients } = await import("./openFoodFactsRepo");

  it("converts grams to our units and works salt out from sodium", () => {
    expect(
      offNutrients({ fiber_100g: 6.5, sugars_100g: "12", "saturated-fat_100g": 1.2, sodium_100g: 0.2, iron_100g: 0.0084, "vitamin-d_100g": 0.0000042 }),
    ).toEqual({ fibreG: 6.5, sugarG: 12, satFatG: 1.2, saltG: 0.5, ironMg: 8.4, vitDUg: 4.2 });
  });

  it("drops values that can't be right", () => {
    // 5 g of iron per 100 g is a unit typed wrong (mg entered as g).
    expect(offNutrients({ iron_100g: 5, fiber_100g: 400 })).toBeUndefined();
    expect(offNutrients({})).toBeUndefined();
  });
});

describe("brand names", () => {
  it("brand tags read as names; names stay as they are", () => {
    expect(brandName("xx:kirkland")).toBe("Kirkland");
    expect(brandName("en:tesco-finest")).toBe("Tesco Finest");
    expect(brandName("Arla")).toBe("Arla");
    expect(brandName(" ")).toBeUndefined();
  });
});

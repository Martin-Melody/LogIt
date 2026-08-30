import type { FoodDbRepo, FoodSearchOptions } from "../foodDbRepo";
import type { FoodRef } from "../../domain/nutrition";

// An online-only FoodDbRepo backed by the Open Food Facts API. Used where there's no
// bundled food.db — the web builds, and a mobile build that shipped without the asset.
// Generic ("usda") whole foods aren't available here; the UI still has custom foods/recipes.

const OFF_BASE = "https://world.openfoodfacts.org";
const FIELDS = "code,product_name,brands,nutriments,serving_quantity,serving_size";

type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string>;
};

function kcal(n: Record<string, number | string> = {}): number {
  const direct = Number(n["energy-kcal_100g"]);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const kj = Number(n["energy_100g"]);
  return Number.isFinite(kj) && kj > 0 ? kj / 4.184 : NaN;
}

function macro(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? Math.min(x, 100) : 0;
}

function toFoodRef(p: OffProduct): FoodRef | null {
  const barcode = String(p.code ?? "").trim();
  const name = String(p.product_name ?? "").trim();
  const energy = kcal(p.nutriments);
  if (!barcode || !name || !Number.isFinite(energy)) return null;

  const servings = [{ id: "g", label: "100 g", grams: 100 }];
  const sq = Number(p.serving_quantity);
  if (Number.isFinite(sq) && sq > 0 && sq <= 2000) {
    servings.push({ id: "serving", label: String(p.serving_size || "serving").trim(), grams: sq });
  }

  return {
    id: `off:${barcode}`,
    source: "off",
    name,
    brand: String(p.brands ?? "").split(",")[0].trim() || undefined,
    barcode,
    per100g: {
      kcal: Math.round(Math.min(energy, 950) * 10) / 10,
      proteinG: macro(p.nutriments?.["proteins_100g"]),
      carbsG: macro(p.nutriments?.["carbohydrates_100g"]),
      fatG: macro(p.nutriments?.["fat_100g"]),
    },
    servings,
  };
}

export function createOpenFoodFactsRepo(): FoodDbRepo {
  return {
    isOfflineAvailable: () => false,

    async searchFoods(q, opts: FoodSearchOptions = {}) {
      if (!q.trim()) return [];
      const limit = Math.min(opts.limit ?? 25, 50);
      const url =
        `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
        `&search_simple=1&action=process&json=1&page_size=${limit}&fields=${FIELDS}`;
      try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const body = (await res.json()) as { products?: OffProduct[] };
        return (body.products ?? [])
          .map(toFoodRef)
          .filter((f): f is FoodRef => f !== null);
      } catch {
        return [];
      }
    },

    async getFood(id) {
      const barcode = id.startsWith("off:") ? id.slice(4) : id;
      return this.getFoodByBarcode(barcode);
    },

    async getFoodByBarcode(barcode) {
      try {
        const res = await fetch(
          `${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode.trim())}.json?fields=${FIELDS}`,
        );
        if (!res.ok) return null;
        const body = (await res.json()) as { status?: number; product?: OffProduct };
        return body.status === 1 && body.product ? toFoodRef(body.product) : null;
      } catch {
        return null;
      }
    },
  };
}

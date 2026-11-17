import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { FoodDbRepo, FoodSearchOptions } from "../foodDbRepo";
import { nutrientDef, type FoodRef, type NutrientId, type Nutrients } from "../../domain/nutrition";
import { apiBaseUrl } from "../../api/client";

// An online-only FoodDbRepo backed by the Open Food Facts API. Used where there's no
// bundled food.db (the web builds, and a mobile build that shipped without the asset), and
// on top of it for packaged products the bundled copy doesn't have. Generic ("usda") whole
// foods aren't available here; the UI still has custom foods/recipes.

const OFF_BASE = "https://world.openfoodfacts.org";
/** Search-a-licious: OFF's newer search. Much better ranking than cgi/search.pl, and it
 * tolerates typos and word order. */
const OFF_SEARCH = "https://search.openfoodfacts.org/search";
const FIELDS = "code,product_name,product_name_en,brands,nutriments,serving_quantity,serving_size";

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  /** A comma-separated string from the product API, an array from search-a-licious. */
  brands?: string | string[];
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

/** Open Food Facts nutriment keys. Every *_100g value there is in grams, whatever the unit
 * on the pack. */
const OFF_NUTRIENTS: [NutrientId, string][] = [
  ["fibreG", "fiber"], ["sugarG", "sugars"], ["satFatG", "saturated-fat"], ["saltG", "salt"],
  ["vitAUg", "vitamin-a"], ["thiaminMg", "vitamin-b1"], ["riboflavinMg", "vitamin-b2"],
  ["niacinMg", "vitamin-pp"], ["vitB6Mg", "vitamin-b6"], ["folateUg", "vitamin-b9"],
  ["vitB12Ug", "vitamin-b12"], ["vitCMg", "vitamin-c"], ["vitDUg", "vitamin-d"],
  ["vitEMg", "vitamin-e"], ["vitKUg", "vitamin-k"], ["calciumMg", "calcium"], ["ironMg", "iron"],
  ["magnesiumMg", "magnesium"], ["potassiumMg", "potassium"], ["zincMg", "zinc"],
];
const FROM_GRAMS = { g: 1, mg: 1000, "µg": 1_000_000 } as const;

/** What a product's nutriments say per 100 g, in our units. Values that can't be right
 * (more than 100 g, or 20 days' worth of a vitamin in 100 g: a unit typed wrong) are left out. */
export function offNutrients(n: Record<string, number | string> = {}): Nutrients | undefined {
  const out: Nutrients = {};
  let any = false;
  for (const [id, key] of OFF_NUTRIENTS) {
    let grams = Number(n[`${key}_100g`]);
    if (id === "saltG" && !(Number.isFinite(grams) && n[`${key}_100g`] !== "")) {
      const sodium = Number(n["sodium_100g"]);
      grams = Number.isFinite(sodium) && n["sodium_100g"] !== "" ? sodium * 2.5 : Number.NaN;
    }
    if (!Number.isFinite(grams) || grams < 0 || grams > 100) continue;
    const def = nutrientDef(id);
    const v = grams * FROM_GRAMS[def.unit];
    if (def.group !== "label" && def.daily && v > def.daily * 20) continue;
    out[id] = Math.round(v * 1000) / 1000;
    any = true;
  }
  return any ? out : undefined;
}

function toFoodRef(p: OffProduct): FoodRef | null {
  const barcode = String(p.code ?? "").trim();
  const name = String(p.product_name_en || p.product_name || "").trim();
  const energy = kcal(p.nutriments);
  if (!barcode || !name || !Number.isFinite(energy)) return null;
  const nutrients = offNutrients(p.nutriments);

  const servings = [{ id: "g", label: "100 g", grams: 100 }];
  const sq = Number(p.serving_quantity);
  if (Number.isFinite(sq) && sq > 0 && sq <= 2000) {
    servings.push({ id: "serving", label: String(p.serving_size || "serving").trim(), grams: sq });
  }

  return {
    id: `off:${barcode}`,
    source: "off",
    name,
    brand: (Array.isArray(p.brands) ? String(p.brands[0] ?? "") : String(p.brands ?? "").split(",")[0]).trim() || undefined,
    barcode,
    per100g: {
      kcal: Math.round(Math.min(energy, 950) * 10) / 10,
      proteinG: macro(p.nutriments?.["proteins_100g"]),
      carbsG: macro(p.nutriments?.["carbohydrates_100g"]),
      fatG: macro(p.nutriments?.["fat_100g"]),
    },
    ...(nutrients ? { nutrients } : {}),
    servings,
  };
}

function parse(products: OffProduct[] | undefined): FoodRef[] {
  return (products ?? []).map(toFoodRef).filter((f): f is FoodRef => f !== null);
}

/**
 * null when the service didn't answer, so the caller can try the old endpoint. The new
 * search sends no CORS headers, so only the native app calls it directly (CapacitorHttp makes
 * the request outside the web view); a browser goes through the LogIt server's
 * /foods/search, which forwards to it.
 */
async function searchNew(q: string, limit: number): Promise<FoodRef[] | null> {
  if (!Capacitor.isNativePlatform()) return searchViaServer(q, limit);
  try {
    const res = await CapacitorHttp.get({
      url: `${OFF_SEARCH}?q=${encodeURIComponent(q)}&page_size=${limit}&fields=${FIELDS}`,
      responseType: "json",
      // Open Food Facts asks apps to identify themselves.
      headers: { "User-Agent": "LogIt/1.0 (https://getlogit.app)" },
      connectTimeout: 8000,
      readTimeout: 8000,
    });
    if (res.status < 200 || res.status >= 300) return null;
    const body = (typeof res.data === "string" ? JSON.parse(res.data) : res.data) as { hits?: OffProduct[] };
    return Array.isArray(body?.hits) ? parse(body.hits) : null;
  } catch {
    return null;
  }
}

async function searchViaServer(q: string, limit: number): Promise<FoodRef[] | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/foods/search?q=${encodeURIComponent(q)}&limit=${limit}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { hits?: OffProduct[] };
    return Array.isArray(body?.hits) ? parse(body.hits) : null;
  } catch {
    return null;
  }
}

async function searchLegacy(q: string, limit: number): Promise<FoodRef[]> {
  try {
    const res = await fetch(
      `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
        `&search_simple=1&action=process&json=1&page_size=${limit}&fields=${FIELDS}`,
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { products?: OffProduct[] };
    return parse(body.products);
  } catch {
    return [];
  }
}

export function createOpenFoodFactsRepo(): FoodDbRepo {
  return {
    isOfflineAvailable: () => false,

    async searchFoods(q, opts: FoodSearchOptions = {}) {
      if (!q.trim()) return [];
      const limit = Math.min(opts.limit ?? 25, 50);
      const fromNew = await searchNew(q, limit);
      if (fromNew !== null) return fromNew;
      return searchLegacy(q, limit);
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

import type { FoodRef } from "../domain/nutrition";

/**
 * Read-only lookup over the bundled food database (USDA FoodData Central + a curated Open
 * Food Facts subset, shipped as a SQLite file with FTS5). Not synced, not owner-scoped —
 * it's reference data. On web, where there's no bundled DB, the implementation calls the
 * Open Food Facts API instead.
 *
 * Custom foods and recipes are NOT served here — they come from NutritionRepo; the UI
 * merges the two result sets.
 */
export interface FoodDbRepo {
  /** Full-text search over name + brand. */
  searchFoods(query: string, opts?: FoodSearchOptions): Promise<FoodRef[]>;
  getFood(id: string): Promise<FoodRef | null>;
  /** Exact barcode (EAN/UPC) lookup. Returns null on a miss — the caller may then offer an
   * online lookup or a "create custom food" path. */
  getFoodByBarcode(barcode: string): Promise<FoodRef | null>;
  /** Whether a local bundled DB is available (false on web → online-only). */
  isOfflineAvailable(): boolean;
}

export type FoodSearchOptions = {
  limit?: number;
  /** Restrict to one source, e.g. only whole foods ("usda") or only packaged ("off"). */
  source?: FoodRef["source"];
};

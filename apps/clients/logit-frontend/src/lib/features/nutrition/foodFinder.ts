import {
  recipeAsFood,
  recipeHasRealGrams,
  type CustomFood,
  type FoodRef,
  type MealTemplate,
  type ParsedIngredientLine,
  type Recipe,
} from "@logit/core/domain/nutrition";
import { rankByQuery, sameFoodKey } from "@logit/core/nutrition/foodSearch";
import { getFoodDbRepo, getNutritionRepo } from "$lib/data/repoProvider";
import { isRealServing } from "./portion";

// One search over everything a person can log: their own foods and recipes (and saved
// meals, when logging), then the food database split into plain foods and packaged
// products. Every screen that searches for food goes through here, so they all find the
// same things the same way.

export type FoundFood = {
  food: FoodRef;
  kind: "custom" | "recipe" | "generic" | "packaged";
  /** For recipes: whether amounts are real grams of cooked food. */
  realGrams?: boolean;
};

/** Id prefix for a food rebuilt from a logged entry (its source is gone); it's logged
 * without a source id. */
export const SNAPSHOT_PREFIX = "snapshot:";

export type FoodFilter = "all" | "mine" | "generic" | "packaged";

export type FoodSearchResult = {
  mine: FoundFood[];
  meals: MealTemplate[];
  generic: FoundFood[];
  packaged: FoundFood[];
  /** True when there may be more packaged products online than were asked for. */
  canAskOnline: boolean;
};

export type MyFoods = { custom: CustomFood[]; recipes: Recipe[]; meals: MealTemplate[] };

export async function loadMyFoods(): Promise<MyFoods> {
  const repo = getNutritionRepo();
  const [custom, recipes, meals] = await Promise.all([
    repo.listCustomFoods(),
    repo.listRecipes(),
    repo.listMealTemplates(),
  ]);
  return {
    custom: custom.filter((c) => !c.deletedAtMs),
    recipes: recipes.filter((r) => !r.deletedAtMs),
    meals: meals.filter((m) => !m.deletedAtMs),
  };
}

export function recipeFound(r: Recipe): FoundFood {
  return { food: recipeAsFood(r), kind: "recipe", realGrams: recipeHasRealGrams(r) };
}

export async function searchFoods(
  q: string,
  opts: {
    filter?: FoodFilter;
    includeRecipes?: boolean;
    includeMeals?: boolean;
    online?: boolean;
    limit?: number;
    mine?: MyFoods;
  } = {},
): Promise<FoodSearchResult> {
  const filter = opts.filter ?? "all";
  const limit = opts.limit ?? 30;
  const mineSrc = opts.mine ?? (await loadMyFoods());

  const wantMine = filter === "all" || filter === "mine";
  const wantDb = filter !== "mine";

  const mine: FoundFood[] = wantMine
    ? rankByQuery(
        [
          ...(opts.includeRecipes === false ? [] : mineSrc.recipes.map(recipeFound)),
          ...mineSrc.custom.map((c): FoundFood => ({ food: c.food, kind: "custom" })),
        ],
        q,
        (f) => f.food,
        filter === "mine" ? 50 : 8,
      )
    : [];
  const meals = wantMine && opts.includeMeals ? rankByQuery(mineSrc.meals, q, (m) => m, 5) : [];

  let db: FoodRef[] = [];
  if (wantDb) {
    db = await getFoodDbRepo()
      .searchFoods(q, {
        limit,
        source: filter === "packaged" ? "off" : filter === "generic" ? "usda" : undefined,
        online: opts.online,
      })
      .catch(() => []);
  }
  // Your own copy of a food (e.g. saved from a label) hides the database entry.
  const seen = new Set(mine.map((m) => sameFoodKey(m.food.name, m.food.brand)));
  const fresh = db.filter((f) => !seen.has(sameFoodKey(f.name, f.brand)));

  return {
    mine,
    meals,
    generic: fresh.filter((f) => f.source !== "off").map((food) => ({ food, kind: "generic" })),
    packaged: fresh.filter((f) => f.source === "off").map((food) => ({ food, kind: "packaged" })),
    canAskOnline: wantDb && filter !== "generic" && !opts.online,
  };
}

/** A barcode: your own foods first (a label you saved), then the database, then online. */
export async function findByBarcode(code: string): Promise<FoodRef | null> {
  const digits = code.replace(/\D/g, "");
  if (digits.length < 6) return null;
  const mine = (await getNutritionRepo().listCustomFoods()).find(
    (c) => !c.deletedAtMs && c.food.barcode === digits,
  );
  if (mine) return mine.food;
  return getFoodDbRepo().getFoodByBarcode(digits).catch(() => null);
}

export function looksLikeBarcode(q: string): boolean {
  return /^\d{8,14}$/.test(q.trim());
}

export type MatchedLine = {
  line: ParsedIngredientLine;
  food: FoodRef | null;
  /** Grams for this line, or null when it can't be worked out (check it). */
  grams: number | null;
  label: string;
  amount: number;
  portionId: string;
};

/** Best guess for one pasted ingredient line: your own foods first, then plain foods,
 * then packaged; the amount from the line, or the food's own serving for a count. */
export async function matchIngredientLine(line: ParsedIngredientLine, mine?: MyFoods): Promise<MatchedLine> {
  const r = await searchFoods(line.name, { includeRecipes: false, limit: 8, mine });
  const food = r.mine[0]?.food ?? r.generic[0]?.food ?? r.packaged[0]?.food ?? null;
  return sizeLine(line, food);
}

export function sizeLine(line: ParsedIngredientLine, food: FoodRef | null): MatchedLine {
  const fmt = (n: number) => Number(n.toFixed(2)).toString();
  if (line.unit) {
    return { line, food, grams: line.grams, label: `${fmt(line.amount)} ${line.unit}`, amount: line.amount, portionId: line.unit };
  }
  if (line.countUnit && line.grams != null) {
    return {
      line,
      food,
      grams: line.grams,
      label: `${fmt(line.amount)} ${line.countUnit}${line.amount === 1 ? "" : "s"} (${Math.round(line.grams)} g)`,
      amount: line.grams,
      portionId: "g",
    };
  }
  // A count of things ("3 eggs"): use the food's own serving.
  const serving = food?.servings.find(isRealServing);
  if (food && serving) {
    const grams = serving.grams * line.amount;
    return {
      line,
      food,
      grams,
      label: `${line.amount === 1 ? "" : `${fmt(line.amount)} × `}${serving.label}`,
      amount: line.amount,
      portionId: serving.id,
    };
  }
  return { line, food, grams: null, label: "amount?", amount: 100, portionId: "g" };
}

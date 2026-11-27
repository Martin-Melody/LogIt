import { describe, expect, it } from "vitest";
import { parseMealPlanPack, parseRecipePack } from "./nutritionPacks";
import { starterSource } from "./pluginTemplates";
import { cardPackCardId, cardPackCards, parseCardPackCardId } from "./cardPack";

describe("meal plan and recipe packs (canvas Q1)", () => {
  it("read the starters, with the pack's own ids", () => {
    const plans = parseMealPlanPack(JSON.parse(starterSource("meal-plan-pack", "com.a.plans", "P")), "com.a.plans").plans;
    expect(plans[0]!.id).toBe("com.a.plans#0");
    expect(plans[0]!.meals).toHaveLength(2);
    const recipes = parseRecipePack(JSON.parse(starterSource("recipe-pack", "com.a.r", "R")), "com.a.r").recipes;
    expect(recipes[0]!.perServing.proteinG).toBe(32);
  });
  it("say what's wrong in words a coach can read", () => {
    expect(() => parseMealPlanPack({ formatVersion: 1, plans: [{ name: "X" }] }, "p")).toThrow('"X" needs a daily calorie target.');
    expect(() => parseRecipePack({ formatVersion: 1, recipes: [{ name: "Y", servings: 2, ingredients: [] }] }, "p")).toThrow('"Y" needs 1 to 40 ingredients.');
    expect(() => parseRecipePack({ formatVersion: 2, recipes: [] }, "p")).toThrow("This pack needs a newer LogIt.");
  });
});

describe("card packs (canvas W13)", () => {
  it("list their cards and name them on a page", () => {
    expect(cardPackCards({ cards: [{ id: "roster", name: "Months with you" }, { id: 3 }] })).toEqual([{ id: "roster", name: "Months with you" }]);
    expect(parseCardPackCardId(cardPackCardId("com.a.cards", "roster"))).toEqual({ pluginId: "com.a.cards", cardId: "roster" });
    expect(parseCardPackCardId("paid")).toBeNull();
  });
});

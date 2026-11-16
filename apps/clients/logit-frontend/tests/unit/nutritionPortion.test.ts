import { describe, expect, it } from "vitest";
import { parseIngredientLine } from "@logit/core/domain/nutrition";
import {
  defaultPortion,
  portionLabel,
  portionOptions,
  portionToGrams,
  rowPortion,
  stepFor,
} from "../../src/lib/features/nutrition/portion";
import { sizeLine } from "../../src/lib/features/nutrition/foodFinder";

// The food database lists "100 g" as a serving (id "s0"); it mustn't win over a real portion.
const tomatoes = {
  id: "off:1",
  source: "off" as const,
  name: "Chopped Tomatoes",
  per100g: { kcal: 22, proteinG: 1.1, carbsG: 3.8, fatG: 0.2 },
  servings: [
    { id: "s0", label: "100 g", grams: 100 },
    { id: "s1", label: "1 portion (200 g)", grams: 200 },
  ],
};

describe("portion options", () => {
  it("offers real servings first and drops the plain 100 g", () => {
    const opts = portionOptions(tomatoes.servings);
    expect(opts[0]).toMatchObject({ id: "s1", grams: 200 });
    expect(opts.some((o) => o.id === "s0")).toBe(false);
    expect(opts.filter((o) => !o.more).map((o) => o.id)).toEqual(["s1", "g", "ml", "oz"]);
  });

  it("starts on the real serving, or a remembered portion", () => {
    expect(defaultPortion(tomatoes)).toEqual({ amount: 1, portionId: "s1" });
    expect(defaultPortion(tomatoes, { amount: 250, portionId: "g" })).toEqual({ amount: 250, portionId: "g" });
    expect(defaultPortion({ servings: [] })).toEqual({ amount: 100, portionId: "g" });
    expect(rowPortion(tomatoes)).toEqual({ label: "1 portion (200 g)", grams: 200 });
  });

  it("converts and labels kitchen units", () => {
    const tbsp = portionOptions([]).find((o) => o.id === "tbsp");
    expect(portionToGrams(2, tbsp)).toBe(30);
    expect(portionLabel(2, tbsp, 30)).toBe("2 tbsp");
    expect(stepFor(portionOptions([]).find((o) => o.id === "g"), 137)).toBe(10);
  });

  it("no raw units for a recipe that was never weighed", () => {
    const opts = portionOptions([{ id: "serving", label: "1 serving", grams: 100 }], { rawUnits: false });
    expect(opts.map((o) => o.id)).toEqual(["serving"]);
  });
});

describe("sizing a pasted ingredient line", () => {
  it("uses the food's own serving for a count", () => {
    const eggs = { ...tomatoes, name: "Egg", servings: [{ id: "lg", label: "large (50 g)", grams: 50 }] };
    expect(sizeLine(parseIngredientLine("3 eggs")!, eggs)).toMatchObject({ grams: 150, label: "3 × large (50 g)" });
  });

  it("asks when there's nothing to size a count by", () => {
    expect(sizeLine(parseIngredientLine("2 onions")!, { ...tomatoes, servings: [] }).grams).toBeNull();
  });

  it("keeps measures and tins", () => {
    expect(sizeLine(parseIngredientLine("1.5 kg beef mince")!, tomatoes)).toMatchObject({ grams: 1500, label: "1.5 kg" });
    expect(sizeLine(parseIngredientLine("3 tins chopped tomatoes")!, tomatoes)).toMatchObject({ grams: 1200, label: "3 tins (1200 g)" });
  });
});

import { describe, expect, it } from "vitest";
import { parseNutritionLabel } from "./labelParser";

describe("parseNutritionLabel — EU labels", () => {
  it("reads a UK/IE per-100g column with a serving column alongside", () => {
    const text = `
      NUTRITION INFORMATION
      Typical Values per 100g per 30g serving
      Energy 1046kJ / 250kcal 314kJ / 75kcal
      Fat 3.2g 1.0g
      of which saturates 0.6g 0.2g
      Carbohydrate 45.0g 13.5g
      of which sugars 4.1g 1.2g
      Fibre 6.5g 2.0g
      Protein 9.5g 2.9g
      Salt 0.5g 0.15g
    `;
    const r = parseNutritionLabel(text);
    expect(r.layout).toBe("eu");
    expect(r.per100g).toEqual({ kcal: 250, proteinG: 9.5, carbsG: 45, fatG: 3.2 });
    expect(r.warnings).toHaveLength(0);
    expect(r.confidence).toBe(1);
  });

  it("handles comma decimals and a per-100g-only label", () => {
    const text = `
      Valori nutrizionali medi per 100 g
      Energia 2000 kJ / 478 kcal
      Grassi 25,0 g
      di cui acidi grassi saturi 15,0 g
      Carboidrati 55,5 g
      di cui zuccheri 52,0 g
      Proteine 6,5 g
      Sale 0,10 g
    `;
    const r = parseNutritionLabel(text);
    expect(r.layout).toBe("eu");
    expect(r.per100g?.kcal).toBe(478);
    expect(r.per100g?.fatG).toBe(25);
    expect(r.per100g?.carbsG).toBe(55.5);
    expect(r.per100g?.proteinG).toBe(6.5);
  });

  it("converts kJ to kcal when no kcal is printed", () => {
    const text = `
      Nutrition per 100 ml
      Energy 180 kJ
      Fat 0.1 g
      Carbohydrate 9.9 g
      Protein 0.0 g
    `;
    const r = parseNutritionLabel(text);
    expect(r.per100g?.kcal).toBe(Math.round(180 / 4.184)); // 43
  });

  it("estimates energy from macros when the energy row is missing entirely", () => {
    const text = `
      Nutritional Information per 100g
      Fat 10 g
      Carbohydrate 20 g
      Protein 30 g
    `;
    const r = parseNutritionLabel(text);
    expect(r.per100g?.kcal).toBe(30 * 4 + 20 * 4 + 10 * 9); // 290
    expect(r.warnings.join(" ")).toMatch(/estimated/i);
    expect(r.confidence).toBeLessThan(1);
  });

  it("does not mistake 'of which sugars' for the carbohydrate row", () => {
    const text = `
      Per 100g
      Energy 400 kcal
      Fat 20g
      Carbohydrate 40g
      of which sugars 38g
      Protein 5g
    `;
    const r = parseNutritionLabel(text);
    expect(r.per100g?.carbsG).toBe(40);
  });

  it("survives real OCR noise: split rows, 'g' misread as '9', stray punctuation", () => {
    // Verbatim Tesseract output for a photographed UK label.
    const text = [
      "Nutrition Information",
      "Typical Values —_ per 100g",
      "Energy 1046kJ / 250kcal",
      "Fat 3.29",
      "",
      "of which saturates 0.6g",
      "Carbohydrate 45.0g",
      "",
      "of which sugars 4.1g",
      "Fibre 6.5g",
      "Protein 9.5g",
      "Salt 0.50g",
    ].join("\n");
    const r = parseNutritionLabel(text);
    expect(r.per100g).toEqual({ kcal: 250, proteinG: 9.5, carbsG: 45, fatG: 3.2 });
  });

  it("re-joins an energy row when only the kJ made the line and kcal wrapped", () => {
    // Rebuilt from a sideways-photographed Lidl label — the energy row's kcal
    // dropped to the next line, which used to make it convert 509 kJ → 122 kcal.
    const text = `Nutrition
      Typical values per 100g per slice 30g
      Energy 509kJ/ 153kJ/
      120kcal 36kcal
      Fat 1.4g 0.4g
      of which saturates 0.5g 0.2g
      Carbohydrate 1.8g 0.5g
      of which sugars 0.1g <0.1g
      Protein 25.1g 7.5g
      Salt 0.69g 0.21g`;
    const r = parseNutritionLabel(text);
    expect(r.per100g).toEqual({ kcal: 120, proteinG: 25.1, carbsG: 1.8, fatG: 1.4 });
  });

  it("re-joins a nutrient name split onto its own line by OCR", () => {
    const text = `
      Nutrition per 100 g
      Energy
      1500 kJ / 358 kcal
      Fat
      12 g
      Carbohydrate
      52 g
      Protein
      9 g
    `;
    const r = parseNutritionLabel(text);
    expect(r.per100g).toEqual({ kcal: 358, proteinG: 9, carbsG: 52, fatG: 12 });
  });

  it("picks the correct column when serving comes before per 100g", () => {
    const text = `
      Values per serving (25 g) per 100 g
      Energy 120 kcal 480 kcal
      Fat 2 g 8 g
      Carbohydrate 15 g 60 g
      Protein 1 g 4 g
    `;
    const r = parseNutritionLabel(text);
    expect(r.per100g).toEqual({ kcal: 480, proteinG: 4, carbsG: 60, fatG: 8 });
  });
});

describe("parseNutritionLabel — US labels", () => {
  it("rebases a per-serving Nutrition Facts panel to per 100 g", () => {
    const text = `
      Nutrition Facts
      Serving size 2/3 cup (55g)
      Servings per container 8
      Calories 230
      Total Fat 8g
      Saturated Fat 1g
      Trans Fat 0g
      Total Carbohydrate 37g
      Dietary Fiber 4g
      Total Sugars 12g
      Protein 3g
    `;
    const r = parseNutritionLabel(text);
    expect(r.layout).toBe("us");
    expect(r.servingSizeG).toBe(55);
    expect(r.perServing).toEqual({ kcal: 230, proteinG: 3, carbsG: 37, fatG: 8 });
    const f = 100 / 55;
    expect(r.per100g?.kcal).toBe(Math.round(230 * f)); // 418
    expect(r.per100g?.fatG).toBeCloseTo(Math.round(8 * f * 10) / 10, 5);
  });

  it("falls back to per-serving values (with a warning) when serving size is unreadable", () => {
    const text = `
      Nutrition Facts
      Amount per serving
      Calories 150
      Total Fat 5g
      Total Carbohydrate 20g
      Protein 4g
    `;
    const r = parseNutritionLabel(text);
    expect(r.per100g).toBeUndefined();
    expect(r.perServing).toEqual({ kcal: 150, proteinG: 4, carbsG: 20, fatG: 5 });
    expect(r.warnings[0]).toMatch(/serving size/i);
  });
});

describe("parseNutritionLabel — degenerate input", () => {
  it("returns an empty low-confidence result for noise", () => {
    const r = parseNutritionLabel("~~~ blurry photo ~~~");
    expect(r.confidence).toBeLessThan(0.3);
    expect(r.per100g).toBeUndefined();
  });

  it("reports no text at all", () => {
    const r = parseNutritionLabel("   \n  \n");
    expect(r.warnings[0]).toMatch(/no text/i);
  });
});

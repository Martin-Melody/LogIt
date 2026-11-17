import { describe, expect, it } from "vitest";
import {
  closestTerms,
  editDistance,
  ftsQueries,
  prepareQuery,
  rankByQuery,
  scoreName,
  singular,
  wordVariants,
} from "./foodSearch";

const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe("singular", () => {
  it("handles the usual plurals", () => {
    expect(singular("eggs")).toBe("egg");
    expect(singular("berries")).toBe("berry");
    expect(singular("tomatoes")).toBe("tomato");
    expect(singular("peaches")).toBe("peach");
    expect(singular("glass")).toBe("glass");
    expect(singular("hummus")).toBe("hummus");
    expect(singular("oats")).toBe("oat");
  });
});

describe("wordVariants", () => {
  it("adds singular, y→i and UK/US names", () => {
    expect(wordVariants("strawberries")).toEqual(expect.arrayContaining(["strawberries", "strawberry", "strawberri"]));
    expect(wordVariants("mince")).toEqual(expect.arrayContaining(["ground", "minced"]));
    expect(wordVariants("courgettes")).toContain("zucchini");
  });
});

describe("editDistance", () => {
  it("counts swaps as one", () => {
    expect(editDistance("chikcen", "chicken")).toBe(1);
    expect(editDistance("brest", "breast")).toBe(1);
    expect(editDistance("abc", "xyz", 1)).toBe(2);
  });
});

describe("scoreName / rankByQuery", () => {
  const foods = [
    { name: "Chicken breast, raw" },
    { name: "Chicken spread" },
    { name: "Beef, ground, 95% lean" },
    { name: "Egg, whole, raw" },
    { name: "Eggplant, raw" },
    { name: "Yogurt, Greek, plain, nonfat" },
    { name: "Banana bread with walnuts" },
    { name: "Banana" },
    { name: "Creamy Chicken Pasta" },
  ];

  it("ignores word order", () => {
    expect(names(rankByQuery(foods, "pasta chicken", (f) => f)).at(0)).toBe("Creamy Chicken Pasta");
  });

  it("matches plurals and UK names", () => {
    expect(names(rankByQuery(foods, "eggs", (f) => f))[0]).toBe("Egg, whole, raw");
    expect(names(rankByQuery(foods, "beef mince", (f) => f))[0]).toBe("Beef, ground, 95% lean");
    expect(names(rankByQuery(foods, "greek yoghurt", (f) => f))[0]).toBe("Yogurt, Greek, plain, nonfat");
    expect(names(rankByQuery(foods, "aubergine", (f) => f))[0]).toBe("Eggplant, raw");
  });

  it("forgives typos", () => {
    expect(names(rankByQuery(foods, "chiken brest", (f) => f))[0]).toBe("Chicken breast, raw");
  });

  it("matches half-typed words", () => {
    expect(names(rankByQuery(foods, "chick bre", (f) => f))[0]).toBe("Chicken breast, raw");
  });

  it("puts the plain food ahead of longer names", () => {
    expect(names(rankByQuery(foods, "banana", (f) => f))).toEqual(["Banana", "Banana bread with walnuts"]);
  });

  it("drops names that miss most words", () => {
    expect(rankByQuery(foods, "salmon fillet", (f) => f)).toEqual([]);
  });

  it("scores brand matches below name matches", () => {
    const q = prepareQuery("tesco");
    expect(scoreName(q, "Tesco chicken")).toBeGreaterThan(scoreName(q, "Chicken", "Tesco"));
    expect(scoreName(q, "Chicken", "Tesco")).toBeGreaterThan(0);
  });
});

describe("ftsQueries", () => {
  it("builds an AND and an OR query with every spelling", () => {
    const q = ftsQueries("beef mince")!;
    expect(q.all).toBe('"beef"* AND ("mince"* OR "minced"* OR "ground"*)');
    expect(q.any).toBe('"beef"* OR ("mince"* OR "minced"* OR "ground"*)');
  });

  it("adds typo corrections", () => {
    const q = ftsQueries("chiken", new Map([["chiken", ["chicken"]]]))!;
    expect(q.all).toBe('("chiken"* OR "chicken"*)');
  });

  it("returns null for punctuation only", () => {
    expect(ftsQueries("!!")).toBeNull();
  });
});

describe("closestTerms", () => {
  it("picks the nearest, most common term", () => {
    const vocab = [
      { term: "chicken", docs: 900 },
      { term: "chickens", docs: 5 },
      { term: "chicory", docs: 30 },
    ];
    expect(closestTerms("chiken", vocab)).toEqual(["chicken"]);
  });
});

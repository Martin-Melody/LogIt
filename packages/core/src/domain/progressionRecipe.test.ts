import { describe, expect, it } from "vitest";
import {
  createProgressionRecipe,
  parseRecipeShareCode,
  recipeFromShared,
  recipeShareCode,
  recipeShareMessage,
  toSharedRecipe,
  uniqueRecipeName,
} from "./progressionRecipe";

describe("sharing a built algorithm", () => {
  const mine = { ...createProgressionRecipe("Top and back-offs"), setLayout: "topBackoff" as const, repRange: [5, 8] as [number, number] };

  it("shares the blocks only", () => {
    const shared = toSharedRecipe(mine);
    expect(shared).not.toHaveProperty("id");
    expect(shared).not.toHaveProperty("createdAtMs");
    expect(shared).toMatchObject({ name: "Top and back-offs", setLayout: "topBackoff", repRange: [5, 8] });
  });

  it("round-trips through a code, and finds the code inside a pasted message", () => {
    const code = recipeShareCode(mine);
    expect(code).toMatch(/^logit-alg1:[A-Za-z0-9_-]+$/);
    expect(parseRecipeShareCode(code)).toEqual(toSharedRecipe(mine));
    expect(parseRecipeShareCode(`Try this!\n${recipeShareMessage(mine)}\nCheers`)?.name).toBe("Top and back-offs");
  });

  it("keeps names with any characters", () => {
    const fancy = { ...mine, name: "Martin’s 5/3/1 ✓" };
    expect(parseRecipeShareCode(recipeShareCode(fancy))?.name).toBe("Martin’s 5/3/1 ✓");
  });

  it("rejects text without a valid code", () => {
    expect(parseRecipeShareCode("hello")).toBeNull();
    expect(parseRecipeShareCode("logit-alg1:not-json")).toBeNull();
  });

  it("adds a shared one as a new copy with a name that doesn't clash", () => {
    const copy = recipeFromShared(toSharedRecipe(mine), uniqueRecipeName("Top and back-offs", ["top and back-offs"]));
    expect(copy.id).not.toBe(mine.id);
    expect(copy.name).toBe("Top and back-offs (2)");
    expect(copy.setLayout).toBe("topBackoff");
  });
});

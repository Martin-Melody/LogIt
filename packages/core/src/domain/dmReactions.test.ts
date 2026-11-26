import { describe, expect, it } from "vitest";
import { nextReaction, withMyReaction } from "./dmReactions";

describe("message reactions", () => {
  it("adds, moves and takes back your one reaction", () => {
    const theirs = [{ emoji: "💪", count: 1, mine: false }];
    const added = withMyReaction(theirs, "💪");
    expect(added).toEqual([{ emoji: "💪", count: 2, mine: true }]);
    const moved = withMyReaction(added, "🔥");
    expect(moved).toEqual([{ emoji: "💪", count: 1, mine: false }, { emoji: "🔥", count: 1, mine: true }]);
    expect(withMyReaction([{ emoji: "🔥", count: 1, mine: true }], null)).toBeNull();
  });

  it("tapping your own emoji again takes it back", () => {
    const list = [{ emoji: "❤️", count: 2, mine: true }];
    expect(nextReaction(list, "❤️")).toBeNull();
    expect(nextReaction(list, "😂")).toBe("😂");
    expect(nextReaction(null, "😂")).toBe("😂");
  });
});

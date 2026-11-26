import { describe, expect, it } from "vitest";
import { withForumCards } from "./socialFeed";

describe("withForumCards", () => {
  it("slots forum cards in by time and shows each once", () => {
    const posts = [{ id: "p1", createdAt: "2026-11-25T12:00:00Z" }, { id: "p2", createdAt: "2026-11-25T08:00:00Z" }];
    const card = { id: "f1", createdAtMs: Date.parse("2026-11-25T10:00:00Z") };
    expect(withForumCards(posts, [card, card]).map((i) => i.post.id)).toEqual(["p1", "f1", "p2"]);
  });
});

import { describe, expect, it } from "vitest";
import { fillReply, matchReplies, slashQuery } from "./savedReplies";

describe("saved replies (canvas W10)", () => {
  const replies = [
    { id: "1", shortcut: "swap", title: "Swap is fine", body: "Yep, {exercise} for now." },
    { id: "2", shortcut: "sick", title: "Missed sessions, ill", body: "No stress {first name}, rest up." },
    { id: "3", shortcut: "protein", title: "Protein tips", body: "…" },
  ];
  it("finds them from what's typed after /", () => {
    expect(slashQuery("/sw")).toBe("sw");
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/swap now")).toBeNull();
    expect(slashQuery("hi /sw")).toBeNull();
    // Shortcuts that start with it first, then any that mention it.
    expect(matchReplies(replies, "s").map((r) => r.shortcut)).toEqual(["swap", "sick", "protein"]);
    expect(matchReplies(replies, "si").map((r) => r.shortcut)).toEqual(["sick"]);
    expect(matchReplies(replies, "tips").map((r) => r.shortcut)).toEqual(["protein"]);
  });
  it("fills in what it knows and leaves the rest to edit", () => {
    expect(fillReply("No stress {first name}, {exercise}.", { firstName: "Ciarán" })).toBe("No stress Ciarán, {exercise}.");
  });
});

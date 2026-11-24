import { describe, expect, it, vi } from "vitest";
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
import { pushTarget } from "./push";

describe("tapping a push", () => {
  it("opens the same place as the Inbox would", () => {
    expect(pushTarget({ type: "Message", relationshipId: "r1" })).toBe("/messages/r1");
    expect(pushTarget({ type: "CoachProgram" })).toBe("/splits");
    expect(pushTarget({ type: "Like", count: "1", postId: "p1" })).toBe("/social/post/p1");
    // A gathered push opens the Inbox, not one of its posts.
    expect(pushTarget({ type: "Like", count: "4" })).toBe("/inbox");
    expect(pushTarget(undefined)).toBe("/inbox");
  });
});

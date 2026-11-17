import { describe, expect, it } from "vitest";
import { codeFromInvite } from "$lib/features/onboarding/coachCode";

describe("a coach's code from what was typed or scanned", () => {
  it("takes the code itself or the code in an invite link", () => {
    expect(codeFromInvite(" dara-b7kq ")).toBe("DARA-B7KQ");
    expect(codeFromInvite("https://app.getlogit.app/c/K7QM3XPA")).toBe("K7QM3XPA");
    expect(codeFromInvite("hello there")).toBeNull();
  });
});

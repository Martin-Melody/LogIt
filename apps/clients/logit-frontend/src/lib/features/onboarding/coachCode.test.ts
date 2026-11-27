import { describe, expect, it } from "vitest";
import { codeFromInvite } from "./coachCode";

describe("codeFromInvite", () => {
  it("reads a typed code, an old /c/ link and a profile link", () => {
    expect(codeFromInvite("dara-b7kq")).toBe("DARA-B7KQ");
    expect(codeFromInvite("https://app.getlogit.app/c/DARA-B7KQ")).toBe("DARA-B7KQ");
    expect(codeFromInvite("https://getlogit.app/@coach_sam?l=DARAB7KQ")).toBe("DARAB7KQ");
    expect(codeFromInvite("https://getlogit.app/@coach_sam")).toBeNull();
  });
});

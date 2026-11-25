import { describe, expect, it } from "vitest";
import { groupLink, parseGroupInvite } from "./groupInvite";

describe("group links", () => {
  it("round-trips the code and the server, leaving getlogit.app out", () => {
    expect(groupLink("abc234defgh5", "https://api.getlogit.app")).toBe("https://getlogit.app/g#logit-gr1:abc234defgh5");
    expect(parseGroupInvite(groupLink("abc234defgh5", "https://api.getlogit.app"))).toEqual({ code: "abc234defgh5", server: "https://api.getlogit.app" });
    expect(parseGroupInvite(groupLink("abc234defgh5", "https://logit.example.org/"))).toEqual({ code: "abc234defgh5", server: "https://logit.example.org" });
    expect(parseGroupInvite("logit-fr1:abc234defgh5")).toBeNull();
  });
});

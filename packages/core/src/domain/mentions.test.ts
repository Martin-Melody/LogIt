import { describe, expect, it } from "vitest";
import { parseMentions } from "./mentions";
import { normalizeTag } from "../api/forumApi";

describe("parseMentions", () => {
  it("finds @names and #tags (lower case), not e-mails, links or entities", () => {
    expect(parseMentions("Leg day with @ava in #Sligo, see a@b.com or x.com/#top &#39;")).toEqual([
      { type: "text", value: "Leg day with " },
      { type: "mention", username: "ava" },
      { type: "text", value: " in " },
      { type: "tag", tag: "sligo" },
      { type: "text", value: ", see a@b.com or x.com/#top &#39;" },
    ]);
    expect(parseMentions("#éire")).toEqual([{ type: "tag", tag: "éire" }]);
  });

  it("normalizes a typed tag like the server", () => {
    expect([normalizeTag("#Sligo "), normalizeTag("two words"), normalizeTag("#")]).toEqual(["sligo", null, null]);
  });
});

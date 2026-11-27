import { describe, expect, it } from "vitest";
import { richTextBlocks, richTextPlain } from "./richText";

describe("richTextBlocks", () => {
  it("reads plain text as it always read, line breaks kept", () => {
    expect(richTextBlocks("Hit 100 kg today\nfeeling good")).toEqual([
      { type: "p", inline: [{ type: "text", text: "Hit 100 kg today" }, { type: "br" }, { type: "text", text: "feeling good" }] },
    ]);
    expect(richTextBlocks("   ")).toEqual([]);
  });

  it("keeps the formatting the editor writes", () => {
    const b = richTextBlocks("## Week 3\n\n**Squat** went *well*\n\n- one\n- two\n\n1. first\n\n> quote");
    expect(b[0]).toEqual({ type: "h", level: 2, inline: [{ type: "text", text: "Week 3" }] });
    expect(b[1]).toEqual({ type: "p", inline: [
      { type: "strong", children: [{ type: "text", text: "Squat" }] },
      { type: "text", text: " went " },
      { type: "em", children: [{ type: "text", text: "well" }] },
    ] });
    expect(b[2]).toMatchObject({ type: "list", ordered: false, items: [[{ type: "p" }], [{ type: "p" }]] });
    expect(b[3]).toMatchObject({ type: "list", ordered: true, start: 1 });
    expect(b[4]).toMatchObject({ type: "quote", blocks: [{ type: "p" }] });
  });

  it("never lets markup or unsafe links through", () => {
    const html = richTextBlocks('<script>alert(1)</script>\n\nhi <img src=x onerror=alert(1)>');
    expect(JSON.stringify(html)).not.toContain('"type":"html"');
    expect(html[0]).toEqual({ type: "p", inline: [{ type: "text", text: "<script>alert(1)</script>" }] });
    expect(html[1]).toEqual({ type: "p", inline: [{ type: "text", text: "hi <img src=x onerror=alert(1)>" }] });

    expect(richTextBlocks("[click](javascript:alert(1))")).toEqual([{ type: "p", inline: [{ type: "text", text: "click" }] }]);
    expect(richTextBlocks("[site](https://getlogit.app)")).toEqual([
      { type: "p", inline: [{ type: "link", href: "https://getlogit.app", children: [{ type: "text", text: "site" }] }] },
    ]);
    expect(richTextBlocks("![x](https://e.com/a.png)")).toEqual([{ type: "p", inline: [{ type: "text", text: "x" }] }]);
  });

  it("keeps @mentions and #tags whole for the app to link", () => {
    expect(richTextBlocks("thanks @sam_rowe & #squat")).toEqual([
      { type: "p", inline: [{ type: "text", text: "thanks @sam_rowe & #squat" }] },
    ]);
  });
});

describe("richTextPlain", () => {
  it("drops the formatting", () => {
    expect(richTextPlain("## Week 3\n\n**Squat** went *well*\n- one")).toBe("Week 3 Squat went well one");
  });
});

import { describe, expect, it } from "vitest";

describe("routeMatches with a tab", () => {
  it("needs the page and the tab its query picks", async () => {
    const { routeMatches } = await import("./progress");
    expect(routeMatches("/clients?tab=requests", "/clients", "?tab=requests&r=1")).toBe(true);
    expect(routeMatches("/clients?tab=requests", "/clients", "")).toBe(false);
    expect(routeMatches("/clients/[id]", "/clients/abc")).toBe(true);
  });
});

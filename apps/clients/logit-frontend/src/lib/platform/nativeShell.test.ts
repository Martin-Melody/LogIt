import { describe, expect, it } from "vitest";
import { routeForAppLink } from "./nativeShell";

describe("links that open the app", () => {
  const code = "logit-alg1:eyJuYW1lIjoiWCJ9";
  it("sends a shared algorithm to Add from a code", () => {
    const route = `/settings/progression?algorithmCode=${encodeURIComponent(code)}`;
    expect(routeForAppLink(`logit://a?c=${code}`)).toBe(route);
    expect(routeForAppLink(`https://getlogit.app/a#${code}`)).toBe(route);
  });
  it("ignores anything else", () => {
    expect(routeForAppLink("logit://somewhere")).toBeNull();
  });
});

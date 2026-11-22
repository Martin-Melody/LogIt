import { describe, expect, it } from "vitest";
import { launchRedirect } from "./launchRedirect";

const base = { ready: true, onboardingCompleted: false, needsAccountAuth: false };

describe("launchRedirect", () => {
  it("sends unfinished onboarding back to it", () => {
    expect(launchRedirect({ ...base, path: "/" })).toBe("/onboarding");
  });
  it("lets a coach mid-onboarding see the Studio plan", () => {
    expect(launchRedirect({ ...base, path: "/plans" })).toBeNull();
  });
  it("still asks for sign-in first", () => {
    expect(launchRedirect({ ...base, needsAccountAuth: true, path: "/plans" })).toBe("/auth");
  });
});

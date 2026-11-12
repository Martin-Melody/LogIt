// Swiping between the bottom-nav pages: bar order with Start in the middle, skipping items
// that need an account while signed out, and only horizontal-enough gestures count.
import { describe, expect, it } from "vitest";
import { NAV_ITEM_DEFS } from "$lib/stores/navConfig.store";
import {
  neighbourTab,
  swipeOutcome,
  tabDirection,
  tabHrefs,
  START_HREF,
} from "$lib/features/navigation/tabSwipe";

describe("tabHrefs", () => {
  it("puts Start between the second and third bar items", () => {
    expect(tabHrefs({ bar: ["home", "social", "profile"] }, NAV_ITEM_DEFS, true)).toEqual([
      "/",
      "/social",
      START_HREF,
      "/profile",
    ]);
  });

  it("skips items that need an account while signed out", () => {
    expect(tabHrefs({ bar: ["home", "social", "profile"] }, NAV_ITEM_DEFS, false)).toEqual([
      "/",
      START_HREF,
      "/profile",
    ]);
  });

  it("copes with a bar of fewer than three items", () => {
    expect(tabHrefs({ bar: ["home"] }, NAV_ITEM_DEFS, true)).toEqual(["/", START_HREF]);
  });
});

describe("neighbourTab", () => {
  const tabs = ["/", "/social", START_HREF, "/profile"];

  it("moves along the bar and stops at the ends", () => {
    expect(neighbourTab(tabs, "/social", 1)).toBe(START_HREF);
    expect(neighbourTab(tabs, "/social", -1)).toBe("/");
    expect(neighbourTab(tabs, "/", -1)).toBeNull();
    expect(neighbourTab(tabs, "/profile", 1)).toBeNull();
  });

  it("does nothing off the tab pages (detail pages keep their own gestures)", () => {
    expect(neighbourTab(tabs, "/profile/customize", -1)).toBeNull();
    expect(neighbourTab(tabs, "/social/notifications", 1)).toBeNull();
  });
});

describe("tabDirection", () => {
  const tabs = ["/", "/social", START_HREF, "/profile"];

  it("is forward to the right, back to the left, null otherwise", () => {
    expect(tabDirection(tabs, "/", "/profile")).toBe("forward");
    expect(tabDirection(tabs, START_HREF, "/social")).toBe("back");
    expect(tabDirection(tabs, "/", "/exercises")).toBeNull();
    expect(tabDirection(tabs, "/", "/")).toBeNull();
  });
});

describe("swipeOutcome", () => {
  it("needs a long, mostly horizontal swipe", () => {
    expect(swipeOutcome(-120, 10)).toBe(-1);
    expect(swipeOutcome(120, -20)).toBe(1);
    expect(swipeOutcome(-50, 0)).toBe(0); // too short
    expect(swipeOutcome(-120, 80)).toBe(0); // too diagonal (a scroll)
  });
});

// Swiping between the bottom-nav pages: bar order with Start in the middle, skipping items
// that need an account while signed out, and only horizontal-enough gestures count.
import { describe, expect, it } from "vitest";
import { NAV_ITEM_DEFS, type NavItemId } from "$lib/stores/navConfig.store";
import {
  barSlots,
  neighbourTab,
  swipeOutcome,
  tabDirection,
  tabHrefs,
  START_HREF,
} from "$lib/features/navigation/tabSwipe";

const MORE: NavItemId[] = ["messages", "sessions", "splits", "progress", "exercises"];
const cfg = (bar: NavItemId[], more: NavItemId[] = MORE) => ({ bar, more });

describe("barSlots", () => {
  const ids = (slots: ReturnType<typeof barSlots>) => slots.map((d) => d?.id ?? null);

  it("shows the bar as saved when signed in", () => {
    expect(ids(barSlots(cfg(["home", "social", "profile"]), NAV_ITEM_DEFS, true))).toEqual([
      "home",
      "social",
      "profile",
    ]);
  });

  it("signed out, fills an account-only slot with the first usable item from More", () => {
    // Messages needs an account too, so Sessions stands in.
    expect(ids(barSlots(cfg(["home", "social", "profile"]), NAV_ITEM_DEFS, false))).toEqual([
      "home",
      "sessions",
      "profile",
    ]);
  });

  it("gives each account-only slot its own stand-in, never one already on the bar", () => {
    expect(
      ids(barSlots(cfg(["social", "sessions", "messages"]), NAV_ITEM_DEFS, false)),
    ).toEqual(["splits", "sessions", "progress"]);
  });

  it("leaves the slot empty until sign-in is known, so nothing flips", () => {
    expect(ids(barSlots(cfg(["home", "social", "profile"]), NAV_ITEM_DEFS, null))).toEqual([
      "home",
      null,
      "profile",
    ]);
  });

  it("keeps a slot the bar was customised to leave empty", () => {
    expect(ids(barSlots(cfg(["home"]), NAV_ITEM_DEFS, false))).toEqual(["home", null, null]);
  });
});

describe("tabHrefs", () => {
  it("puts Start between the second and third bar items", () => {
    expect(tabHrefs(cfg(["home", "social", "profile"]), NAV_ITEM_DEFS, true)).toEqual([
      "/",
      "/social",
      START_HREF,
      "/profile",
    ]);
  });

  it("signed out, follows the stand-in instead of the account-only item", () => {
    expect(tabHrefs(cfg(["home", "social", "profile"]), NAV_ITEM_DEFS, false)).toEqual([
      "/",
      "/sessions",
      START_HREF,
      "/profile",
    ]);
  });

  it("copes with a bar of fewer than three items", () => {
    expect(tabHrefs(cfg(["home"]), NAV_ITEM_DEFS, true)).toEqual(["/", START_HREF]);
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

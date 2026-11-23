import { describe, expect, it } from "vitest";
import { legacySettingsHref, searchSettings } from "./settingsIndex";

describe("searchSettings", () => {
  it("finds a setting by a word in its title, detail or keywords", () => {
    const titles = searchSettings("plate").map((e) => e.title);
    expect(titles[0]).toBe("Plates");
    expect(titles).toContain("Bar weight");
    expect(titles).toContain("Your places");
  });

  it("matches word starts only, every word, ignoring case", () => {
    expect(searchSettings("ate")).toEqual([]);
    expect(searchSettings("REST timer").map((e) => e.title)).toContain("Rest timer");
    expect(searchSettings("rest strong")).toEqual([]);
    expect(searchSettings("   ")).toEqual([]);
  });

  it("puts title matches before keyword matches", () => {
    const titles = searchSettings("dark").map((e) => e.title);
    expect(titles).toEqual(["Theme"]);
    expect(searchSettings("import").map((e) => e.title)[0]).toBe("Import workouts");
  });
});

describe("legacySettingsHref", () => {
  it("sends old one-page anchors to the new pages, keeping the query", () => {
    expect(legacySettingsHref("#sec-progression", "?algorithmCode=abc")).toBe("/settings/progression?algorithmCode=abc");
    expect(legacySettingsHref("#sec-session")).toBe("/settings/workout");
    expect(legacySettingsHref("#nothing")).toBeNull();
    expect(legacySettingsHref("")).toBeNull();
  });
});

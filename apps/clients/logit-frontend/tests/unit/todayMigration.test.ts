import { describe, expect, it } from "vitest";
import { withTodayCard } from "$lib/features/widgets/todayMigration";

describe("Home's Today card replaces the three cards it merges (decision D1)", () => {
  it("puts Today at the top of a saved Home and switches the three off, once", () => {
    const saved = [
      { id: "this-week", enabled: true, orderIndex: -1 },
      { id: "quick-start", enabled: true, orderIndex: 0 },
      { id: "todays-plan", enabled: true, orderIndex: 1 },
      { id: "last-session", enabled: true, orderIndex: 2 },
    ];
    const once = withTodayCard(saved);
    expect(once[0]).toEqual({ id: "today", enabled: true, orderIndex: -2 });
    expect(once.filter((s) => !s.enabled).map((s) => s.id)).toEqual(["this-week", "quick-start", "todays-plan"]);
    expect(once.find((s) => s.id === "last-session")?.enabled).toBe(true);
    // Switched back on in Customize afterwards: left alone.
    const turnedBackOn = once.map((s) => (s.id === "quick-start" ? { ...s, enabled: true } : s));
    expect(withTodayCard(turnedBackOn)).toBe(turnedBackOn);
  });
});

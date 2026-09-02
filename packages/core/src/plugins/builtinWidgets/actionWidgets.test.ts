import { describe, expect, it } from "vitest";
import type { WidgetInput } from "../widgetView";
import { quickStartWidget } from "./quickStart";
import { todaysPlanWidget } from "./todaysPlan";

const base: WidgetInput = { now: 0, prefs: { weightUnit: "kg" } };

describe("quickStartWidget", () => {
  it("offers resume + start-new while a workout is active", () => {
    const view = quickStartWidget.compute({ ...base, session: { active: true, hasPlan: false } });
    const row = view.body[0];
    expect(row.kind).toBe("button-row");
    if (row.kind === "button-row") {
      expect(row.buttons.map((b) => b.action)).toEqual([{ resumeWorkout: true }, { startEmptyWorkout: true }]);
    }
  });

  it("offers the planned day + unplanned when there's a plan and no active session", () => {
    const view = quickStartWidget.compute({
      ...base,
      session: { active: false, hasPlan: true, plannedDayLabel: "Day 2 — Pull" },
    });
    const row = view.body[0];
    if (row.kind === "button-row") {
      expect(row.buttons[0]).toEqual({ label: "Start Day 2 — Pull", action: { startPlannedWorkout: true }, primary: true });
      expect(row.buttons[1].action).toEqual({ startEmptyWorkout: true });
    }
  });

  it("just offers 'start workout' with no plan", () => {
    const view = quickStartWidget.compute({ ...base, session: { active: false, hasPlan: false } });
    const row = view.body[0];
    if (row.kind === "button-row") expect(row.buttons).toHaveLength(1);
  });
});

describe("todaysPlanWidget", () => {
  it("lists the planned exercises with a scheduled subtitle", () => {
    const view = todaysPlanWidget.compute({
      ...base,
      todaysPlan: { dayLabel: "Day 1 — Push", scheduled: true, exercises: ["Bench", "OHP", "Dips"] },
    });
    expect(view.subtitle).toBe("Day 1 — Push · Scheduled");
    const list = view.body[0];
    if (list.kind === "list") expect(list.items.map((i) => i.label)).toEqual(["1. Bench", "2. OHP", "3. Dips"]);
  });

  it("is empty without a split", () => {
    const view = todaysPlanWidget.compute({ ...base });
    expect(view.empty?.text).toMatch(/Set up a split/);
  });

  it("shows a day pager + prev/next/edit actions for a multi-day split", () => {
    const view = todaysPlanWidget.compute({
      ...base,
      todaysPlan: {
        splitId: "s1",
        dayLabel: "Day 2",
        scheduled: false,
        dayIndex: 1,
        dayCount: 3,
        exercises: ["Row"],
      },
    });
    expect(view.pager).toEqual({ count: 3, index: 1 });
    expect(view.headerActions?.map((h) => h.icon)).toEqual(["prev", "next", "edit"]);
    expect(view.headerActions?.[0].action).toEqual({ cycleDay: -1 });
  });

  it("has no pager for a single-day split", () => {
    const view = todaysPlanWidget.compute({
      ...base,
      todaysPlan: { splitId: "s1", scheduled: true, dayIndex: 0, dayCount: 1, exercises: ["Row"] },
    });
    expect(view.pager).toBeUndefined();
    expect(view.headerActions?.map((h) => h.icon)).toEqual(["edit"]);
  });

  it("truncates long days", () => {
    const view = todaysPlanWidget.compute({
      ...base,
      todaysPlan: { scheduled: false, exercises: Array.from({ length: 11 }, (_, i) => `Ex${i}`) },
    });
    const last = view.body[view.body.length - 1];
    expect(last.kind).toBe("text");
    if (last.kind === "text") expect(last.text).toBe("+3 more");
  });
});

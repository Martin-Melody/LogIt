import { describe, expect, it } from "vitest";
import { habitsWidget } from "./habits";
import type { WidgetInput } from "../widgetView";

const base: WidgetInput = { now: 0, prefs: { weightUnit: "kg" } };

describe("habitsWidget", () => {
  it("builds a checklist with toggle actions and a progress subtitle", () => {
    const view = habitsWidget.compute({
      ...base,
      habits: [
        { id: "h1", name: "Meditate", dueToday: true, doneToday: true, streak: 4 },
        { id: "h2", name: "Water", dueToday: true, doneToday: false, streak: 0 },
        { id: "h3", name: "Runs", dueToday: true, doneToday: false, streak: 1, weekProgress: { done: 2, target: 3 } },
      ],
    });
    expect(view.subtitle).toBe("1 / 3 done today");
    const cl = view.body[0];
    expect(cl.kind).toBe("checklist");
    if (cl.kind === "checklist") {
      expect(cl.items[0]).toMatchObject({ label: "Meditate", checked: true, sublabel: "4 days streak", action: { toggleHabit: "h1" } });
      expect(cl.items[2].sublabel).toBe("2 / 3 this week");
    }
  });

  it("dims habits not due today", () => {
    const view = habitsWidget.compute({
      ...base,
      habits: [{ id: "h1", name: "Gym", dueToday: false, doneToday: false, streak: 0 }],
    });
    const cl = view.body[0];
    if (cl.kind === "checklist") expect(cl.items[0].muted).toBe(true);
    expect(view.subtitle).toBe("Nothing due today");
  });

  it("is empty with no habits", () => {
    expect(habitsWidget.compute({ ...base, habits: [] }).empty).toBeTruthy();
  });
});

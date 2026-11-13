import { describe, expect, it } from "vitest";
import { todaysPlanWidget } from "./todaysPlan";
import type { WidgetInput } from "../widgetView";

const now = Date.UTC(2026, 10, 13, 10); // Fri 13 Nov
type Plan = NonNullable<WidgetInput["todaysPlan"]>;
const input = (over: Partial<Plan>): WidgetInput => ({
  now,
  timeZone: "UTC",
  prefs: { weightUnit: "kg" },
  todaysPlan: { splitId: "s", dayLabel: "Day 2 — Lower", scheduled: true, dayCount: 4, dayIndex: 1, exercises: ["Squat"], ...over },
});
const view = async (over: Partial<Plan>) => await todaysPlanWidget.compute(input(over));
const texts = (v: Awaited<ReturnType<typeof view>>) => v.body.flatMap((n) => (n.kind === "text" ? [n.text] : []));

describe("the page the card opens on", () => {
  it("is Today's plan before training", async () => {
    const v = await view({ dateIso: "2026-11-13" });
    expect(v.title).toBe("Today's plan");
    expect(v.subtitle).toBe("Day 2 — Lower · Scheduled");
  });

  it("says Later today with what's done", async () => {
    const v = await view({ dateIso: "2026-11-13", doneToday: ["Lower"] });
    expect(v.title).toBe("Later today");
    expect(v.body[0]).toEqual({ kind: "text", text: "Lower done today", tone: "success" });
  });

  it("says Tomorrow after today's workout", async () => {
    expect((await view({ dateIso: "2026-11-14", doneToday: ["Upper"] })).title).toBe("Tomorrow");
  });

  it("is headed by the workout's own date, rest days in a note", async () => {
    const v = await view({ dateIso: "2026-11-16", doneToday: ["Push", "Mobility"], restBefore: ["2026-11-14", "2026-11-15"] });
    expect(v.title).toBe(new Date("2026-11-16T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }));
    expect(v.title).not.toMatch(/Rest/);
    expect(texts(v)[0]).toBe("Push and Mobility done today");
    expect(texts(v)[1]).toMatch(/^Rest until then \(.+, .+\)$/);
    expect(v.titleIcon).toBeUndefined();
  });

  it("on a rest day opens on the next workout with a note", async () => {
    const v = await view({ dateIso: "2026-11-14", restToday: true });
    expect(v.title).toBe("Tomorrow");
    expect(texts(v)).toContain("Rest day today");
  });
});

describe("opening on today", () => {
  it("today done: Done, and what's next", async () => {
    const v = await view({ dateIso: "2026-11-13", done: true, doneToday: ["Push"], nextUp: { dateIso: "2026-11-14", label: "Lower" } });
    expect(v.title).toBe("Today");
    expect(texts(v).slice(0, 2)).toEqual(["Done", "Next: Tomorrow · Lower"]);
  });

  it("a rest day today: Rest day, and what's next", async () => {
    const v = await view({ dateIso: "2026-11-13", rest: true, restToday: true, exercises: [], dayLabel: undefined, nextUp: { dateIso: "2026-11-16", label: "Push" } });
    expect(v.title).toBe("Today");
    expect(v.subtitle).toBe("Rest day");
    expect(v.titleIcon).toBe("rest");
    expect(texts(v)[0]).toMatch(/^Next: .*16.* · Push$/);
  });
});

describe("paged pages", () => {
  it("heads a later page with its date and no done-today note", async () => {
    const v = await view({ picked: true, dateIso: "2026-11-15", doneToday: ["Push"] });
    expect(v.title).toMatch(/15/);
    expect(texts(v).some((t) => /done today/.test(t))).toBe(false);
  });

  it("marks today's done workout", async () => {
    const v = await view({ picked: true, dateIso: "2026-11-13", done: true });
    expect(v.title).toBe("Today");
    expect(v.body[0]).toEqual({ kind: "text", text: "Done", tone: "success" });
  });

  it("shows a rest day with the moon", async () => {
    const v = await view({ picked: true, dateIso: "2026-11-16", rest: true, exercises: [], dayLabel: undefined });
    expect(v.subtitle).toBe("Rest day");
    expect(v.titleIcon).toBe("rest");
    expect(v.empty).toBeUndefined();
  });
});

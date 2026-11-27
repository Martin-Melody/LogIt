import { describe, expect, it } from "vitest";
import { addDay, createCoachProgram, setProgramStart, type CoachProgram } from "./CoachProgram";
import { isTrainingDay, sessionTimeOn } from "./trainingDay";

describe("training days for meal plans (canvas MP2)", () => {
  const program = (): CoachProgram => {
    let p = createCoachProgram("Upper/lower");
    p = addDay(p, p.weeks[0]!.id, "Upper");
    p = { ...p, weeks: p.weeks.map((w) => ({ ...w, days: w.days.map((d) => ({ ...d, weekday: 2, sessionTime: "18:00" })) })) };
    return setProgramStart(p, { mode: "fixed-date", startDateMs: Date.parse("2026-06-15T12:00:00") });
  };
  it("a workout that day, or the program's weekday while it runs", () => {
    expect(isTrainingDay("2026-06-16", [program()], [])).toBe(true); // Tuesday
    expect(isTrainingDay("2026-06-17", [program()], [])).toBe(false);
    expect(isTrainingDay("2026-06-17", [], [{ startedAtMs: Date.parse("2026-06-17T07:00:00") }])).toBe(true);
    expect(isTrainingDay("2026-06-09", [program()], [])).toBe(false); // before it started
    expect(sessionTimeOn("2026-06-16", [program()])).toBe("18:00");
    expect(sessionTimeOn("2026-06-17", [program()])).toBeNull();
  });
});

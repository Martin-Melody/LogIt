import { describe, expect, it } from "vitest";
import { createCoachProgram, type CoachProgram } from "./CoachProgram";
import { setLength, setWeekType } from "./programBuilder";
import { WEEK_TYPES } from "./weekTypes";
import { fitStretches, putStretch, removeStretch, stretchesCovered, stretchesOf, stretchTitle } from "./stretches";

let n = 0;
const id = () => `x${++n}`;
const view = (p: CoachProgram) => stretchesOf(p).map((s) => `${s.from}-${s.to} ${stretchTitle(s)}${s.plain ? "" : "*"}`);
const base = (weeks = 6) => setLength(createCoachProgram("P"), weeks);

describe("stretches", () => {
  it("reads phases and week types as one row (the Full-Body program)", () => {
    let p = base();
    p = putStretch(p, { from: 1, to: 1, what: { kind: "find" } }, id);
    p = putStretch(p, { from: 2, to: 6, what: { kind: "progression", rule: { kind: "adaptive" } } }, id);
    p = setWeekType(p, 4, WEEK_TYPES.deload);
    p = setWeekType(p, 6, WEEK_TYPES.test);
    expect(view(p)).toEqual(["1-1 Find your weights*", "2-3 Weeks 2–3*", "4-4 Deload*", "5-5 Week 5*", "6-6 Test*"]);
    // The deload sits inside Adaptive: week 4 still runs Adaptive.
    expect(p.phases?.find((x) => x.weeks.from === 2)?.weeks).toEqual({ from: 2, to: 6 });
  });

  it("sets weeks 1–3 at once, and the next stretch takes from it", () => {
    let p = base(8);
    p = putStretch(p, { from: 1, to: 3, what: { kind: "find" } }, id);
    expect(p.weeks.filter((w) => w.type?.kind === "find").map((w) => w.weekNumber)).toEqual([1, 2, 3]);
    p = putStretch(p, { from: 3, to: 7, name: "Hypertrophy", what: { kind: "progression", rule: { kind: "adaptive" } } }, id);
    p = putStretch(p, { from: 8, to: 8, what: { kind: "week", type: WEEK_TYPES.deload } }, id);
    expect(view(p)).toEqual(["1-2 Find your weights*", "3-7 Hypertrophy*", "8-8 Deload*"]);
    expect(p.weeks.find((w) => w.weekNumber === 3)?.type).toBeUndefined();
    expect(stretchesCovered(p, { from: 4, to: 8 }, stretchesOf(p)[1]).map((s) => stretchTitle(s))).toEqual(["Deload"]);
  });

  it("changing a stretch's range gives back the weeks it left; removing hands them to the program", () => {
    let p = base(8);
    p = putStretch(p, { from: 1, to: 3, what: { kind: "find" } }, id);
    const find = stretchesOf(p)[0]!;
    p = putStretch(p, { from: 1, to: 2, what: { kind: "find" } }, id, find);
    expect(view(p)).toEqual(["1-2 Find your weights*", "3-8 Weeks 3–8"]);
    expect(p.phases?.[0]?.id).toBe(find.phaseId);
    p = removeStretch(p, stretchesOf(p)[0]!, id);
    expect(view(p)).toEqual(["1-8 Weeks 1–8"]);
    expect(p.weeks.some((w) => w.type)).toBe(false);
  });

  it("dragging Adaptive over the deload and back leaves one Adaptive", () => {
    let p = putStretch(base(6), { from: 2, to: 6, what: { kind: "progression", rule: { kind: "adaptive" } } }, id);
    p = putStretch(p, { from: 4, to: 4, what: { kind: "week", type: WEEK_TYPES.deload } }, id);
    const left = stretchesOf(p)[1]!;
    p = putStretch(p, { ...left, to: 4 }, id, left);
    expect(view(p)).toEqual(["1-1 Week 1", "2-6 Weeks 2–6*"]);
    expect(p.phases).toHaveLength(1);
  });

  it("a phase that ran to the end grows with the program", () => {
    let p = putStretch(base(6), { from: 2, to: 6, name: "Strength", what: { kind: "progression", rule: { kind: "linear" } } }, id);
    p = fitStretches(setLength(p, 8), 6);
    expect(view(p)).toEqual(["1-1 Weeks 1–1", "2-8 Strength*"].map((s) => s.replace("Weeks 1–1", "Week 1")));
    p = fitStretches(setLength(p, 4), 8);
    expect(view(p)).toEqual(["1-1 Week 1", "2-4 Strength*"]);
  });
});

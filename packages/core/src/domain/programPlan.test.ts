import { describe, expect, it } from "vitest";
import { addDay, addSet, addStrengthBlock, createCoachProgram, type CoachProgram, type ProgramRule, type ProgramStrength } from "./CoachProgram";
import { setLength, setLighterWeeks } from "./programBuilder";
import { cellText, loadFor, parseCell, pinWeek, planExercise, unpinWeek } from "./programPlan";

/** Bench 4 × 6–8 (at `weight` if given), eight weeks, lighter weeks 4 and 8. */
function program(rule: ProgramRule, weight?: number): { p: CoachProgram; id: string } {
  let p = createCoachProgram("Hypertrophy A");
  const w = p.weeks[0]!.id;
  p = addDay(p, w, "Upper A");
  const d = p.weeks[0]!.days[0]!.id;
  p = addStrengthBlock(p, w, d, { exerciseName: "Bench Press" });
  const id = p.weeks[0]!.days[0]!.blocks[0]!.id;
  for (let i = 0; i < 4; i++) p = addSet(p, w, d, id, { repsMin: 6, repsMax: 8, ...(weight ? { weight } : {}) });
  p = setLighterWeeks(setLength({ ...p, rule }, 8), [4, 8]);
  return { p, id };
}
const texts = (p: CoachProgram, id: string, ctx = {}) => planExercise(p, id, ctx).map((c) => (c ? cellText(c, 4) : ""));

describe("what the rules plan, week by week", () => {
  it("fixed: the numbers as typed; lighter weeks halve the sets", () => {
    const { p, id } = program({ kind: "fixed" }, 60);
    expect(texts(p, id)).toEqual(["60 × 6–8", "60 × 6–8", "60 × 6–8", "60 × 6 · 2 sets", "60 × 6–8", "60 × 6–8", "60 × 6–8", "60 × 6 · 2 sets"]);
  });

  it("linear: a rep a week through the range, then the step", () => {
    const { p, id } = program({ kind: "linear", stepKg: 2.5 }, 60);
    expect(texts(p, id)).toEqual(["60 × 6", "60 × 7", "60 × 8", "60 × 6 · 2 sets", "62.5 × 6", "62.5 × 7", "62.5 × 8", "62.5 × 6 · 2 sets"]);
  });

  it("LogIt Adaptive: from their estimate, and in words without one", () => {
    const { p, id } = program({ kind: "adaptive" });
    expect(texts(p, id)[0]).toBe("6–8, from their estimate");
    const withEst = texts(p, id, { e1rm: () => 82 });
    expect(withEst[0]).toBe(`${loadFor(82, 8)} × 8`);
    expect(withEst[1]).toMatch(/× 7$/);
  });

  it("4-week wave: the top set as a share of a training max", () => {
    const { p, id } = program({ kind: "wave" });
    expect(texts(p, id, { e1rm: () => 100 }).slice(0, 3)).toEqual(["77.5 × 5", "80 × 3", "85 × 5/3/1"]);
  });

  it("a week typed over stays put, done weeks show what they did, and Clear gives it back", () => {
    const { p, id } = program({ kind: "linear", stepKg: 2.5 }, 60);
    const pinned = pinWeek(p, 3, id, parseCell("65 × 5")!);
    expect(texts(pinned, id)[2]).toBe("65 × 5");
    expect(planExercise(pinned, id)[2]!.source).toBe("pinned");
    const done = planExercise(pinned, id, { done: (n) => (n === 1 ? { weight: 60, reps: 8 } : null) });
    expect(done[0]).toMatchObject({ source: "done", weight: 60, reps: "8" });
    expect(texts(unpinWeek(pinned, 3, id), id)[2]).toBe("60 × 8");
    const b = unpinWeek(pinned, 3, id).weeks.find((w) => w.weekNumber === 3)!.days[0]!.blocks[0] as ProgramStrength;
    expect(b.sets.some((s) => s.pinned)).toBe(false);
  });

  it("reads what a coach types into a cell", () => {
    expect(parseCell("62.5 × 7")).toEqual({ weight: 62.5, reps: 7 });
    expect(parseCell("62,5x7")).toEqual({ weight: 62.5, reps: 7 });
    expect(parseCell("bw x 10")).toEqual({ weight: 0, reps: 10 });
    expect(parseCell("60kg 6-8")).toEqual({ weight: 60, repsMin: 6, repsMax: 8 });
    expect(parseCell("8")).toEqual({ reps: 8 });
    expect(parseCell("heavy")).toBeNull();
  });
});

describe("rules on the phone, and the coach's own rules", () => {
  it("starting a day uses this week's planned numbers, with a lighter week's fewer sets", async () => {
    const { programDaySession } = await import("./programDaySession");
    const { planForWeek } = await import("./programPlan");
    const { p, id } = program({ kind: "linear", stepKg: 2.5 }, 60);
    const day = p.weeks.find((w) => w.weekNumber === 2)!.days[0]!;
    const s2 = programDaySession(day, { plan: planForWeek(p, 2, {}) });
    const sets2 = (s2.blocks[0]!.data as { sets: { weight: number; reps: number }[] }).sets;
    expect(sets2.map((s) => `${s.weight}×${s.reps}`)).toEqual(["60×7", "60×7", "60×7", "60×7"]);
    const lighter = p.weeks.find((w) => w.weekNumber === 4)!.days[0]!;
    const s4 = programDaySession(lighter, { plan: planForWeek(p, 4, {}) });
    expect((s4.blocks[0]!.data as { sets: unknown[] }).sets).toHaveLength(2);
    expect(id).toBeTruthy();
  });

  it("an own rule plans like the built-in it's made from", () => {
    const { p, id } = program({ kind: "own", ruleId: "r1", name: "Top set", recipe: { name: "Top set", weightFrom: "last", repRange: [5, 8], repsInReserve: 1, setLayout: "topBackoff", increment: 5, whenStalled: "deload", sets: { mode: "fixed", count: 3 }, food: "ignore" } }, 100);
    expect(texts(p, id).slice(0, 5)).toEqual(["100 × 5 · 3 sets", "100 × 6 · 3 sets", "100 × 7 · 3 sets", "100 × 5 · 2 sets", "100 × 8 · 3 sets"]);
  });

  it("estimates come from the best recent set", async () => {
    const { estimatesFrom } = await import("./programPlan");
    const now = Date.now();
    const m = estimatesFrom([{ startedAtMs: now - 86_400_000, blocks: [{ type: "strength", data: { exerciseName: "Bench Press", sets: [{ weight: 60, reps: 8 }, { weight: 70, reps: 3, setType: "warmup" }, { weight: 65, reps: 5, completed: false }] } }] }], now);
    expect(Math.round(m.get("bench press")!)).toBe(76);
  });
});

import { describe, expect, it } from "vitest";
import { logitEntries } from "./library";
import {
  askToSwapMessage,
  programSwaps,
  sameMainMuscles,
  swapChoices,
  swapTargetFor,
  swapVerdict,
  type SwapTarget,
} from "./swaps";
import {
  addAlternative,
  addDay,
  addStrengthBlock,
  addWeek,
  copyProgramForClient,
  createCoachProgram,
  removeAlternative,
  type CoachProgram,
  type ProgramStrength,
} from "./CoachProgram";
import { programDaySession } from "./programDaySession";
import { sourceFromProgramDay } from "./sessionHistory";
import { getExercises, swapExercise, type WorkoutSession } from "./workout";

const library = logitEntries("strength");
const ex = (name: string) => {
  const e = library.find((x) => x.item.name === name);
  if (e?.kind !== "strength") throw new Error(`no ${name} in the bank`);
  return e.item;
};

const squat: SwapTarget = { name: "Squat", exerciseId: "core_squat", alternatives: [{ name: "Leg Press", exerciseId: "core_leg_press" }] };

describe("swap rules", () => {
  it("same muscles means the planned exercise's main muscle", () => {
    expect(sameMainMuscles(ex("Squat"), ex("Leg Extension"))).toBe(true);
    expect(sameMainMuscles(ex("Squat"), ex("Bulgarian Split Squat"))).toBe(true);
    // Shares only the glutes with Squat.
    expect(sameMainMuscles(ex("Squat"), ex("Romanian Deadlift"))).toBe(false);
    expect(sameMainMuscles(undefined, ex("Squat"))).toBe(false);
  });

  it("the coach's list is allowed under every rule", () => {
    for (const rule of ["any", "muscles", "list"] as const) {
      expect(swapVerdict(rule, squat, { name: "leg press" }, library)).toEqual({ allowed: true, why: "list" });
    }
  });

  it("each rule decides the rest", () => {
    const rdl = { name: "Romanian Deadlift", id: "core_romanian_deadlift" };
    const goblet = { name: "Goblet Squat", id: "core_goblet_squat" };
    expect(swapVerdict("any", squat, rdl, library)).toEqual({ allowed: true, why: "any" });
    expect(swapVerdict("muscles", squat, goblet, library)).toEqual({ allowed: true, why: "muscles" });
    expect(swapVerdict("muscles", squat, rdl, library)).toEqual({ allowed: false, why: "not-same-muscles" });
    expect(swapVerdict("list", squat, goblet, library)).toEqual({ allowed: false, why: "not-listed" });
  });

  it("an exercise with unknown muscles only swaps to the list under 'muscles'", () => {
    const custom: SwapTarget = { name: "Coach's Special Squat" };
    expect(swapVerdict("muscles", custom, { name: "Goblet Squat" }, library).allowed).toBe(false);
  });
});

describe("swap sheet lists", () => {
  it("no search: coach's picks, then same-muscle suggestions without the planned one", () => {
    const c = swapChoices("muscles", squat, library);
    expect(c.fromCoach.map((x) => x.name)).toEqual(["Leg Press"]);
    const names = c.sameMuscles.map((x) => x.name);
    expect(names).toContain("Goblet Squat");
    expect(names).not.toContain("Squat");
    expect(names).not.toContain("Leg Press"); // already under the coach's picks
    expect(names).not.toContain("Romanian Deadlift");
    expect(c.results).toEqual([]);
  });

  it("'list' and 'any' suggest nothing beyond the coach's picks", () => {
    expect(swapChoices("list", squat, library).sameMuscles).toEqual([]);
    expect(swapChoices("any", squat, library).sameMuscles).toEqual([]);
  });

  it("a search shows blocked results after allowed ones", () => {
    const c = swapChoices("muscles", squat, library, "curl");
    expect(c.results.length).toBeGreaterThan(0);
    expect(c.results.every((r) => !r.verdict.allowed)).toBe(true);
    const sq = swapChoices("muscles", squat, library, "squat").results;
    const firstBlocked = sq.findIndex((r) => !r.verdict.allowed);
    if (firstBlocked >= 0) expect(sq.slice(firstBlocked).every((r) => !r.verdict.allowed)).toBe(true);
  });

  it("writes the ask message", () => {
    expect(askToSwapMessage("Romanian Deadlift", "Lying Leg Curl")).toBe("Can I swap Romanian Deadlift for Lying Leg Curl today?");
    expect(askToSwapMessage("Romanian Deadlift")).toBe("Can I swap Romanian Deadlift for something else today?");
  });
});

function programWithSquat(): { program: CoachProgram; weekIds: string[] } {
  let p = createCoachProgram("Strength block");
  p = addWeek(p);
  for (const w of p.weeks) {
    p = addDay(p, w.id, "Lower");
    const day = p.weeks.find((x) => x.id === w.id)!.days[0]!;
    p = addStrengthBlock(p, w.id, day.id, { exerciseName: "Squat", exerciseId: "core_squat" });
    p = addStrengthBlock(p, w.id, day.id, { exerciseName: "Leg Curl", exerciseId: "core_leg_curl" });
  }
  return { program: p, weekIds: p.weeks.map((w) => w.id) };
}

const squats = (p: CoachProgram) =>
  p.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks)).filter((b): b is ProgramStrength => b.type === "strength" && b.exerciseName === "Squat");

describe("approved alternatives in a program", () => {
  it("apply to the exercise in every week, without duplicates or the exercise itself", () => {
    let { program } = programWithSquat();
    const sq = { exerciseName: "Squat", exerciseId: "core_squat" };
    program = addAlternative(program, sq, { exerciseName: "Leg Press", exerciseId: "core_leg_press" });
    program = addAlternative(program, sq, { exerciseName: "leg press" });
    program = addAlternative(program, sq, { exerciseName: "Squat" });
    program = addAlternative(program, sq, { exerciseName: "Hack Squat" });
    expect(squats(program)).toHaveLength(2);
    for (const b of squats(program)) expect(b.alternatives?.map((a) => a.exerciseName)).toEqual(["Leg Press", "Hack Squat"]);

    program = removeAlternative(program, sq, "LEG PRESS");
    for (const b of squats(program)) expect(b.alternatives?.map((a) => a.exerciseName)).toEqual(["Hack Squat"]);
    program = removeAlternative(program, sq, "Hack Squat");
    for (const b of squats(program)) expect(b.alternatives).toBeUndefined();
  });

  it("go along when the program is assigned", () => {
    let { program } = programWithSquat();
    program = addAlternative(program, { exerciseName: "Squat", exerciseId: "core_squat" }, { exerciseName: "Leg Press" });
    const copy = copyProgramForClient(program, { mode: "manual" });
    for (const b of squats(copy)) expect(b.alternatives?.map((a) => a.exerciseName)).toEqual(["Leg Press"]);
  });
});

function programWorkout(): WorkoutSession {
  let { program } = programWithSquat();
  program = addAlternative(program, { exerciseName: "Squat", exerciseId: "core_squat" }, { exerciseName: "Leg Press", exerciseId: "core_leg_press" });
  const day = program.weeks[0]!.days[0]!;
  const built = programDaySession(day);
  return { ...built, source: sourceFromProgramDay({ ...program, coachId: "coach-1" }, day, built) };
}

describe("in the workout", () => {
  it("the plan carries the coach, and the alternatives on the right exercise", () => {
    const s = programWorkout();
    expect(s.source?.coachId).toBe("coach-1");
    expect(s.source?.plan?.map((p) => [p.name, p.alternatives?.map((a) => a.name)])).toEqual([
      ["Squat", ["Leg Press"]],
      ["Leg Curl", undefined],
    ]);
  });

  it("finds the planned exercise for a block, even after it was swapped", () => {
    let s = programWorkout();
    const squatBlock = getExercises(s)[0]!.id;
    expect(swapTargetFor(s, squatBlock)?.name).toBe("Squat");
    s = swapExercise(s, squatBlock, { exerciseName: "Goblet Squat", exerciseId: "core_goblet_squat" });
    expect(swapTargetFor(s, squatBlock)).toMatchObject({ name: "Squat", alternatives: [{ name: "Leg Press" }] });
  });

  it("isn't limited outside coach programs", () => {
    const s = programWorkout();
    expect(swapTargetFor({ ...s, source: { ...s.source!, kind: "split" } }, getExercises(s)[0]!.id)).toBeNull();
  });

  it("lists swaps for the coach with why they were allowed", () => {
    let a = programWorkout();
    const [sq, curl] = getExercises(a).map((e) => e.id);
    a = swapExercise(a, sq!, { exerciseName: "Leg Press", exerciseId: "core_leg_press" });
    a = swapExercise(a, curl!, { exerciseName: "Seated Leg Curl", exerciseId: "core_seated_leg_curl" });
    let b = { ...programWorkout(), id: "later", startedAtMs: a.startedAtMs + 1000 };
    b = swapExercise(b, getExercises(b)[0]!.id, { exerciseName: "Romanian Deadlift" });

    const rows = programSwaps([a, b], library);
    expect(rows.map((r) => [r.planned, r.didInstead, r.why])).toEqual([
      ["Squat", "Romanian Deadlift", "other"],
      ["Squat", "Leg Press", "list"],
      ["Leg Curl", "Seated Leg Curl", "muscles"],
    ]);
    expect(programSwaps([a, b], library, { coachId: "someone-else" })).toEqual([]);
  });
});

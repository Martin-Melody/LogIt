import { describe, expect, it } from "vitest";
import { createSession, replanAfterShortSet, type SetTarget, type WorkoutSession } from "./workout";

type S = { reps: number; weight: number; completed?: boolean; setType?: string; target?: SetTarget };
function session(sets: S[]): WorkoutSession {
  return {
    ...createSession(0),
    blocks: [{ id: "b", type: "strength", orderIndex: 0, data: { exerciseName: "Lateral Raise", sets: sets.map((s, i) => ({ id: `s${i + 1}`, setType: "normal", orderIndex: i, ...s })) } }],
  } as unknown as WorkoutSession;
}
const sets = (s: WorkoutSession) => (s.blocks[0]!.data as { sets: S[] }).sets;
const loads = { round: (kg: number) => Math.round(kg / 2.5) * 2.5, down: (kg: number) => kg - 2.5 };
const plan = (reps: number, weight: number): S => ({ reps: 0, weight, target: { reps, weight } });

describe("a short set re-plans the sets after it", () => {
  // The screenshot: 12 ✓, then 7 of 10 at 17.5; 17.5 × 8 and 12.5 × 8 still to go.
  const s = session([
    { reps: 12, weight: 17.5, completed: true, target: { reps: 12, weight: 17.5 } },
    { reps: 7, weight: 17.5, completed: true, target: { reps: 10, weight: 17.5 } },
    plan(8, 17.5),
    plan(8, 12.5),
  ]);

  it("keeps the reps and lowers the weight, remembering the original plan", () => {
    const out = sets(replanAfterShortSet(s, "b", "s2", loads));
    expect(out[2]).toMatchObject({ weight: 15, target: { reps: 8, weight: 15, planned: { reps: 8, weight: 17.5 } } });
    // 12.5 × 0.93 rounds back to 12.5, where 8 would be ~5: a step lighter keeps the 8.
    expect(out[3]).toMatchObject({ weight: 10, target: { reps: 8, weight: 10, planned: { reps: 8, weight: 12.5 } } });
    expect(out.slice(0, 2)).toEqual(sets(s).slice(0, 2));
  });

  it("does nothing for one rep short, an unticked set, or a set with no plan", () => {
    const oneShort = session([{ reps: 9, weight: 17.5, completed: true, target: { reps: 10, weight: 17.5 } }, plan(8, 17.5)]);
    expect(replanAfterShortSet(oneShort, "b", "s1", loads)).toEqual(oneShort);
    const notTicked = session([{ reps: 5, weight: 17.5, target: { reps: 10, weight: 17.5 } }, plan(8, 17.5)]);
    expect(replanAfterShortSet(notTicked, "b", "s1", loads)).toEqual(notTicked);
    const noPlan = session([{ reps: 5, weight: 17.5, completed: true }, plan(8, 17.5)]);
    expect(replanAfterShortSet(noPlan, "b", "s1", loads)).toEqual(noPlan);
  });

  it("judges a set done at another weight by the reps it's worth at the plan", () => {
    // 8 at 20 kg ≈ 10.6 at 17.5: not short of 10.
    const heavier = session([{ reps: 8, weight: 20, completed: true, target: { reps: 10, weight: 17.5 } }, plan(8, 17.5)]);
    expect(replanAfterShortSet(heavier, "b", "s1", loads)).toEqual(heavier);
  });

  it("leaves sets the lifter has typed into", () => {
    const typed = session([
      { reps: 6, weight: 17.5, completed: true, target: { reps: 10, weight: 17.5 } },
      { reps: 0, weight: 20, target: { reps: 8, weight: 17.5 } },
      { reps: 6, weight: 17.5, target: { reps: 8, weight: 17.5 } },
    ]);
    expect(replanAfterShortSet(typed, "b", "s1", loads)).toEqual(typed);
  });

  it("lowers the reps when the weight can't come down a step", () => {
    const machine = { round: (kg: number) => Math.round(kg / 10) * 10, down: (kg: number) => kg - 10 }; // 10 kg plates
    const m = session([{ reps: 8, weight: 50, completed: true, target: { reps: 10, weight: 50 } }, plan(10, 50)]);
    expect(sets(replanAfterShortSet(m, "b", "s1", machine))[1]).toMatchObject({ weight: 50, target: { reps: 8, weight: 50, planned: { reps: 10, weight: 50 } } });
  });

  it("a second short set keeps the first original plan", () => {
    const once = replanAfterShortSet(s, "b", "s2", loads);
    const third = sets(once).map((x, i) => (i === 2 ? { ...x, reps: 5, completed: true } : x));
    const twice = sets(replanAfterShortSet(session(third), "b", "s3", loads));
    expect(twice[3]).toMatchObject({ weight: 7.5, target: { weight: 7.5, planned: { reps: 8, weight: 12.5 } } });
    expect(twice[2]!.target!.planned).toEqual({ reps: 8, weight: 17.5 });
  });
});

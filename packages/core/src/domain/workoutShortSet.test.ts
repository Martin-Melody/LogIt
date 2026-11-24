import { describe, expect, it } from "vitest";
import { createSession, replanAfterSet, replanForOrder, useReplan, type SetTarget, type WorkoutSession } from "./workout";

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
    const out = sets(replanAfterSet(s, "b", "s2", loads));
    expect(out[2]).toMatchObject({ weight: 15, target: { reps: 8, weight: 15, planned: { reps: 8, weight: 17.5 } } });
    // 12.5 × 0.93 rounds back to 12.5, where 8 would be ~5: a step lighter keeps the 8.
    expect(out[3]).toMatchObject({ weight: 10, target: { reps: 8, weight: 10, planned: { reps: 8, weight: 12.5 } } });
    expect(out.slice(0, 2)).toEqual(sets(s).slice(0, 2));
  });

  it("does nothing for one rep short, an unticked set, or a set with no plan", () => {
    const oneShort = session([{ reps: 9, weight: 17.5, completed: true, target: { reps: 10, weight: 17.5 } }, plan(8, 17.5)]);
    expect(replanAfterSet(oneShort, "b", "s1", loads)).toEqual(oneShort);
    const notTicked = session([{ reps: 5, weight: 17.5, target: { reps: 10, weight: 17.5 } }, plan(8, 17.5)]);
    expect(replanAfterSet(notTicked, "b", "s1", loads)).toEqual(notTicked);
    const noPlan = session([{ reps: 5, weight: 17.5, completed: true }, plan(8, 17.5)]);
    expect(replanAfterSet(noPlan, "b", "s1", loads)).toEqual(noPlan);
  });

  it("judges a set done at another weight by the reps it's worth at the plan", () => {
    // 8 at 20 kg ≈ 13 at 17.5: not short of 10 but 3 over, so the next set goes up.
    const heavier = session([{ reps: 8, weight: 20, completed: true, target: { reps: 10, weight: 17.5 } }, plan(8, 17.5)]);
    expect(sets(replanAfterSet(heavier, "b", "s1", loads))[1]).toMatchObject({ weight: 20, target: { reps: 8, weight: 20 } });
  });

  it("leaves sets the lifter has typed into", () => {
    const typed = session([
      { reps: 6, weight: 17.5, completed: true, target: { reps: 10, weight: 17.5 } },
      { reps: 0, weight: 20, target: { reps: 8, weight: 17.5 } },
      { reps: 6, weight: 17.5, target: { reps: 8, weight: 17.5 } },
    ]);
    expect(replanAfterSet(typed, "b", "s1", loads)).toEqual(typed);
  });

  it("lowers the reps when the weight can't come down a step", () => {
    const machine = { round: (kg: number) => Math.round(kg / 10) * 10, down: (kg: number) => kg - 10 }; // 10 kg plates
    const m = session([{ reps: 8, weight: 50, completed: true, target: { reps: 10, weight: 50 } }, plan(10, 50)]);
    expect(sets(replanAfterSet(m, "b", "s1", machine))[1]).toMatchObject({ weight: 50, target: { reps: 8, weight: 50, planned: { reps: 10, weight: 50 } } });
  });

  it("a second short set keeps the first original plan", () => {
    const once = replanAfterSet(s, "b", "s2", loads);
    const third = sets(once).map((x, i) => (i === 2 ? { ...x, reps: 5, completed: true } : x));
    const twice = sets(replanAfterSet(session(third), "b", "s3", loads));
    expect(twice[3]).toMatchObject({ weight: 7.5, target: { weight: 7.5, planned: { reps: 8, weight: 12.5 } } });
    expect(twice[2]!.target!.planned).toEqual({ reps: 8, weight: 17.5 });
  });

  it("Keep the plan and Use lighter swap back and forth", () => {
    const re = replanAfterSet(s, "b", "s2", loads);
    expect(sets(re)[2]!.target!.replanned).toEqual({ reps: 8, weight: 15, why: "short" });
    const kept = useReplan(re, "b", "plan");
    expect(sets(kept).slice(2).map((x) => [x.weight, x.target!.weight])).toEqual([[17.5, 17.5], [12.5, 12.5]]);
    const back = useReplan(kept, "b", "replan");
    expect(sets(back).slice(2).map((x) => [x.weight, x.target!.weight])).toEqual([[15, 15], [10, 10]]);
    // A set started in between keeps what it has.
    const started = session(sets(kept).map((x, i) => (i === 2 ? { ...x, reps: 8 } : x)));
    expect(sets(useReplan(started, "b", "replan"))[2]!.weight).toBe(17.5);
  });
});

describe("a set that beat its aim re-plans the sets after it up", () => {
  // Martin's T-Bar Row, 24 Nov: 42.5 × 13 re-planned the rest to 42.5; then 45 × 8 where 42.5 × 8 was the aim.
  it("goes up to the weight the set was worth, keeping the reps and the first plan", () => {
    const s = session([
      { reps: 13, weight: 42.5, completed: true, target: { reps: 13, weight: 52.5 } },
      { reps: 8, weight: 45, completed: true, target: { reps: 8, weight: 42.5, planned: { reps: 8, weight: 52.5 }, replanned: { reps: 8, weight: 42.5, why: "short" } } },
      { reps: 0, weight: 42.5, target: { reps: 6, weight: 42.5, planned: { reps: 6, weight: 52.5 }, replanned: { reps: 6, weight: 42.5, why: "short" } } },
    ]);
    expect(sets(replanAfterSet(s, "b", "s2", loads))[2]).toMatchObject({
      weight: 45, target: { reps: 6, weight: 45, planned: { reps: 6, weight: 52.5 }, replanned: { reps: 6, weight: 45, why: "over" } },
    });
  });

  it("adds reps, at most 2, when the next weight up is too far", () => {
    const machine = { round: (kg: number) => Math.round(kg / 10) * 10, down: (kg: number) => kg - 10 };
    const m = session([{ reps: 13, weight: 50, completed: true, target: { reps: 10, weight: 50 } }, plan(10, 50)]);
    expect(sets(replanAfterSet(m, "b", "s1", machine))[1]).toMatchObject({ weight: 50, target: { reps: 12, weight: 50, replanned: { why: "over" } } });
  });

  it("does nothing for one rep over", () => {
    const oneOver = session([{ reps: 11, weight: 17.5, completed: true, target: { reps: 10, weight: 17.5 } }, plan(8, 17.5)]);
    expect(replanAfterSet(oneOver, "b", "s1", loads)).toEqual(oneOver);
  });
});

describe("moving an exercise re-plans its untouched sets", () => {
  it("set by set, keeping the first plan; nothing when the plan is the same", () => {
    const s = session([plan(10, 20), plan(9, 20), plan(8, 20)]);
    const moved = sets(replanForOrder(s, "b", [{ reps: 10, weight: 17.5 }, { reps: 9, weight: 17.5 }, { reps: 8, weight: 20 }]));
    expect(moved[0]).toMatchObject({ weight: 17.5, target: { weight: 17.5, planned: { reps: 10, weight: 20 }, replanned: { why: "order" } } });
    expect(moved[2]!.target!.replanned).toBeUndefined();
    expect(replanForOrder(s, "b", [{ reps: 10, weight: 20 }])).toEqual(s);
  });

  it("leaves logged and typed-into sets", () => {
    const s = session([{ reps: 10, weight: 20, completed: true, target: { reps: 10, weight: 20 } }, { reps: 0, weight: 22.5, target: { reps: 9, weight: 20 } }, plan(8, 20)]);
    const out = sets(replanForOrder(s, "b", [{ reps: 8, weight: 15 }]));
    expect(out.map((x) => x.weight)).toEqual([20, 22.5, 15]);
  });
});

import { describe, it, expect } from "vitest";
import { linearMobility, mobilityWeekOf } from "./linearMobility";
import type {
  MobilityProgressionInput,
  MobilityProgressionOutput,
  MobilityHistoryEntry,
} from "../../domain/mobilityProgression";

function run(partial: Partial<MobilityProgressionInput>): MobilityProgressionOutput & {
  sets: Array<{ side?: string; durationSec?: number; reps?: number; loadKg?: number }>;
  nextState: { streak: Record<string, { hits: number; misses: number }> };
} {
  const input: MobilityProgressionInput = {
    drill: { name: "Test", metric: "hold", perSide: false },
    history: [],
    state: linearMobility.defaultState,
    userPreferences: linearMobility.defaultPreferences,
    now: 0,
    ...partial,
  };
  return linearMobility.suggest(input) as never;
}

function session(sets: MobilityHistoryEntry["sets"]): MobilityHistoryEntry {
  return { sessionId: "s", performedAtMs: 1, sets };
}

describe("linearMobility", () => {
  it("seeds a conservative prescription with no history", () => {
    const out = run({ drill: { name: "T", metric: "hold", perSide: false } });
    expect(out.sets).toHaveLength(3);
    expect(out.sets[0].durationSec).toBe(20);
  });

  it("says first time, not last → next, when there's no last time (bug hunt 13.13)", () => {
    expect(run({ drill: { name: "T", metric: "hold", perSide: true } }).label).toBe("First time: aim 20 s L · 20 s R");
    expect(run({ history: [session([{ durationSec: 45, targetSec: 45, completed: true, depth: 4 }])] }).label).toMatch(/^Last → next/);
  });

  it("adds hold time when the target was met", () => {
    const out = run({
      history: [session([{ durationSec: 45, targetSec: 45, completed: true, depth: 4 }])],
    });
    expect(out.sets[0].durationSec).toBe(50);
  });

  it("snaps a stopwatch hold to a 5-second goal", () => {
    // Stopped the timer at 34s against a 30s goal: next goal is 40s, not 39s.
    const out = run({
      history: [session([{ durationSec: 34, targetSec: 30, completed: true, depth: 4 }])],
    });
    expect(out.sets[0].durationSec).toBe(40);
  });

  it("keeps 1-second steps when the increment is under 5s", () => {
    const out = run({
      history: [session([{ durationSec: 34, targetSec: 30, completed: true, depth: 4 }])],
      userPreferences: { ...(linearMobility.defaultPreferences as object), holdIncrementSec: 2 },
    });
    expect(out.sets[0].durationSec).toBe(36);
  });

  it("holds steady after a single miss", () => {
    const out = run({
      history: [session([{ durationSec: 40, targetSec: 60, completed: true, depth: 4 }])],
    });
    expect(out.sets[0].durationSec).toBe(40);
    expect(out.nextState.streak.both.misses).toBe(1);
  });

  it("backs off ~10% after two misses", () => {
    const out = run({
      state: { streak: { both: { hits: 0, misses: 1 } } },
      history: [session([{ durationSec: 50, targetSec: 70, completed: true, depth: 4 }])],
    });
    expect(out.sets[0].durationSec).toBe(45); // round(50 * 0.9)
  });

  it("does not progress hold when depth is too light, if the depth gate is turned on", () => {
    const out = run({
      history: [session([{ durationSec: 45, targetSec: 45, completed: true, depth: 2 }])],
      userPreferences: { ...(linearMobility.defaultPreferences as object), minDepthToProgress: 3 },
    });
    expect(out.sets[0].durationSec).toBe(45);
    expect(out.notes).toMatch(/depth/i);
  });

  it("adds a rep below the ceiling", () => {
    const out = run({
      drill: { name: "T", metric: "reps", perSide: false },
      history: [session([{ reps: 10, completed: true }])],
    });
    expect(out.sets[0].reps).toBe(11);
  });

  it("adds load and resets reps at the ceiling on a loaded drill", () => {
    const out = run({
      drill: { name: "T", metric: "reps", perSide: false },
      history: [session([{ reps: 15, loadKg: 5, completed: true }])],
    });
    expect(out.sets[0].loadKg).toBe(7.5);
    expect(out.sets[0].reps).toBe(8);
  });

  it("progresses each side independently", () => {
    const out = run({
      drill: { name: "T", metric: "hold", perSide: true },
      history: [
        session([
          { side: "left", durationSec: 30, targetSec: 60, completed: true, depth: 4 },
          { side: "right", durationSec: 45, targetSec: 45, completed: true, depth: 4 },
        ]),
      ],
    });
    const left = out.sets.find((s) => s.side === "left")!;
    const right = out.sets.find((s) => s.side === "right")!;
    expect(left.durationSec).toBe(30); // missed → steady
    expect(right.durationSec).toBe(50); // met → +5
  });
});

describe("Progress: past the area's weekly time", () => {
  const lizard = { takesLoad: false, harderCues: ["Elbows down to the floor", "Back knee lifted"], harder: [{ id: "core:couch-stretch", name: "Couch stretch" }, { id: "core:pigeon", name: "Pigeon pose" }], steady: false };
  const done = { area: "hip-flexors", doneSec: 620, targetSec: 600 };
  const last = [session([{ durationSec: 60, targetSec: 60, completed: true }])];

  it("below the weekly time, still adds time as before", () => {
    const out = run({ history: last, areaWeek: { ...done, doneSec: 300 }, progression: lizard });
    expect(out.sets[0].durationSec).toBe(65);
    expect(out.next).toBeUndefined();
  });

  it("past it, holds steady and offers the next harder cue and the harder drills", () => {
    const out = run({ history: last, areaWeek: done, progression: lizard });
    expect(out.sets[0].durationSec).toBe(60);
    expect(out.next).toEqual({
      areaWeek: done,
      cue: { text: "Elbows down to the floor", step: 1, of: 2 },
      harder: lizard.harder,
    });
  });

  it("a drill that takes load is offered load first, then a step more each time", () => {
    const loadable = { ...lizard, takesLoad: true };
    expect(run({ history: last, areaWeek: done, progression: loadable }).next?.load).toEqual({ kg: 5 });
    const loaded = [session([{ durationSec: 60, targetSec: 60, loadKg: 5, completed: true }])];
    const out = run({ history: loaded, areaWeek: done, progression: loadable });
    expect(out.sets[0]).toMatchObject({ durationSec: 60, loadKg: 5 });
    expect(out.next?.load).toEqual({ kg: 7.5 });
  });

  it("after the cues, with no harder drill in the catalog, asks the person to pick one", () => {
    const out = run({ history: last, areaWeek: done, progression: { ...lizard, harder: [] }, state: { streak: {}, cueStep: 2 } });
    expect(out.next).toEqual({ areaWeek: done, pickHarder: true });
    expect(out.notes).toMatch(/Cue: Back knee lifted/);
  });

  it("neck drills never get a harder suggestion; Not yet waits until next week", () => {
    expect(run({ history: last, areaWeek: done, progression: { ...lizard, steady: true } }).next).toBeUndefined();
    const now = Date.UTC(2026, 10, 20, 12);
    expect(run({ history: last, areaWeek: done, progression: lizard, now, state: { streak: {}, declinedWeek: mobilityWeekOf(now) } }).next).toBeUndefined();
  });
});

describe("Progress: history logged without sides", () => {
  it("counts for each side of a per-side drill", () => {
    const out = run({ drill: { name: "Lizard pose", metric: "hold", perSide: true }, history: [session([{ durationSec: 60, targetSec: 60, completed: true }])] });
    expect(out.sets.map((x) => [x.side, x.durationSec])).toContainEqual(["left", 65]);
    expect(out.sets.map((x) => [x.side, x.durationSec])).toContainEqual(["right", 65]);
  });
});

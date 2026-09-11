import { describe, it, expect } from "vitest";
import { linearMobility } from "./linearMobility";
import type {
  MobilityProgressionInput,
  MobilityProgressionOutput,
  MobilityHistoryEntry,
} from "@logit/core/domain/mobilityProgression";

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

  it("adds hold time when the target was met", () => {
    const out = run({
      history: [session([{ durationSec: 45, targetSec: 45, completed: true, depth: 4 }])],
    });
    expect(out.sets[0].durationSec).toBe(50);
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

  it("does not progress hold when depth is too light", () => {
    const out = run({
      history: [session([{ durationSec: 45, targetSec: 45, completed: true, depth: 2 }])],
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

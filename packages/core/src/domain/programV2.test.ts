import { describe, expect, it } from "vitest";
import {
  appVersionAtLeast,
  blockLine,
  canRunBlock,
  createCoachProgram,
  parseProgram,
  ruleFor,
  upgradeProgram,
  UPDATE_LINE,
  V2_BLOCKS_APP_VERSION,
  type CoachProgram,
  type ProgramDay,
} from "./CoachProgram";
import { programDaySession, unrunnableBlocks } from "./programDaySession";
import { programWeekToSplit } from "./programToSplit";
import type { BlockDeclaration } from "./blockPlugin";
import { blockGroup } from "./workout";

const v1Day: ProgramDay = {
  id: "d1", orderIndex: 0, name: "Upper A",
  blocks: [
    { type: "strength", id: "b1", orderIndex: 0, exerciseName: "Bench Press", sets: [{ id: "s1", orderIndex: 0, setType: "normal", reps: 8, weight: 60 }] },
    { type: "cardio", id: "b2", orderIndex: 1, activityName: "Bike" },
  ],
};

function v1(): CoachProgram {
  const p = createCoachProgram("Hypertrophy A");
  const { schemaVersion: _v, rule: _r, ...rest } = p;
  return { ...rest, weeks: [{ ...p.weeks[0]!, days: [v1Day] }] };
}

const v2Day: ProgramDay = {
  id: "d2", orderIndex: 1, name: "Lower B",
  blocks: [
    { type: "strength", id: "sq", orderIndex: 0, exerciseName: "Squat", rule: { kind: "linear", stepKg: 2.5 }, sets: [{ id: "q1", orderIndex: 0, setType: "normal", reps: 5, weight: 100, pinned: true }] },
    {
      type: "circuit", id: "c1", orderIndex: 1, rounds: 3, memberRestSec: 15, roundRestSec: 90, minAppVersion: V2_BLOCKS_APP_VERSION,
      members: [{ id: "m1", exerciseName: "Kettlebell Swing", reps: 15 }, { id: "m2", exerciseName: "Plank", durationSec: 40 }],
    },
    { type: "mobility", id: "mo", orderIndex: 2, drillName: "Shoulder CARs", sets: 2, targetSec: 30, minAppVersion: V2_BLOCKS_APP_VERSION },
    { type: "plugin", id: "pl", orderIndex: 3, pluginId: "emom", name: "EMOM timer", values: { minutes: 10 }, minAppVersion: V2_BLOCKS_APP_VERSION },
    { type: "laser-tag", id: "fut", orderIndex: 4 } as unknown as ProgramDay["blocks"][number],
  ],
};

const emom: BlockDeclaration = {
  id: "emom", name: "EMOM timer", entry: { one: "Minute", many: "Minutes" },
  blockFields: [{ key: "minutes", label: "Minutes", type: "number" }], fields: [],
} as unknown as BlockDeclaration;

describe("program data v2", () => {
  it("v1 becomes v2 without losing anything: numbers stay, the rule is fixed", () => {
    const old = v1();
    const up = upgradeProgram(old);
    expect(up.schemaVersion).toBe(2);
    expect(up.rule).toEqual({ kind: "fixed" });
    expect(up.weeks).toEqual(old.weeks);
    expect(upgradeProgram(up)).toBe(up); // already v2: unchanged
    expect(parseProgram(JSON.stringify(old))).toEqual(up);
  });

  it("old programs that said on-accept start when the client taps Start", () => {
    const legacy = { ...v1(), startMode: "on-accept" } as unknown as CoachProgram;
    expect(upgradeProgram(legacy).startMode).toBe("manual");
  });

  it("newer blocks say which app first runs them", () => {
    const { minAppVersion: _m, ...noVersion } = v2Day.blocks[2] as Extract<ProgramDay["blocks"][number], { type: "mobility" }>;
    const p = { ...v1(), weeks: [{ id: "w", weekNumber: 1, days: [{ ...v2Day, blocks: [noVersion] }] }] };
    const mob = upgradeProgram(p).weeks[0]!.days[0]!.blocks[0]!;
    expect(mob.type === "mobility" && mob.minAppVersion).toBe(V2_BLOCKS_APP_VERSION);
  });

  it("an exercise's own rule wins over the program's", () => {
    const p = { rule: { kind: "adaptive" as const } };
    expect(ruleFor(p, v2Day.blocks[0]!)).toEqual({ kind: "linear", stepKg: 2.5 });
    expect(ruleFor(p, v1Day.blocks[0]!)).toEqual({ kind: "adaptive" });
    expect(ruleFor({}, v1Day.blocks[0]!)).toEqual({ kind: "fixed" });
  });

  it("compares app versions, and treats the web as new enough", () => {
    expect(appVersionAtLeast("1.0.3", "1.1.0")).toBe(false);
    expect(appVersionAtLeast("1.1.0 (12)", "1.1.0")).toBe(true);
    expect(appVersionAtLeast("1.10.0", "1.9.9")).toBe(true);
    expect(appVersionAtLeast("web", "1.1.0")).toBe(true);
    expect(appVersionAtLeast(undefined, "1.1.0")).toBe(true);
  });

  it("an app runs the blocks it knows at its version; unknown types ask for an update", () => {
    expect(canRunBlock(v2Day.blocks[1]!, "1.0.3")).toBe(false);
    expect(canRunBlock(v2Day.blocks[1]!, "1.1.0")).toBe(true);
    expect(canRunBlock(v2Day.blocks[4]!, "9.9.9")).toBe(false);
    expect(blockLine(v2Day.blocks[4]!)).toBe(UPDATE_LINE);
    expect(blockLine(v2Day.blocks[1]!)).toBe("Circuit · 3 rounds · Kettlebell Swing, Plank");
  });

  it("starting a v2 day: the circuit runs as one circuit, mobility and plugin blocks are there, the rest is left out", () => {
    const session = programDaySession(v2Day, { appVersion: "1.1.0", pluginBlock: (id) => (id === "emom" ? emom : null) });
    const types = session.blocks.map((b) => b.type);
    expect(types).toEqual(["strength", "strength", "mobility", "mobility", "plugin:emom"]);
    const swing = session.blocks[1]!;
    const plank = session.blocks[2]!;
    expect(blockGroup(swing)?.id).toBeDefined();
    expect(blockGroup(swing)?.id).toBe(blockGroup(plank)?.id);
    expect(blockGroup(swing)?.kind).toBe("circuit");
    expect(blockGroup(swing)?.roundRestMs).toBe(90_000);
    expect((swing.data as { sets: unknown[] }).sets).toHaveLength(3); // one set per round
    expect((plank.data as { sets: { targetSec?: number }[] }).sets.map((s) => s.targetSec)).toEqual([40, 40, 40]);
    expect(unrunnableBlocks(v2Day, { appVersion: "1.1.0", pluginBlock: () => emom }).map((b) => b.id)).toEqual(["fut"]);
  });

  it("an older app starts the parts it can, and lists the rest", () => {
    const session = programDaySession(v2Day, { appVersion: "1.0.3" });
    expect(session.blocks.map((b) => b.type)).toEqual(["strength"]);
    expect(unrunnableBlocks(v2Day, { appVersion: "1.0.3" }).map((b) => b.id)).toEqual(["c1", "mo", "pl", "fut"]);
  });

  it("copying a v2 week into a split keeps circuits and mobility, and leaves plugin blocks in the program", () => {
    const p: CoachProgram = { ...upgradeProgram(v1()), weeks: [{ id: "w", weekNumber: 1, days: [v2Day] }] };
    const split = programWeekToSplit(p);
    const day = split.days[0]!;
    expect(day.blocks.map((b) => b.type)).toEqual(["strength", "strength", "mobility", "mobility"]);
    expect(day.groups).toEqual([expect.objectContaining({ kind: "circuit", rounds: 3, roundRestMs: 90_000, memberRestMs: 15_000 })]);
  });
});

describe("lasting swaps (canvas SW1, Q8)", () => {
  it("later days start with the swap, until the coach keeps it or puts it back", async () => {
    const { activeLastingSwaps, applyLastingSwaps } = await import("./swaps");
    const { renameExercise, revertSwap } = await import("./CoachProgram");
    const p: CoachProgram = { ...upgradeProgram(v1()), id: "prog" };
    const session = (atMs: number, lasting: { from: string; to: string; atMs: number }[]) =>
      ({ id: `s${atMs}`, startedAtMs: atMs, blocks: [], source: { kind: "program", parentId: "prog", parentName: "", dayId: "d1", dayName: "", lastingSwaps: lasting } }) as unknown as import("./workout").WorkoutSession;
    const sessions = [session(100, [{ from: "Bench Press", to: "Dumbbell Press", atMs: 100 }])];
    const active = activeLastingSwaps(p, sessions);
    expect(active.map((l) => l.to)).toEqual(["Dumbbell Press"]);
    const day = applyLastingSwaps(p.weeks[0]!.days[0]!, active);
    expect(day.blocks[0]!.type === "strength" && day.blocks[0]!.exerciseName).toBe("Dumbbell Press");
    // Put back after it: gone. Kept (renamed in the program): nothing left to apply.
    expect(activeLastingSwaps(revertSwap(p, "Bench Press", "Dumbbell Press", 200), sessions)).toEqual([]);
    expect(activeLastingSwaps(renameExercise(p, "Bench Press", { exerciseName: "Dumbbell Press" }), sessions)).toEqual([]);
    // A newer swap after a put-back applies again.
    const later = [...sessions, session(300, [{ from: "Bench Press", to: "Machine Press", atMs: 300 }])];
    expect(activeLastingSwaps(revertSwap(p, "Bench Press", "Dumbbell Press", 200), later).map((l) => l.to)).toEqual(["Machine Press"]);
  });
});

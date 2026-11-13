import { describe, expect, it } from "vitest";
import {
  autoSessionName,
  compareBest,
  comparePlan,
  compareSessions,
  historyPRs,
  inferSplitDay,
  nameFromMuscles,
  planSnapshot,
  previousSameWorkout,
  sessionMatches,
  sessionTitle,
  sessionToSplitDay,
  sourceFromSplitDay,
  splitChangesSince,
} from "./sessionHistory";
import { repeatSession } from "./repeatSession";
import type { SessionBlock, SetEntry, WorkoutSession } from "./workout";
import { blockGroup, dropUnloggedPlannedSets } from "./workout";
import type { SplitDay, WorkoutSplit } from "./WorkoutSplit";
import type { MuscleGroup } from "./exercise";

let n = 0;
const id = (p: string) => `${p}${++n}`;

function set(weight: number, reps: number, extra: Partial<SetEntry> = {}): SetEntry {
  return { id: id("set"), setType: "normal", reps, weight, orderIndex: n, completed: reps > 0, ...extra };
}

function strength(name: string, sets: SetEntry[], extra: { superset?: { id: string }; exerciseId?: string } = {}): SessionBlock {
  return {
    id: id("b"),
    type: "strength",
    orderIndex: n,
    data: { exerciseName: name, sets: sets.map((s, i) => ({ ...s, orderIndex: i })), ...extra },
  };
}

function hold(name: string, secs: number[], targetSec?: number): SessionBlock {
  return {
    id: id("b"),
    type: "mobility",
    orderIndex: n,
    data: {
      drillName: name,
      metric: "hold",
      perSide: false,
      sets: secs.map((s, i) => ({ id: id("m"), orderIndex: i, durationSec: s || undefined, completed: s > 0, targetSec: targetSec ?? null })),
    },
  };
}

function session(day: number, blocks: SessionBlock[], extra: Partial<WorkoutSession> = {}): WorkoutSession {
  const start = Date.UTC(2026, 10, day, 7);
  return { id: id("s"), startedAtMs: start, endedAtMs: start + 3_600_000, blocks: blocks.map((b, i) => ({ ...b, orderIndex: i })), ...extra };
}

function day(name: string, exercises: string[], extra: Partial<SplitDay> = {}): SplitDay {
  return {
    id: id("day"),
    orderIndex: n,
    name,
    blocks: exercises.map((e, i) => ({ type: "strength" as const, id: id("pb"), orderIndex: i, exerciseName: e })),
    ...extra,
  };
}

describe("nameFromMuscles", () => {
  it("names the common splits", () => {
    expect(nameFromMuscles({ quads: 6, hamstrings: 3, calves: 3 })).toBe("Legs");
    expect(nameFromMuscles({ biceps: 6, triceps: 6 })).toBe("Arms");
    expect(nameFromMuscles({ chest: 6, shoulders: 3, triceps: 3 })).toBe("Push");
    expect(nameFromMuscles({ back: 9, biceps: 3 })).toBe("Pull");
    expect(nameFromMuscles({ quads: 6, chest: 4, back: 4 })).toBe("Full body");
    expect(nameFromMuscles({ chest: 4, back: 4, shoulders: 2, biceps: 2 })).toBe("Upper body");
    expect(nameFromMuscles({})).toBeNull();
  });
});

describe("sessionTitle", () => {
  const legs = session(2, [strength("Squat", [set(100, 5)]), strength("Leg Curl", [set(50, 10)])]);
  const muscles: Record<string, MuscleGroup[]> = { squat: ["quads", "glutes"], "leg curl": ["hamstrings"] };
  const musclesOf = (_: string | undefined, name: string) => muscles[name.toLowerCase()];

  it("prefers the user's name, then the split day, then a lookalike day, then muscles", () => {
    expect(sessionTitle({ ...legs, name: "Heavy legs" }, { musclesOf })).toBe("Heavy legs");
    expect(
      sessionTitle({ ...legs, source: { kind: "split", parentId: "sp", parentName: "UL", dayId: "d", dayName: "Lower" } }, { musclesOf }),
    ).toBe("Lower");
    expect(sessionTitle(legs, { musclesOf, inferredDayName: "Lower 2" })).toBe("Lower 2");
    expect(sessionTitle(legs, { musclesOf })).toBe("Legs");
  });

  it("falls back to the first exercise, Mobility, or the activity", () => {
    expect(autoSessionName(legs)).toBe("Squat");
    expect(autoSessionName(session(3, [hold("Pigeon", [30])]))).toBe("Mobility");
    expect(autoSessionName(session(3, []))).toBe("Workout");
  });
});

describe("inferSplitDay", () => {
  const upper = day("Upper", ["Bench Press", "Barbell Row", "Overhead Press", "Pull-up"]);
  const lower = day("Lower", ["Squat", "Romanian Deadlift", "Leg Press"]);
  const split: WorkoutSplit = { id: "sp", name: "UL", archived: false, createdAtMs: 0, updatedAtMs: 0, days: [upper, lower] };

  it("finds the day with most of the same exercises", () => {
    const s = session(2, [strength("squat", [set(100, 5)]), strength("Romanian Deadlift", [set(80, 8)]), strength("Leg Press", [set(150, 10)])]);
    expect(inferSplitDay(s, [split])?.dayName).toBe("Lower");
  });

  it("needs a real overlap", () => {
    const s = session(2, [strength("Squat", [set(100, 5)]), strength("Curl", [set(20, 10)]), strength("Dips", [set(0, 10)])]);
    expect(inferSplitDay(s, [split])).toBeNull();
  });
});

describe("compareBest", () => {
  it("heavier or more reps is up, both lower is down", () => {
    expect(compareBest({ weight: 102.5, reps: 5 }, { weight: 100, reps: 5 })).toMatchObject({ kind: "up", weightDelta: 2.5, repsDelta: 0 });
    expect(compareBest({ weight: 100, reps: 7 }, { weight: 100, reps: 5 })).toMatchObject({ kind: "up", weightDelta: 0, repsDelta: 2 });
    expect(compareBest({ weight: 95, reps: 5 }, { weight: 100, reps: 5 })).toMatchObject({ kind: "down" });
    expect(compareBest({ weight: 100, reps: 5 }, { weight: 100, reps: 5 })).toMatchObject({ kind: "same" });
    expect(compareBest({ weight: 100, reps: 5 }, null)).toMatchObject({ kind: "new" });
  });

  it("heavier for far fewer reps is judged by the estimated max", () => {
    expect(compareBest({ weight: 102.5, reps: 2 }, { weight: 100, reps: 10 }).kind).toBe("down");
    expect(compareBest({ weight: 110, reps: 8 }, { weight: 100, reps: 10 }).kind).toBe("up");
  });
});

describe("compareSessions", () => {
  it("compares each exercise with the last time it was done, ignoring warm-ups", () => {
    const a = session(2, [strength("Squat", [set(60, 8, { setType: "warmup" }), set(140, 5), set(140, 5)]), hold("Hamstring", [30, 30])]);
    const b = session(6, [strength("Bench", [set(80, 8)])]);
    const c = session(9, [strength("Squat", [set(60, 8, { setType: "warmup" }), set(142.5, 5), set(142.5, 4)]), strength("Bench", [set(80, 6)]), hold("Hamstring", [35, 30])]);
    const out = compareSessions([c, a, b]);

    const cmp = out.get(c.id)!;
    const [squat, bench, ham] = c.blocks;
    expect(cmp.byBlockId[squat!.id]).toMatchObject({ kind: "up", weightDelta: 2.5, previousSessionId: a.id });
    expect(cmp.byBlockId[squat!.id]!.previousSets).toHaveLength(3);
    expect(cmp.byBlockId[bench!.id]).toMatchObject({ kind: "down", repsDelta: -2, previousSessionId: b.id });
    expect(cmp.byBlockId[ham!.id]).toMatchObject({ kind: "up", secondsDelta: 5 });
    expect(cmp).toMatchObject({ up: 2, down: 1, same: 0, compared: 3 });
    expect(out.get(a.id)!.compared).toBe(0);
  });

  it("leaves out the running workout", () => {
    const running = { ...session(9, [strength("Squat", [set(100, 5)])]), endedAtMs: undefined };
    expect(compareSessions([running]).size).toBe(0);
  });
});

describe("historyPRs", () => {
  it("counts a heavier best set, or more reps at the top weight, but not a first time", () => {
    const a = session(2, [strength("Squat", [set(140, 5)])]);
    const b = session(6, [strength("Squat", [set(142.5, 5)]), strength("Bench", [set(100, 5)])]);
    const c = session(9, [strength("Squat", [set(142.5, 6)])]);
    const d = session(12, [strength("Squat", [set(140, 8)])]);
    const prs = historyPRs([d, c, b, a]);
    expect(prs.get(a.id)).toEqual([]);
    expect(prs.get(b.id)!.map((p) => [p.exerciseName, p.kind])).toEqual([["Squat", "weight"]]);
    expect(prs.get(c.id)!.map((p) => p.kind)).toEqual(["reps"]);
    expect(prs.get(d.id)).toEqual([]);
  });
});

describe("previousSameWorkout", () => {
  it("matches the split day, else the name", () => {
    const src = { kind: "split" as const, parentId: "sp", parentName: "UL", dayId: "d5", dayName: "Lower 2" };
    const a = session(2, [], { source: src });
    const b = session(4, [], { source: { ...src, dayId: "d1", dayName: "Upper" } });
    const c = session(9, [], { source: src });
    const title = (s: WorkoutSession) => s.source?.dayName ?? "x";
    expect(previousSameWorkout(c, [a, b, c], title)?.id).toBe(a.id);
    expect(previousSameWorkout(a, [a, b, c], title)).toBeNull();
  });
});

describe("comparePlan", () => {
  function planned(): WorkoutSession {
    const squat = strength("Squat", [
      set(60, 0, { setType: "warmup", target: { reps: 8, weight: 60 }, completed: false }),
      ...[1, 2, 3].map(() => set(142.5, 0, { target: { reps: 5, weight: 142.5 }, completed: false })),
    ]);
    const calves = strength("Calf Raise", [1, 2, 3, 4].map(() => set(80, 0, { target: { reps: 12, weight: 80 }, completed: false })));
    const rdl = strength("Romanian Deadlift", [1, 2, 3].map(() => set(110, 0, { target: { reps: 8, weight: 110 }, completed: false })));
    const press = strength("Leg Press", [set(180, 0, { target: { reps: 10, weight: 180 }, completed: false })]);
    const stretch = hold("Pigeon", [0, 0], 30);
    return session(13, [squat, calves, rdl, press, stretch]);
  }

  it("says what was done as planned, better, worse, swapped, skipped and added", () => {
    const plan = planned();
    const source = { kind: "split" as const, parentId: "sp", parentName: "UL", dayId: "d", dayName: "Lower 2", plan: planSnapshot(plan) };
    const [squat, calves, rdl, press, stretch] = plan.blocks;
    const log = (b: SessionBlock, sets: SetEntry[]): SessionBlock => ({ ...b, data: { ...(b.data as object), sets } });
    const done: WorkoutSession = dropUnloggedPlannedSets({
      ...plan,
      source,
      blocks: [
        log(squat!, [set(60, 8, { setType: "warmup" }), set(142.5, 5), set(142.5, 5), set(142.5, 5)]),
        log(calves!, [set(75, 12), set(75, 12), set(75, 12)]),
        log(rdl!, [set(110, 8), set(110, 9), set(110, 8)]),
        { ...press!, data: { exerciseName: "Hack Squat", sets: [set(120, 10)] } },
        stretch!,
        strength("Bike", []),
      ],
    });

    const cmp = comparePlan(done)!;
    expect(cmp.rows.map((r) => r.status)).toEqual(["done", "under", "beat", "swapped", "skipped"]);
    expect(cmp.rows[1]).toMatchObject({ setsShort: 1, kgLighter: 5 });
    expect(cmp.rows[2]).toMatchObject({ repsOver: 1 });
    expect(cmp.rows[3]!.doneName).toBe("Hack Squat");
    expect(cmp.added.map((b) => (b.data as { exerciseName: string }).exerciseName)).toEqual(["Bike"]);
    expect(cmp.followed).toBe(2);
  });

  it("is null without a plan", () => {
    expect(comparePlan(planned())).toBeNull();
  });
});

describe("splitChangesSince", () => {
  it("pairs a removed and an added exercise as a swap", () => {
    const plan = planSnapshot(session(1, [strength("Squat", []), strength("Leg Press", []), strength("Calf Raise", [])]));
    const now = day("Lower 2", ["Squat", "Hack Squat", "Calf Raise", "Leg Curl"]);
    expect(splitChangesSince(plan, now)).toEqual({ dayGone: false, swaps: [{ from: "Leg Press", to: "Hack Squat" }], added: ["Leg Curl"], removed: [] });
    expect(splitChangesSince(plan, null).dayGone).toBe(true);
  });
});

describe("sessionMatches", () => {
  it("finds every exercise with the text, not just the top set", () => {
    const s = session(1, [strength("Bench Press", [set(100, 5)]), strength("Front Squat", [set(80, 5)]), strength("Squat", [set(140, 5)])]);
    expect(sessionMatches(s, "squat").map((b) => (b.data as { exerciseName: string }).exerciseName)).toEqual(["Front Squat", "Squat"]);
    expect(sessionMatches(s, " ")).toEqual([]);
  });
});

describe("sourceFromSplitDay", () => {
  it("keeps the day's name and number, rest days not counted", () => {
    const rest: SplitDay = { id: "r", orderIndex: 1, blocks: [], rest: true };
    const d2: SplitDay = { id: "d2", orderIndex: 2, blocks: [] };
    const split: WorkoutSplit = { id: "sp", name: "UL", archived: false, createdAtMs: 0, updatedAtMs: 0, days: [day("Upper", []), rest, d2] };
    split.days[0]!.orderIndex = 0;
    expect(sourceFromSplitDay(split, d2)).toEqual({ kind: "split", parentId: "sp", parentName: "UL", dayId: "d2", dayName: "Day 2", dayNumber: 2 });
  });
});

describe("sessionToSplitDay", () => {
  it("keeps exercises, groups with their rounds, and the usual reps", () => {
    const s = session(1, [
      strength("Squat", [set(60, 8, { setType: "warmup" }), set(140, 5), set(140, 5), set(140, 4)]),
      strength("Leg Curl", [set(55, 12), set(55, 12), set(55, 11)], { superset: { id: "g1" } }),
      strength("Leg Extension", [set(60, 12), set(60, 12)], { superset: { id: "g1" } }),
      hold("Hamstring", [35, 35]),
    ]);
    const d = sessionToSplitDay(s, { id: "day", orderIndex: 4, name: "Lower 2" });
    expect(d.name).toBe("Lower 2");
    expect(d.blocks.map((b) => b.type)).toEqual(["strength", "strength", "strength", "mobility"]);
    expect(d.blocks[0]).toMatchObject({ exerciseName: "Squat", targets: { sets: 3, reps: 5, weight: 140 } });
    expect(d.groups).toHaveLength(1);
    expect(d.groups![0]!.rounds).toBe(3);
    expect(d.blocks[1]!.groupId).toBe(d.groups![0]!.id);
    expect(d.blocks[2]!.groupId).toBe(d.groups![0]!.id);
    expect(d.blocks[3]).toMatchObject({ targets: { sets: 2, holdSec: 35 } });
  });
});

describe("repeatSession", () => {
  it("copies the workout with fresh ids, keeps groups together and the name", () => {
    const s = session(1, [
      strength("Leg Curl", [set(55, 12)], { superset: { id: "g1" } }),
      strength("Leg Extension", [set(60, 12, { rpe: 8 })], { superset: { id: "g1" } }),
    ], { name: "Legs", note: "tired" });
    const r = repeatSession(s, 123);
    expect(r.id).not.toBe(s.id);
    expect(r).toMatchObject({ name: "Legs", startedAtMs: 123 });
    expect(r.note).toBeUndefined();
    const [a, b] = r.blocks;
    expect(blockGroup(a!)?.id).toBeTruthy();
    expect(blockGroup(a!)?.id).toBe(blockGroup(b!)?.id);
    expect(blockGroup(a!)?.id).not.toBe("g1");
    const sets = (b!.data as { sets: SetEntry[] }).sets;
    expect(sets[0]).toMatchObject({ reps: 12, weight: 60 });
    expect(sets[0]!.rpe).toBeUndefined();
    expect(sets[0]!.completed).toBeUndefined();
  });
});

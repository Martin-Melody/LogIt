import { describe, expect, it } from "vitest";
import { applyGroupDraft, circuitToGroup, groupLabel, groupRounds, isOneSided, memberAmount, placeBlock, type CoachProgram, type ProgramBlock } from "./CoachProgram";
import { programDaySession } from "./programDaySession";
import { blockGroup } from "./workout";

let n = 0;
const id = () => `id${++n}`;
const sets = (k: number, reps = 8) => Array.from({ length: k }, (_, i) => ({ id: `s${i}`, orderIndex: i, setType: "normal" as const, reps }));
const prog = (blocks: ProgramBlock[]) => ({ id: "p", name: "P", weeks: [{ id: "w", weekNumber: 1, days: [{ id: "d", orderIndex: 0, blocks }] }] }) as unknown as CoachProgram;
const day = (p: CoachProgram) => p.weeks[0]!.days[0]!;

describe("one kind of group (builder round 2)", () => {
  it("the dialog sets rounds, amounts, members and settings", () => {
    const p0 = prog([
      { type: "strength", id: "sq", orderIndex: 0, exerciseName: "Squat", sets: sets(3) },
      { type: "strength", id: "kb", orderIndex: 1, exerciseName: "Kettlebell swing", sets: sets(2, 12), supersetGroup: "g" },
      { type: "strength", id: "pu", orderIndex: 2, exerciseName: "Push-up", sets: sets(2, 10), supersetGroup: "g" },
    ] as ProgramBlock[]);
    const p = applyGroupDraft(p0, "w", "d", "g", {
      kind: "circuit", name: "Finisher", rounds: 3, memberRestSec: 15, roundRestSec: 90, progression: "add-round",
      members: [{ blockId: "kb", exerciseName: "Kettlebell swing", reps: 15 }, { exerciseName: "Plank", durationSec: 40 }],
    }, id);
    const d = day(p);
    const ordered = [...d.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    expect(ordered.map((b) => [b.id.startsWith("id") ? "new" : b.id, b.supersetGroup ?? null])).toEqual([["sq", null], ["kb", "g"], ["new", "g"], ["pu", null]]);
    expect(groupRounds(d, "g")).toBe(3);
    expect(ordered.slice(1, 3).map(memberAmount)).toEqual(["15 reps", "0:40"]);
    expect(groupLabel(d, "g")).toBe("Finisher");
    // On the phone: a circuit, and a round more from week 3.
    const s3 = programDaySession(d, { weekNumber: 3 });
    const kb = s3.blocks.find((b) => (b.data as { exerciseName?: string }).exerciseName === "Kettlebell swing")!;
    expect(blockGroup(kb)?.kind).toBe("circuit");
    expect((kb.data as { sets: unknown[] }).sets).toHaveLength(4);
  });

  it("an old circuit block becomes a group of its members", () => {
    const p0 = prog([{ type: "circuit", id: "c", orderIndex: 0, rounds: 3, roundRestSec: 90, members: [{ id: "m1", exerciseName: "Couch stretch", durationSec: 40 }, { id: "m2", exerciseName: "Push-up", reps: 10 }] }] as ProgramBlock[]);
    const { program, groupId } = circuitToGroup(p0, "w", "d", "c", id);
    const d = day(program);
    expect(d.blocks.map((b) => b.type)).toEqual(["mobility", "strength"]);
    expect(d.blocks.every((b) => b.supersetGroup === groupId)).toBe(true);
    expect(d.groups?.find((g) => g.id === groupId)).toMatchObject({ kind: "circuit", roundRestSec: 90 });
    expect(groupRounds(d, groupId)).toBe(3);
  });
});

describe("placing blocks in and out of groups", () => {
  const base = () => prog([
    { type: "strength", id: "a", orderIndex: 0, exerciseName: "A", sets: sets(3) },
    { type: "strength", id: "b", orderIndex: 1, exerciseName: "B", sets: sets(3), supersetGroup: "g" },
    { type: "strength", id: "c", orderIndex: 2, exerciseName: "C", sets: sets(3), supersetGroup: "g" },
  ] as ProgramBlock[]);
  const order = (p: CoachProgram) => [...day(p).blocks].sort((x, y) => x.orderIndex - y.orderIndex).map((b) => `${b.id}${b.supersetGroup ? "*" : ""}`);
  it("drags into, within and out of a group", () => {
    expect(order(placeBlock(base(), "w", "d", "a", "c", "g"))).toEqual(["b*", "a*", "c*"]);
    expect(order(placeBlock(base(), "w", "d", "c", "b", "g"))).toEqual(["a", "c*", "b*"]);
    // Out, leaving one: it isn't a group any more.
    expect(order(placeBlock(base(), "w", "d", "c", null, undefined))).toEqual(["a", "b", "c"]);
  });
  it("knows one-sided lifts", () => {
    expect([isOneSided("Bulgarian split squat"), isOneSided("Single-arm dumbbell row"), isOneSided("Bench press")]).toEqual([true, true, false]);
  });
});

describe("rest and warm-ups from the program (PB12, PB17)", () => {
  it("planned rest goes on the set; warm-ups on adds the ramp, off drops typed ones", () => {
    const d = (warmups?: "on" | "off") => ({ id: "d", orderIndex: 0, blocks: [{ type: "strength", id: "x", orderIndex: 0, exerciseName: "Squat", warmups,
      sets: [{ id: "w", orderIndex: 0, setType: "warmup", reps: 5, weight: 40 }, { id: "s", orderIndex: 1, setType: "normal", reps: 5, weight: 100, restSec: 150 }] }] }) as never;
    const sets = (s: ReturnType<typeof programDaySession>) => (s.blocks[0]!.data as { sets: { setType: string; restDurationMs?: number }[] }).sets;
    expect(sets(programDaySession(d())).map((x) => [x.setType, x.restDurationMs ?? null])).toEqual([["warmup", null], ["normal", 150000]]);
    expect(sets(programDaySession(d("off"))).map((x) => x.setType)).toEqual(["normal"]);
    const on = { ...(d() as { blocks: { sets: unknown[] }[] }) };
    on.blocks = [{ ...on.blocks[0]!, warmups: "on", sets: on.blocks[0]!.sets.slice(1) } as never];
    expect(sets(programDaySession(on as never)).filter((x) => x.setType === "warmup").length).toBeGreaterThan(1);
  });
});

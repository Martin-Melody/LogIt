import { describe, expect, it } from "vitest";
import { addDay, addSet, addStrengthBlock, createCoachProgram, duplicateWeek, updateSet, type CoachProgram, type ProgramStrength } from "./CoachProgram";
import { applyTemplate, editTemplate, forBuilder, mergePrograms, setLength, setLighterWeeks, takeTheirs, templateOf } from "./programBuilder";

/** Upper A: Bench 3 × 8 at 60 kg, Row 3 × 10; then three copies of week 1 (old-style, new ids). */
function oldStyle(): CoachProgram {
  let p = createCoachProgram("Hypertrophy A");
  const w = p.weeks[0]!.id;
  p = addDay(p, w, "Upper A");
  const d = p.weeks[0]!.days[0]!.id;
  p = addStrengthBlock(p, w, d, { exerciseName: "Bench Press" });
  const bench = p.weeks[0]!.days[0]!.blocks[0]!.id;
  for (let i = 0; i < 3; i++) p = addSet(p, w, d, bench, { reps: 8, weight: 60 });
  p = addStrengthBlock(p, w, d, { exerciseName: "Row" });
  const row = p.weeks[0]!.days[0]!.blocks[1]!.id;
  for (let i = 0; i < 3; i++) p = addSet(p, w, d, row, { reps: 10 });
  for (let i = 0; i < 3; i++) p = duplicateWeek(p, w);
  return p;
}

const bench = (p: CoachProgram, week: number) => p.weeks.find((x) => x.weekNumber === week)!.days[0]!.blocks[0] as ProgramStrength;

describe("program builder", () => {
  it("an old program whose weeks match becomes one built week with the same ids in every week", () => {
    const p = forBuilder(oldStyle())!;
    expect(p).not.toBeNull();
    const ids = p.weeks.map((w) => w.days[0]!.blocks.map((b) => b.id).join());
    expect(new Set(ids).size).toBe(1);
  });

  it("a later week's own numbers are kept as pinned", () => {
    let old = oldStyle();
    const w2 = old.weeks.find((w) => w.weekNumber === 2)!;
    const b = w2.days[0]!.blocks[0] as ProgramStrength;
    old = updateSet(old, w2.id, w2.days[0]!.id, b.id, b.sets[0]!.id, { weight: 62.5 });
    const p = forBuilder(old)!;
    expect(bench(p, 2).sets[0]).toMatchObject({ weight: 62.5, pinned: true });
    expect(bench(p, 2).sets[1]!.pinned).toBeUndefined();
  });

  it("weeks that differ in shape stay in the week-by-week editor", () => {
    let old = oldStyle();
    const w3 = old.weeks.find((w) => w.weekNumber === 3)!;
    old = addStrengthBlock(old, w3.id, w3.days[0]!.id, { exerciseName: "Curl" });
    expect(forBuilder(old)).toBeNull();
  });

  it("editing the built week changes every week, and pinned numbers stay", () => {
    let old = oldStyle();
    const w2 = old.weeks.find((w) => w.weekNumber === 2)!;
    const b2 = w2.days[0]!.blocks[0] as ProgramStrength;
    old = updateSet(old, w2.id, w2.days[0]!.id, b2.id, b2.sets[0]!.id, { weight: 62.5 });
    let p = forBuilder(old)!;
    // 8 → 6 reps on every Bench set, and a note.
    p = editTemplate(p, (w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.type === "strength" && b.exerciseName === "Bench Press" ? { ...b, note: "Pause", sets: b.sets.map((s) => ({ ...s, reps: 6 })) } : b)) })) }));
    expect(bench(p, 4).sets.map((s) => s.reps)).toEqual([6, 6, 6]);
    expect(bench(p, 4).note).toBe("Pause");
    expect(bench(p, 2).sets[0]).toMatchObject({ weight: 62.5, pinned: true });
    expect(bench(p, 2).sets[1]!.weight).toBe(60);
  });

  it("length adds copies of the built week and drops the last ones; lighter weeks are flags", () => {
    let p = forBuilder(oldStyle())!;
    p = setLength(p, 6);
    expect(p.weeks.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(bench(p, 6).id).toBe(bench(p, 1).id);
    p = setLength(p, 2);
    expect(p.weeks).toHaveLength(2);
    p = setLighterWeeks(setLength(p, 8), [4, 8]);
    expect(p.weeks.filter((w) => w.lighter).map((w) => w.weekNumber)).toEqual([4, 8]);
    // Editing keeps the flags.
    p = applyTemplate(p, templateOf(p));
    expect(p.weeks.filter((w) => w.lighter).map((w) => w.weekNumber)).toEqual([4, 8]);
  });

  describe("two devices", () => {
    const base = () => forBuilder(oldStyle())!;
    const editBench = (p: CoachProgram, reps: number) =>
      editTemplate(p, (w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.type === "strength" && b.exerciseName === "Bench Press" ? { ...b, sets: b.sets.map((s) => ({ ...s, reps })) } : b)) })) }));

    it("changes to different things come across by themselves", () => {
      const b = base();
      const mine = editTemplate(b, (w) => ({ ...w, days: w.days.map((d) => ({ ...d, name: "Push" })) }));
      const theirs = editBench(b, 5);
      const r = mergePrograms(b, mine, theirs);
      expect(r.conflicts).toEqual([]);
      expect(templateOf(r.program).days[0]!.name).toBe("Push");
      expect(bench(r.program, 3).sets.map((s) => s.reps)).toEqual([5, 5, 5]);
      expect(r.taken).toContain("Bench Press on Push"); // the day as it is now called
    });

    it("something added there is added here, in its place", () => {
      const b = base();
      const theirs = editTemplate(b, (w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: [...d.blocks, { type: "strength", id: "curl", orderIndex: 9, exerciseName: "Leg Curl", sets: [] }] })) }));
      const r = mergePrograms(b, b, theirs);
      expect(templateOf(r.program).days[0]!.blocks.map((x) => x.type === "strength" && x.exerciseName)).toEqual(["Bench Press", "Row", "Leg Curl"]);
    });

    it("the same exercise changed on both is a choice; picking theirs takes theirs", () => {
      const b = base();
      const r = mergePrograms(b, editBench(b, 6), editBench(b, 5));
      expect(r.conflicts).toHaveLength(1);
      expect(r.conflicts[0]).toMatchObject({ label: "Bench Press on Upper A", mine: "Bench Press 3 × 6", theirs: "Bench Press 3 × 5" });
      expect(bench(r.program, 1).sets[0]!.reps).toBe(6); // mine until chosen
      const picked = takeTheirs(r.program, editBench(b, 5), r.conflicts[0]!.key);
      expect(bench(picked, 2).sets[0]!.reps).toBe(5);
    });
  });
});

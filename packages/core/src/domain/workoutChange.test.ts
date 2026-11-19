import { describe, expect, it } from "vitest";
import { createSession, type SetEntry, type WorkoutSession } from "./workout";
import { describeWorkoutChange } from "./workoutChange";

const set = (id: string, x: Partial<SetEntry> = {}): SetEntry => ({ id, setType: "normal", orderIndex: Number(id.slice(1)), reps: 0, weight: 20, ...x }) as SetEntry;
function workout(blocks: { id: string; name: string; sets: SetEntry[] }[]): WorkoutSession {
  return {
    ...createSession(0),
    blocks: blocks.map((b, i) => ({ id: b.id, type: "strength", orderIndex: i, data: { exerciseName: b.name, sets: b.sets } })),
  } as WorkoutSession;
}
const base = () => workout([
  { id: "a", name: "Bench Press", sets: [set("s0", { setType: "warmup" }), set("s1"), set("s2"), set("s3")] },
  { id: "b", name: "Lateral Raise", sets: [set("s1")] },
]);
const withSets = (w: WorkoutSession, sets: SetEntry[]) =>
  ({ ...w, blocks: w.blocks.map((b, i) => (i === 0 ? { ...b, data: { ...(b.data as object), sets } } : b)) }) as WorkoutSession;
const sets0 = (w: WorkoutSession) => (w.blocks[0]!.data as { sets: SetEntry[] }).sets;

describe("naming a workout change for undo", () => {
  it("removing a set names it as the row does (warm-ups aside) and asks for a toast", () => {
    const w = base();
    expect(describeWorkoutChange(w, withSets(w, sets0(w).filter((x) => x.id !== "s3")))).toEqual({
      label: "Remove set 3", toast: { done: "Set 3 removed.", undone: "Set 3 is back." },
    });
  });

  it("ticks and typed numbers have no toast; a tick that re-planned other sets is still a tick", () => {
    const w = base();
    const s = sets0(w);
    const ticked = withSets(w, s.map((x) => (x.id === "s1" ? { ...x, reps: 8, completed: true } : x.id === "s2" ? { ...x, weight: 17.5 } : x)));
    expect(describeWorkoutChange(w, ticked)).toEqual({ label: "Tick set 1" });
    expect(describeWorkoutChange(w, withSets(w, s.map((x) => (x.id === "s2" ? { ...x, weight: 25 } : x))))).toEqual({ label: "Change set 2" });
    expect(describeWorkoutChange(w, withSets(w, s.map((x) => (x.id !== "s0" ? { ...x, weight: 15 } : x))))).toEqual({ label: "Change the plan for Bench Press" });
  });

  it("exercises removed, swapped, added and reordered", () => {
    const w = base();
    expect(describeWorkoutChange(w, { ...w, blocks: [w.blocks[0]!] })).toMatchObject({ label: "Remove Lateral Raise", toast: { undone: "Lateral Raise is back." } });
    const swapped = { ...w, blocks: [w.blocks[0]!, { ...w.blocks[1]!, data: { exerciseName: "Dips", sets: [] } }] } as WorkoutSession;
    expect(describeWorkoutChange(w, swapped)).toMatchObject({ label: "Swap Lateral Raise for Dips", toast: { done: "Swapped to Dips." } });
    const more = { ...w, blocks: [...w.blocks, { id: "c", type: "strength", orderIndex: 2, data: { exerciseName: "Curl", sets: [] } }] } as WorkoutSession;
    expect(describeWorkoutChange(w, more)).toEqual({ label: "Add Curl" });
    const moved = { ...w, blocks: [{ ...w.blocks[0]!, orderIndex: 1 }, { ...w.blocks[1]!, orderIndex: 0 }] } as WorkoutSession;
    expect(describeWorkoutChange(w, moved)).toMatchObject({ label: "Reorder exercises", toast: { undone: "Order put back." } });
  });
});

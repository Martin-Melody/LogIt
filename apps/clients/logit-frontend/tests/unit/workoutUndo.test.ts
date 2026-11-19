// Workout undo/redo (currentSession.store): every mutate is a step unless it's `auto`,
// undo goes back to before the step, redo forward again, and a new change clears redo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { WorkoutSession } from "@logit/core/domain/workout";

const saveDraftSession = vi.fn(async () => {});
vi.mock("$lib/data/repoProvider", () => ({ getWorkoutRepo: () => ({ saveDraftSession }) }));
let draft: WorkoutSession | null = null;
vi.mock("$lib/usecases/loadDraftSession", () => ({ loadDraftSession: async () => draft }));
vi.mock("$lib/usecases/startSession", () => ({ startSession: vi.fn() }));
vi.mock("$lib/usecases/finishCurrentSession", () => ({ finishCurrentSession: vi.fn() }));
vi.mock("$lib/usecases/startSessionFromSplitDay", () => ({ startSessionFromSplitDay: vi.fn(), startPlannedSession: vi.fn() }));
vi.mock("$lib/usecases/startSessionFromProgramDay", () => ({ startSessionFromProgramDay: vi.fn() }));
vi.mock("$lib/usecases/repeatLastSession", () => ({ repeatLastSession: vi.fn(), repeatPastSession: vi.fn() }));

const { currentSession } = await import("$lib/stores/currentSession.store");

const set = (id: string, x: object = {}) => ({ id, setType: "normal", orderIndex: Number(id.slice(1)), reps: 0, weight: 20, ...x });
const sets = () => ((get(currentSession)!.blocks[0]!.data as { sets: { id: string; completed?: boolean }[] }).sets);
const withSets = (s: WorkoutSession, f: (xs: ReturnType<typeof sets>) => ReturnType<typeof sets>) =>
  ({ ...s, blocks: [{ ...s.blocks[0]!, data: { ...(s.blocks[0]!.data as object), sets: f((s.blocks[0]!.data as { sets: ReturnType<typeof sets> }).sets) } }] }) as WorkoutSession;

beforeEach(async () => {
  draft = {
    id: "w", startedAtMs: 0,
    blocks: [{ id: "b", type: "strength", orderIndex: 0, data: { exerciseName: "Lateral Raise", sets: [set("s1"), set("s2"), set("s3"), set("s4")] } }],
  } as WorkoutSession;
  await currentSession.loadDraft();
});

describe("workout undo / redo", () => {
  it("undo puts a removed set back, redo removes it again, and both name the step", async () => {
    await currentSession.mutate((s) => withSets(s, (xs) => xs.filter((x) => x.id !== "s4")));
    expect(get(currentSession.history).undo).toMatchObject({ label: "Remove set 4", toast: { undone: "Set 4 is back." } });
    expect(await currentSession.undo()).toMatchObject({ label: "Remove set 4" });
    expect(sets().map((x) => x.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(get(currentSession.history)).toMatchObject({ undo: null, redo: { label: "Remove set 4" } });
    await currentSession.redo();
    expect(sets().map((x) => x.id)).toEqual(["s1", "s2", "s3"]);
    expect(saveDraftSession).toHaveBeenLastCalledWith(get(currentSession));
  });

  it("the app's own changes are never steps, and a new change clears redo", async () => {
    await currentSession.mutate((s) => withSets(s, (xs) => xs.map((x) => (x.id === "s1" ? { ...x, reps: 8, completed: true } : x))));
    await currentSession.mutate((s) => ({ ...s, notes: "auto" }), { auto: true });
    expect(get(currentSession.history).undo?.label).toBe("Tick set 1");
    await currentSession.undo();
    expect(sets()[0]!.completed).toBeFalsy();
    await currentSession.mutate((s) => withSets(s, (xs) => xs.map((x) => (x.id === "s2" ? { ...x, weight: 25 } : x))));
    expect(get(currentSession.history)).toMatchObject({ undo: { label: "Change set 2" }, redo: null });
  });

  it("a newly loaded workout starts with no history", async () => {
    await currentSession.mutate((s) => withSets(s, (xs) => xs.slice(1)));
    await currentSession.loadDraft();
    expect(get(currentSession.history)).toMatchObject({ undo: null, redo: null });
    expect(await currentSession.undo()).toBeNull();
  });
});

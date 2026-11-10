import { describe, expect, it } from "vitest";
import { getSuggestion, refreshProgressionState } from "./getSuggestion";
import { linearProgression } from "../../progression/algorithms/linearProgression";
import type { ExerciseProgressionState } from "../../domain/progression";
import type { SetEntry, WorkoutSession } from "../../domain/workout";
import type { ProgressionDeps } from "./deps";

// End-to-end over the real linear algorithm with in-memory repos: what the session
// screen shows across finish → next visit → edit, which is where the same session
// used to get applied again and again.

let clock = 1_000_000;
function tick() {
  clock += 86_400_000;
  return clock;
}

function sets(weight: number, reps: number[], extra: Partial<SetEntry> = {}): SetEntry[] {
  return reps.map((r, i) => ({ id: `set-${i}-${Math.random()}`, setType: "normal", reps: r, weight, orderIndex: i, completed: r > 0, ...extra }));
}

function session(id: string, setList: SetEntry[], finished = true): WorkoutSession {
  const startedAtMs = tick();
  return {
    id,
    startedAtMs,
    endedAtMs: finished ? startedAtMs + 3_600_000 : undefined,
    blocks: [{ id: `b-${id}`, type: "strength", orderIndex: 0, data: { exerciseName: "Bench", exerciseId: "bench", sets: setList } }],
  };
}

function makeDeps() {
  const sessions: WorkoutSession[] = [];
  let saved: ExerciseProgressionState | null = null;
  const deps = {
    workoutRepo: { listRecentSessions: async () => sessions, listAllSessions: async () => sessions },
    exerciseRepo: { getById: async () => null, getByName: async () => null },
    progressionRepo: {
      getConfig: async () => ({ algorithmId: "linear-progression" }),
      getExerciseState: async () => saved,
      saveExerciseState: async (s: ExerciseProgressionState) => {
        saved = { ...s, updatedAtMs: clock + 3_700_000 };
      },
      getAlgorithmPreferences: async () => null,
      listExerciseStates: async () => (saved ? [saved] : []),
    },
    algorithmRegistry: { get: async () => linearProgression },
  } as unknown as ProgressionDeps;
  return { deps, sessions };
}

const bench = { id: "bench", name: "Bench" };

describe("session plan across finish, revisit and edit", () => {
  it("shows the stepped weight once, and editing the session doesn't step it again", async () => {
    const { deps, sessions } = makeDeps();
    sessions.unshift(session("s1", sets(60, [8, 8, 8])));
    await refreshProgressionState(bench, deps); // finish s1

    const preview = await getSuggestion(bench, deps);
    expect(preview?.sets.map((s) => [s.reps, s.weight])).toEqual([[5, 62.5], [5, 62.5], [5, 62.5]]);
    expect(preview?.change?.kind).toBe("increase");

    // Editing s1 (e.g. fixing a typo) refreshes again — must not add another 2.5kg.
    await refreshProgressionState(bench, deps);
    const afterEdit = await getSuggestion(bench, deps);
    expect(afterEdit?.sets[0]!.weight).toBe(62.5);
  });

  it("ignores the in-progress draft and planned-but-unlogged sets", async () => {
    const { deps, sessions } = makeDeps();
    sessions.unshift(session("s1", sets(62.5, [6, 5, 5])));
    await refreshProgressionState(bench, deps);

    // Today's draft (stored alongside finished sessions on the phone) with one set done.
    const draft = session("draft", [...sets(62.5, [7]), ...sets(62.5, [0, 0], { completed: false })], false);
    sessions.unshift(draft);

    const preview = await getSuggestion(bench, deps, undefined, draft);
    expect(preview?.sets.map((s) => s.reps)).toEqual([7, 6, 6]);
    expect(preview?.sets[0]!.weight).toBe(62.5);
  });
});

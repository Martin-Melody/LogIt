import { describe, expect, it } from "vitest";
import { dismissProgressionNudge } from "./dismissProgressionNudge";
import type { ExerciseProgressionState } from "../../domain/progression";
import type { ProgressionDeps } from "./deps";

function deps(existing: ExerciseProgressionState | null) {
  const saved: { state: ExerciseProgressionState | null } = { state: existing };
  return {
    progressionRepo: {
      getExerciseState: async () => saved.state,
      getConfig: async () => ({ algorithmId: "linear-progression" }),
      saveExerciseState: async (s: ExerciseProgressionState) => {
        saved.state = s;
      },
    },
    _saved: saved,
  } as unknown as Pick<ProgressionDeps, "progressionRepo"> & { _saved: { state: ExerciseProgressionState | null } };
}

describe("dismissProgressionNudge", () => {
  it("creates a new state row with the dismissal when none existed", async () => {
    const d = deps(null);
    await dismissProgressionNudge({ name: "Bench" }, "linear-progression:order-variety", d);
    expect(d._saved.state?.dismissedNudges).toEqual(["linear-progression:order-variety"]);
    expect(d._saved.state?.algorithmId).toBe("linear-progression");
    expect(d._saved.state?.state).toBeNull();
  });

  it("adds to existing dismissals without touching the algorithm's own state", async () => {
    const d = deps({
      key: "bench",
      exerciseName: "Bench",
      algorithmId: "linear-progression",
      state: { workingWeight: 100 },
      updatedAtMs: 0,
      dismissedNudges: ["some-other-nudge"],
    });
    await dismissProgressionNudge({ name: "Bench" }, "linear-progression:order-variety", d);
    expect(d._saved.state?.dismissedNudges?.sort()).toEqual([
      "linear-progression:order-variety",
      "some-other-nudge",
    ]);
    expect(d._saved.state?.state).toEqual({ workingWeight: 100 });
  });

  it("doesn't duplicate an already-dismissed nudge", async () => {
    const d = deps({
      key: "bench",
      exerciseName: "Bench",
      algorithmId: "linear-progression",
      state: null,
      updatedAtMs: 0,
      dismissedNudges: ["linear-progression:order-variety"],
    });
    await dismissProgressionNudge({ name: "Bench" }, "linear-progression:order-variety", d);
    expect(d._saved.state?.dismissedNudges).toEqual(["linear-progression:order-variety"]);
  });
});

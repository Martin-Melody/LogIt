import { describe, it, expect, vi } from "vitest";
import {
  createSession,
  addMobilityBlock,
  updateMobilitySet,
  setMobilityRestBetweenSets,
  type MobilityBlockData,
  type SessionBlock,
} from "@logit/core/domain/workout";

let savedDraft: unknown = null;
let recent: ReturnType<typeof createSession> | null = null;

vi.mock("$lib/data/repoProvider", () => ({
  getWorkoutRepo: () => ({
    listRecentSessions: async () => (recent ? [recent] : []),
    saveDraftSession: async (s: unknown) => {
      savedDraft = s;
    },
  }),
}));

describe("repeatLastSession — mobility block", () => {
  it("carries the drill's rest-between-sets and lead-side setup forward, but clears the log", async () => {
    const { repeatLastSession } = await import("$lib/usecases/repeatLastSession");

    let s = addMobilityBlock(createSession(), {
      drillName: "Couch stretch",
      drillId: "core:couch-stretch",
      perSide: true,
      metric: "hold",
      leadSide: "right",
    });
    const blockId = s.blocks[0]!.id;
    s = setMobilityRestBetweenSets(s, blockId, 45_000);
    for (const set of (s.blocks[0]!.data as MobilityBlockData).sets) {
      s = updateMobilitySet(s, blockId, set.id, {
        durationSec: 40,
        targetSec: 45,
        depth: 4,
        completed: true,
      });
    }
    recent = s;

    const draft = await repeatLastSession();
    expect(draft).not.toBeNull();
    const block = draft!.blocks.find((b) => b.type === "mobility") as SessionBlock<MobilityBlockData>;

    // Drill-level setup carries over.
    expect(block.data.restBetweenSetsMs).toBe(45_000);
    expect(block.data.leadSide).toBe("right");

    // Per-set log resets — only the target survives.
    for (const set of block.data.sets) {
      expect(set.durationSec).toBeUndefined();
      expect(set.completed).toBeFalsy();
      expect(set.depth ?? null).toBeNull();
      expect(set.targetSec).toBe(45);
    }

    expect(savedDraft).toBe(draft);
  });
});

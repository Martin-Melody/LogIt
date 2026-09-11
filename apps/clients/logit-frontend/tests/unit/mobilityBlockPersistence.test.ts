// A session containing a Mobility block must survive a full round trip through the
// real SQLite schema (createSchemaAndSeed) + the real sqlite workout repo — the
// block payload lives in the JSON `session_blocks.data` column, so this proves
// parseBlockData()'s "mobility" branch rehydrates every field.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSession,
  addMobilityBlock,
  addMobilitySet,
  updateMobilitySet,
  finishSession,
  type MobilityBlockData,
  type SessionBlock,
} from "@logit/core/domain/workout";
import { createNodeSqliteDb } from "./support/nodeSqliteDb";

vi.mock("$lib/data/db/sqlite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/data/db/sqlite")>();
  return { ...actual, getDb: () => currentDb };
});

let currentDb: ReturnType<typeof createNodeSqliteDb>;

beforeEach(async () => {
  const { createSchemaAndSeed } = await import("$lib/data/db/sqlite");
  currentDb = createNodeSqliteDb();
  await createSchemaAndSeed(currentDb);
});

describe("mobility block SQLite round trip", () => {
  it("saves and rehydrates every field", async () => {
    const { createSqliteWorkoutRepo } = await import("$lib/data/workouts/workoutRepo.sqlite");
    const { setActiveOwnerId } = await import("$lib/data/activeOwner");
    const { createLocalAccount } = await import("$lib/data/localAccountRepo");
    const account = await createLocalAccount({ username: "u" });
    setActiveOwnerId(account.id);

    const repo = createSqliteWorkoutRepo();

    let s = createSession(1_000);
    s = addMobilityBlock(s, {
      drillName: "Couch stretch",
      drillId: "core:couch-stretch",
      perSide: true,
      metric: "hold",
      leadSide: "right",
    });
    const blockId = s.blocks[0]!.id;
    s = addMobilitySet(s, blockId); // second pair
    for (const set of (s.blocks[0]!.data as MobilityBlockData).sets) {
      s = updateMobilitySet(s, blockId, set.id, {
        durationSec: 40,
        targetSec: 45,
        depth: 4,
        loadKg: 2.5,
        completed: true,
        restDurationMs: 45_000,
      });
    }
    s = finishSession(s, 2_000);
    await repo.saveSession(s);

    const loaded = await repo.getSession(s.id);
    expect(loaded).not.toBeNull();
    const block = loaded!.blocks.find((b) => b.type === "mobility") as SessionBlock<MobilityBlockData>;
    expect(block.data.drillName).toBe("Couch stretch");
    expect(block.data.drillId).toBe("core:couch-stretch");
    expect(block.data.metric).toBe("hold");
    expect(block.data.perSide).toBe(true);
    expect(block.data.leadSide).toBe("right");
    expect(block.data.sets).toHaveLength(4);
    expect(block.data.sets.map((x) => x.side)).toEqual(["left", "right", "left", "right"]);
    expect(block.data.sets[0]!.durationSec).toBe(40);
    expect(block.data.sets[0]!.targetSec).toBe(45);
    expect(block.data.sets[0]!.depth).toBe(4);
    expect(block.data.sets[0]!.loadKg).toBe(2.5);
    expect(block.data.sets[0]!.completed).toBe(true);
    expect(block.data.sets[0]!.restDurationMs).toBe(45_000);
  });
});

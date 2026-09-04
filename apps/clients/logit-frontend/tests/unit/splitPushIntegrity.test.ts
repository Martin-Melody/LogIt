// Regression test for a real, confirmed-live bug: pushAllSplits() (syncService.ts) used to
// build its server-push payload from getListSplits() — a lightweight index for list screens
// that hardcodes every day's blocks to `[]` rather than querying planned_blocks (see
// splitRepo.sqlite.ts's own comment on it). Since pushAllLocalData() runs pushAllSplits() on
// every single login, this silently wiped every split's exercises server-side, every time —
// confirmed by pulling a real device's on-device DB mid-session and watching a split's day
// block counts go from 4/3 to 0/0 after nothing but a routine re-login.
//
// syncService.ts itself isn't imported here (it pulls in the full repoProvider/network-client
// import graph — see ownerIdIsolation.test.ts's header for why this tier avoids that). Instead
// this exercises the exact fix: list for ids, then getSplit(id) per split for the real data —
// the same pattern exportData.ts already used correctly and pushAllSplits() now matches.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
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

function makeSplitWithBlocks(id: string): WorkoutSplit {
  const now = Date.now();
  return {
    id,
    name: "Push/Pull/Legs",
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    days: [
      {
        id: `${id}-day1`,
        orderIndex: 0,
        name: "Push",
        blocks: [
          { type: "strength", id: `${id}-b1`, orderIndex: 0, exerciseName: "Bench Press" },
          { type: "strength", id: `${id}-b2`, orderIndex: 1, exerciseName: "Overhead Press" },
        ],
      },
    ],
  };
}

describe("split push payload includes real blocks, not the list-screen stub", () => {
  it("getListSplits() stubs blocks to [] — that's intentional, not itself the bug", async () => {
    const { createSqliteSplitRepo } = await import("$lib/data/splts/splitRepo.sqlite");
    const { setActiveOwnerId } = await import("$lib/data/activeOwner");
    const { createLocalAccount } = await import("$lib/data/localAccountRepo");
    const account = await createLocalAccount({ username: "u" });
    setActiveOwnerId(account.id);

    const repo = createSqliteSplitRepo();
    await repo.saveSplit(makeSplitWithBlocks("split-1"));

    const [stub] = await repo.getListSplits({});
    expect(stub.days[0]!.blocks).toEqual([]);
  });

  it("the fixed push path (list ids, then getSplit() per id) preserves every block", async () => {
    const { createSqliteSplitRepo } = await import("$lib/data/splts/splitRepo.sqlite");
    const { setActiveOwnerId } = await import("$lib/data/activeOwner");
    const { createLocalAccount } = await import("$lib/data/localAccountRepo");
    const account = await createLocalAccount({ username: "u" });
    setActiveOwnerId(account.id);

    const repo = createSqliteSplitRepo();
    await repo.saveSplit(makeSplitWithBlocks("split-1"));

    // Mirrors pushAllSplits()'s fixed body exactly.
    const stubs = await repo.getListSplits({ limit: 500, includeArchived: true });
    const full = await Promise.all(stubs.map((s) => repo.getSplit(s.id)));
    const pushed = full
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => JSON.parse(JSON.stringify(s)) as WorkoutSplit);

    expect(pushed).toHaveLength(1);
    expect(pushed[0]!.days[0]!.blocks).toHaveLength(2);
    expect(pushed[0]!.days[0]!.blocks.map((b) => b.type === "strength" && b.exerciseName)).toEqual([
      "Bench Press",
      "Overhead Press",
    ]);
  });
});

// Split days can hold mobility drills and supersets / circuits (2026-11). The phone keeps
// splits in SQLite tables, not JSON, so the drill fields and groups need their own columns:
// these check they survive a save and load, and that an old database gets the columns.
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
  const { setActiveOwnerId } = await import("$lib/data/activeOwner");
  const { createLocalAccount } = await import("$lib/data/localAccountRepo");
  setActiveOwnerId((await createLocalAccount({ username: "u" })).id);
});

function splitWithGroups(): WorkoutSplit {
  const now = Date.now();
  return {
    id: "split-g",
    name: "Mobility",
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    days: [
      {
        id: "day-g",
        orderIndex: 0,
        name: "Hips",
        blocks: [
          { type: "strength", id: "b1", orderIndex: 0, exerciseName: "Squat", targets: { reps: 5, weight: 100 }, groupId: "g1" },
          { type: "mobility", id: "b2", orderIndex: 1, drillName: "Couch stretch", drillId: "couch-stretch", metric: "hold", perSide: true, targets: { holdSec: 45 }, groupId: "g1" },
          { type: "cardio", id: "b3", orderIndex: 2, activityName: "Bike" },
          { type: "mobility", id: "b4", orderIndex: 3, drillName: "Cat cow", metric: "reps", perSide: false, targets: { sets: 2, reps: 12 } },
        ],
        groups: [{ id: "g1", label: "Hip opener", kind: "circuit", rounds: 3, roundRestMs: 60_000, memberRestMs: 10_000 }],
      },
    ],
  };
}

describe("split days with drills and groups in SQLite", () => {
  it("saves and loads drills, group ids and the day's groups", async () => {
    const { createSqliteSplitRepo } = await import("$lib/data/splts/splitRepo.sqlite");
    const repo = createSqliteSplitRepo();
    const split = splitWithGroups();
    await repo.saveSplit(split);
    const loaded = await repo.getSplit(split.id);
    expect(loaded!.days[0]).toEqual(split.days[0]);
  });

  it("a day with no groups loads without a groups field", async () => {
    const { createSqliteSplitRepo } = await import("$lib/data/splts/splitRepo.sqlite");
    const repo = createSqliteSplitRepo();
    const split = splitWithGroups();
    split.days[0]!.groups = undefined;
    split.days[0]!.blocks = split.days[0]!.blocks.map(({ groupId: _g, ...b }) => b) as typeof split.days[0]["blocks"];
    await repo.saveSplit(split);
    const loaded = await repo.getSplit(split.id);
    expect(loaded!.days[0]).not.toHaveProperty("groups");
    expect(loaded!.days[0]!.blocks.every((b) => !("groupId" in b))).toBe(true);
  });

  it("adds the columns to a database made before them", async () => {
    currentDb = createNodeSqliteDb();
    await currentDb.execute(`
      CREATE TABLE split_days (id TEXT PRIMARY KEY NOT NULL, split_id TEXT NOT NULL, order_index INTEGER NOT NULL, name TEXT NULL);
      CREATE TABLE planned_blocks (
        id TEXT PRIMARY KEY NOT NULL, day_id TEXT NOT NULL, block_type TEXT NOT NULL DEFAULT 'strength',
        order_index INTEGER NOT NULL, exercise_name TEXT NULL, exercise_id TEXT NULL,
        target_sets INTEGER NULL, target_reps INTEGER NULL, target_weight REAL NULL, activity_name TEXT NULL
      );
    `);
    const { createSchemaAndSeed } = await import("$lib/data/db/sqlite");
    await createSchemaAndSeed(currentDb);
    const cols = async (table: string) =>
      ((await currentDb.query(`PRAGMA table_info(${table})`, [])).values ?? []).map((r: any) => r.name);
    expect(await cols("split_days")).toContain("groups_json");
    expect(await cols("planned_blocks")).toContain("extra_json");
  });
});

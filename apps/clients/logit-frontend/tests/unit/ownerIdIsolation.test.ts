// Integration tests for local multi-profile data isolation — see
// docs/architecture/account-model.md §3 (rows 1 & 2) and docs/bugs/account-switching.md #2.
//
// These run the *real* schema (createSchemaAndSeed) and the *real* sqlite repos against a
// node:sqlite in-memory database (tests/unit/support/nodeSqliteDb.ts), not a reimplementation
// of their SQL — so a regression in the actual owner_id logic shows up here, not just a
// regression in a test double.
//
// Deliberately does NOT go through authStore.svelte.ts's createOfflineAccount()/
// ensureLocalAccount() — that pulls in the full repoProvider/appInit import graph (nutrition,
// habits, plugins, network client, Svelte stores), which needs a browser-like environment this
// suite doesn't set up. Instead each test reproduces the exact sequence of calls those
// functions make (createLocalAccount → setActiveOwnerId → claimOrphanedData, or not), which is
// what actually exercises the bug. If you fix bug #2 by extracting a shared
// `shouldClaimOrphanedData()` guard (the account-model doc's recommended fix), add a focused
// unit test for that guard directly — it's a much cheaper regression test than this file once
// it exists, since it needs no SQLite at all.
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

function makeSplit(id: string, name: string): WorkoutSplit {
  const now = Date.now();
  return { id, name, archived: false, createdAtMs: now, updatedAtMs: now, days: [] };
}

describe("owner_id data isolation across local profiles", () => {
  it("row 1: true first launch claims pre-existing (owner_id IS NULL) data for the first profile", async () => {
    const { createLocalAccount, claimOrphanedData } = await import("$lib/data/localAccountRepo");
    const { setActiveOwnerId } = await import("$lib/data/activeOwner");
    const { createSqliteSplitRepo } = await import("$lib/data/splts/splitRepo.sqlite");

    // Simulate legacy pre-multi-profile data: a split inserted with no owner at all.
    await currentDb.run(
      `INSERT INTO splits(id, name, archived, created_at_ms, updated_at_ms, owner_id) VALUES(?,?,?,?,?,NULL)`,
      ["legacy-split", "Legacy PPL", 0, 1, 1],
    );

    const first = await createLocalAccount({ username: "first" });
    setActiveOwnerId(first.id);
    await claimOrphanedData(first.id);

    const repo = createSqliteSplitRepo();
    const splits = await repo.getListSplits({});
    expect(splits.map((s) => s.id)).toContain("legacy-split");
  });

  // Currently RED — this is the actual bug from docs/bugs/account-switching.md #2. It should
  // go green once createOfflineAccount() (authStore.svelte.ts ~line 132-158) is fixed to only
  // call claimOrphanedData() when listLocalAccounts() was empty *before* the new profile was
  // created, the same guard ensureLocalAccount() already uses (repoProvider.ts ~line 112-121).
  // Left failing on purpose rather than skipped, so `npm run test:unit` visibly tracks whether
  // this specific bug is still open.
  it("row 2: a second profile must NOT steal the first profile's still-unclaimed data", async () => {
    const { createLocalAccount, claimOrphanedData } = await import("$lib/data/localAccountRepo");
    const { setActiveOwnerId } = await import("$lib/data/activeOwner");
    const { createSqliteSplitRepo } = await import("$lib/data/splts/splitRepo.sqlite");
    const repo = createSqliteSplitRepo();

    // Profile A is created and becomes active, but — as can genuinely happen (app killed
    // mid-write, or any future write path that doesn't stamp owner_id before A explicitly
    // claims it) — its data is still sitting at owner_id IS NULL when profile B is added.
    const profileA = await createLocalAccount({ username: "pro_account" });
    setActiveOwnerId(profileA.id);
    await currentDb.run(
      `INSERT INTO splits(id, name, archived, created_at_ms, updated_at_ms, owner_id) VALUES(?,?,?,?,?,NULL)`,
      ["pro-split", "Pro PPL", 0, 1, 1],
    );

    // This mirrors authStore.createOfflineAccount()'s current body exactly (authStore.svelte.ts
    // ~line 132-158): create → setActiveOwnerId → claimOrphanedData, with NO guard for
    // "is this actually the first profile on the device." Once that call site is fixed to skip
    // the claim here, this line becomes a no-op and the assertions below start passing.
    const profileB = await createLocalAccount({ username: "free_account" });
    setActiveOwnerId(profileB.id);
    await claimOrphanedData(profileB.id);

    const bSplits = await repo.getListSplits({});
    expect(bSplits.map((s) => s.id)).not.toContain("pro-split"); // B must not see A's data

    setActiveOwnerId(profileA.id);
    const aSplits = await repo.getListSplits({});
    expect(aSplits.map((s) => s.id)).toContain("pro-split"); // A must keep its own data
  });

  it("sanity: two profiles that each explicitly own their data never see each other's splits", async () => {
    const { createLocalAccount } = await import("$lib/data/localAccountRepo");
    const { setActiveOwnerId } = await import("$lib/data/activeOwner");
    const { createSqliteSplitRepo } = await import("$lib/data/splts/splitRepo.sqlite");
    const repo = createSqliteSplitRepo();

    const profileA = await createLocalAccount({ username: "a" });
    const profileB = await createLocalAccount({ username: "b" });

    setActiveOwnerId(profileA.id);
    await repo.saveSplit(makeSplit("split-a", "A's split"));

    setActiveOwnerId(profileB.id);
    await repo.saveSplit(makeSplit("split-b", "B's split"));

    const bSplits = await repo.getListSplits({});
    expect(bSplits.map((s) => s.id)).toEqual(["split-b"]);

    setActiveOwnerId(profileA.id);
    const aSplits = await repo.getListSplits({});
    expect(aSplits.map((s) => s.id)).toEqual(["split-a"]);
  });
});

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
// functions make (createLocalAccount → setActiveOwnerId → orphanClaimTarget → claimOrphanedData,
// or not), which is what actually exercises the bug. orphanClaimTarget() itself — the guard
// that decides who (if anyone) should receive orphaned rows — is pure and DB-free; see
// orphanClaimTarget.test.ts for its focused unit tests.
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

  // Fixed: authStore.createOfflineAccount() and linkOrCreateLocalAccount()'s fresh-account
  // branch (authStore.svelte.ts) now both route through localAccountRepo.orphanClaimTarget()
  // before calling claimOrphanedData(). This test calls that real (pure, DB-free) function
  // directly — see the file header for why it doesn't call authStore itself — so it exercises
  // the actual production guard and stays a regression test for #2.
  //
  // Gating claimOrphanedData() alone isn't sufficient: every read query in the sqlite repos
  // also falls back to `owner_id IS NULL` (docs/architecture/account-model.md §5), so an
  // orphan left unclaimed by *anyone* would still leak into the new profile's reads. The fix
  // has to actively sweep any stray orphan to the previously-active owner, not just skip
  // claiming it for the new one.
  it("row 2: a second profile must NOT steal the first profile's still-unclaimed data", async () => {
    const { createLocalAccount, claimOrphanedData, listLocalAccounts, orphanClaimTarget } =
      await import("$lib/data/localAccountRepo");
    const { setActiveOwnerId, getActiveOwnerId } = await import("$lib/data/activeOwner");
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

    // Mirrors authStore.createOfflineAccount()'s fixed body exactly: capture who's active and
    // how many accounts exist *before* creating the new profile, then let orphanClaimTarget()
    // decide who (if anyone) should receive any stray orphaned rows.
    const activeOwnerIdBeforeCreate = getActiveOwnerId();
    const accountsBeforeCreate = (await listLocalAccounts()).length;
    const profileB = await createLocalAccount({ username: "free_account" });
    setActiveOwnerId(profileB.id);
    const claimTarget = orphanClaimTarget(accountsBeforeCreate, activeOwnerIdBeforeCreate, profileB.id);
    if (claimTarget) await claimOrphanedData(claimTarget);

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

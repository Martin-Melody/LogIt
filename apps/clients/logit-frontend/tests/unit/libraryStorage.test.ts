// The library's phone storage against the real schema (createSchemaAndSeed) on node:sqlite:
// adding LogIt's bank to an existing install, the exercise repo's built-in cues and old ids,
// and your own / your coach's cardio and mobility items.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeSqliteDb } from "./support/nodeSqliteDb";
import { CORE_EXERCISES } from "@logit/core/domain/coreExercises";
import { newCardioActivity, newMobilityDrill } from "@logit/core/domain/library";

vi.mock("$lib/data/db/sqlite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/data/db/sqlite")>();
  return { ...actual, getDb: () => currentDb };
});

let currentDb: ReturnType<typeof createNodeSqliteDb>;

beforeEach(async () => {
  const { createSchemaAndSeed } = await import("$lib/data/db/sqlite");
  const { setActiveOwnerId } = await import("$lib/data/activeOwner");
  currentDb = createNodeSqliteDb();
  await createSchemaAndSeed(currentDb);
  setActiveOwnerId("owner-1");
});

async function exerciseRows() {
  const res = await currentDb.query(`SELECT id, name, is_core, primary_muscles FROM exercises`, []);
  return (res.values ?? []) as { id: string; name: string; is_core: number; primary_muscles: string }[];
}

describe("LogIt bank on the phone", () => {
  it("a fresh install has every bank exercise under its bank id", async () => {
    const rows = await exerciseRows();
    for (const ex of CORE_EXERCISES) {
      expect(rows.find((r) => r.id === ex.id)?.name, ex.name).toBe(ex.name);
    }
  });

  it("adds new exercises to an existing install without touching yours or your edits", async () => {
    const { seedLibraryBank } = await import("$lib/data/db/sqlite");
    // An install from before the bank: no Face Pull yet, your own "Face Pull", and an edited Squat.
    await currentDb.run(`DELETE FROM exercises WHERE id IN ('core_face_pull', 'core_goblet_squat')`, []);
    await currentDb.run(`DELETE FROM meta WHERE key LIKE 'library_bank_v%'`, []);
    await currentDb.run(
      `INSERT INTO exercises(id, name, notes, is_core, created_at_ms, owner_id, primary_muscles, secondary_muscles) VALUES('exdb_mine', 'Face Pull', NULL, 0, 1, 'owner-1', '["back"]', '[]')`,
      [],
    );
    await currentDb.run(`UPDATE exercises SET primary_muscles = '["glutes"]' WHERE id = 'core_squat'`, []);

    await seedLibraryBank(currentDb);
    const rows = await exerciseRows();

    expect(rows.find((r) => r.id === "core_goblet_squat")?.is_core).toBe(1);
    expect(rows.find((r) => r.id === "core_face_pull")).toBeUndefined();
    expect(rows.filter((r) => r.name === "Face Pull").map((r) => r.id)).toEqual(["exdb_mine"]);
    expect(rows.find((r) => r.id === "core_squat")?.primary_muscles).toBe('["glutes"]');
  });
});

describe("exercise repo", () => {
  it("gives built-ins the bank's cues and equipment, and finds them by old web ids", async () => {
    const { createSqliteExerciseRepo } = await import("$lib/data/exercise/exerciseRepo.sqlite");
    const repo = createSqliteExerciseRepo();
    const bench = await repo.getById("ex_core_bench");
    expect(bench?.id).toBe("core_bench_press");
    expect(bench?.equipment).toBe("barbell");
    expect(bench?.cues?.length).toBeGreaterThan(0);
  });

  it("saves your own cues and stamps edits", async () => {
    const { createSqliteExerciseRepo } = await import("$lib/data/exercise/exerciseRepo.sqlite");
    const repo = createSqliteExerciseRepo();
    const mine = await repo.create("Seal row");
    const updated = await repo.update(mine.id, { cues: ["Chest on the bench"], equipment: "barbell" });
    expect(updated.cues).toEqual(["Chest on the bench"]);
    expect(updated.equipment).toBe("barbell");
    expect(updated.updatedAtMs).toBeGreaterThan(0);
  });

  it("finds an exercise by name whatever the case", async () => {
    const { createSqliteExerciseRepo } = await import("$lib/data/exercise/exerciseRepo.sqlite");
    expect((await createSqliteExerciseRepo().getByName("bench press"))?.id).toBe("core_bench_press");
  });
});

describe("library repo", () => {
  it("keeps your cardio and mobility items per profile", async () => {
    const { createSqliteLibraryRepo } = await import("$lib/data/library/libraryRepo.sqlite");
    const { setActiveOwnerId } = await import("$lib/data/activeOwner");
    const repo = createSqliteLibraryRepo();
    const drill = newMobilityDrill({ name: "Hip airplane", area: "hips", perSide: true });
    await repo.saveOwn({ kind: "mobility", item: drill });
    await repo.saveOwn({ kind: "cardio", item: newCardioActivity({ name: "Sled drag" }) });

    expect((await repo.listOwn("mobility")).map((e) => e.item.name)).toEqual(["Hip airplane"]);
    expect((await repo.listOwn()).length).toBe(2);
    expect(await repo.getOwn(drill.id)).toEqual({ kind: "mobility", item: drill });

    await repo.saveOwn({ kind: "mobility", item: { ...drill, name: "Hip airplanes" } });
    expect((await repo.getOwn(drill.id))?.item.name).toBe("Hip airplanes");

    setActiveOwnerId("owner-2");
    expect(await repo.listOwn()).toEqual([]);
    setActiveOwnerId("owner-1");
    await repo.removeOwn(drill.id);
    expect((await repo.listOwn()).map((e) => e.kind)).toEqual(["cardio"]);
  });

  it("replaces the coach items whole", async () => {
    const { createSqliteLibraryRepo } = await import("$lib/data/library/libraryRepo.sqlite");
    const repo = createSqliteLibraryRepo();
    const coach = { coachId: "c1", coachName: "Alex" };
    const goblet = { id: "exdb_9", name: "Tempo goblet squat", notes: null, isCore: false, createdAtMs: 1, primaryMuscles: ["quads" as const], secondaryMuscles: [] };
    await repo.replaceFromCoaches([
      { kind: "strength", item: goblet, coach, viaProgram: true },
      { kind: "mobility", item: newMobilityDrill({ name: "Wall slides v2" }), coach, viaProgram: false },
    ]);
    expect((await repo.listFromCoaches()).length).toBe(2);
    await repo.replaceFromCoaches([{ kind: "strength", item: goblet, coach, viaProgram: false }]);
    const now = await repo.listFromCoaches();
    expect(now).toEqual([{ kind: "strength", item: goblet, coach, viaProgram: false }]);
  });
});

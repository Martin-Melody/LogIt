// Applying the server's library rows to the phone (librarySync.ts) against the real schema,
// plus the coach-exercise fallback that program blocks rely on.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeSqliteDb } from "./support/nodeSqliteDb";

vi.mock("$lib/data/db/sqlite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/data/db/sqlite")>();
  return { ...actual, getDb: () => currentDb };
});
// The pack wrapper isn't under test; keep plugin storage out of it.
vi.mock("$lib/plugins/catalog", () => ({ listInstalledPluginManifests: async () => [] }));

let currentDb: ReturnType<typeof createNodeSqliteDb>;

beforeEach(async () => {
  const { createSchemaAndSeed } = await import("$lib/data/db/sqlite");
  const { setActiveOwnerId } = await import("$lib/data/activeOwner");
  currentDb = createNodeSqliteDb();
  await createSchemaAndSeed(currentDb);
  setActiveOwnerId("owner-1");
});

async function repos() {
  const { createSqliteExerciseRepo } = await import("$lib/data/exercise/exerciseRepo.sqlite");
  const { createSqliteLibraryRepo } = await import("$lib/data/library/libraryRepo.sqlite");
  const { withCoachExercises } = await import("$lib/data/library/coachExerciseRepo");
  const library = createSqliteLibraryRepo();
  return { exercises: withCoachExercises(createSqliteExerciseRepo(), () => library), library };
}

const row = (id: string, data: Record<string, unknown>, kind = "strength") => ({
  id, createdAtMs: 1, kind, dataJson: JSON.stringify({ id, isCore: false, notes: null, createdAtMs: 1, ...data }),
});

describe("your own items from the server", () => {
  it("files each kind in the right place", async () => {
    const { mergeOwnLibrary } = await import("$lib/sync/librarySync");
    const { exercises, library } = await repos();
    await mergeOwnLibrary([
      row("exdb_seal", { name: "Seal row", primaryMuscles: ["back"], secondaryMuscles: [], cues: ["Chest down"] }),
      row("drill_band", { kind: "mobility", name: "Banded hip opener", area: "hips", defaultMetric: "hold", perSide: true, cues: [] }, "mobility"),
      row("cardio_ruck", { kind: "cardio", name: "Ruck", measures: "time-distance", cues: [] }, "cardio"),
    ], exercises, library);

    expect((await exercises.getById("exdb_seal"))?.cues).toEqual(["Chest down"]);
    expect((await library.listOwn()).map((e) => `${e.kind}:${e.item.name}`).sort()).toEqual(["cardio:Ruck", "mobility:Banded hip opener"]);
  });

  it("takes an edit only when it's newer than this phone's copy", async () => {
    const { mergeOwnLibrary } = await import("$lib/sync/librarySync");
    const { exercises, library } = await repos();
    const drill = { kind: "mobility", name: "Hip airplane", area: "hips", defaultMetric: "hold", perSide: true, cues: [] };
    await mergeOwnLibrary([row("d1", { ...drill, updatedAtMs: 100 }, "mobility")], exercises, library);

    await mergeOwnLibrary([row("d1", { ...drill, name: "Older name", updatedAtMs: 50 }, "mobility")], exercises, library);
    expect((await library.getOwn("d1"))?.item.name).toBe("Hip airplane");

    await mergeOwnLibrary([row("d1", { ...drill, name: "Hip airplanes", updatedAtMs: 200 }, "mobility")], exercises, library);
    expect((await library.getOwn("d1"))?.item.name).toBe("Hip airplanes");

    // Strength the same way.
    await mergeOwnLibrary([row("e1", { name: "Seal row", primaryMuscles: [], secondaryMuscles: [], updatedAtMs: 10 })], exercises, library);
    await mergeOwnLibrary([row("e1", { name: "Seal row", primaryMuscles: ["back"], secondaryMuscles: [], updatedAtMs: 20 })], exercises, library);
    expect((await exercises.getById("e1"))?.primaryMuscles).toEqual(["back"]);
  });

  it("deletes, but never touches a built-in", async () => {
    const { mergeOwnLibrary } = await import("$lib/sync/librarySync");
    const { exercises, library } = await repos();
    await mergeOwnLibrary([
      row("d1", { kind: "mobility", name: "X", area: "hips", defaultMetric: "hold", perSide: false, cues: [] }, "mobility"),
      row("e1", { name: "Seal row", primaryMuscles: [], secondaryMuscles: [] }),
    ], exercises, library);
    await mergeOwnLibrary([
      { id: "d1", createdAtMs: 0, dataJson: null, deletedAtMs: 5, kind: "mobility" },
      { id: "e1", createdAtMs: 0, dataJson: null, deletedAtMs: 5, kind: "strength" },
      { id: "core_squat", createdAtMs: 0, dataJson: null, deletedAtMs: 5, kind: "strength" },
      row("core_bench_press", { name: "Bench Press", primaryMuscles: ["glutes"], secondaryMuscles: [], updatedAtMs: 999 }),
    ], exercises, library);
    expect(await library.getOwn("d1")).toBeNull();
    expect(await exercises.getById("e1")).toBeNull();
    expect((await exercises.getById("core_squat"))?.isCore).toBe(true);
    expect((await exercises.getById("core_bench_press"))?.primaryMuscles).toEqual(["chest"]);
  });
});

describe("your coaches' items", () => {
  const shared = (id: string, kind: string, data: Record<string, unknown>, viaProgram = false) => ({
    coachId: "c1", coachName: "Alex", id, kind, viaProgram, updatedAtMs: 1,
    dataJson: JSON.stringify({ id, isCore: false, notes: null, ...data }),
  });

  it("replaces the list and lets a program's exercise resolve with its muscles", async () => {
    const { replaceCoachLibrary } = await import("$lib/sync/librarySync");
    const { exercises, library } = await repos();
    await replaceCoachLibrary([
      shared("exdb_goblet", "strength", { name: "Tempo goblet squat", primaryMuscles: ["quads", "glutes"], secondaryMuscles: [], cues: ["3 seconds down"] }, true),
      shared("drill_wall", "mobility", { kind: "mobility", name: "Wall slides v2", area: "shoulders", defaultMetric: "reps", perSide: false, cues: [] }),
      shared("bad", "strength", { nope: true }),
    ], library);

    expect((await library.listFromCoaches()).map((i) => i.item.id).sort()).toEqual(["drill_wall", "exdb_goblet"]);
    // A program block naming the coach's exercise, by id or by name:
    expect((await exercises.getById("exdb_goblet"))?.primaryMuscles).toEqual(["quads", "glutes"]);
    expect((await exercises.getByName("tempo goblet squat"))?.id).toBe("exdb_goblet");
    // Your own of the same name would win; LogIt's exercises are untouched.
    expect((await exercises.getByName("Squat"))?.id).toBe("core_squat");

    await replaceCoachLibrary([], library);
    expect(await exercises.getById("exdb_goblet")).toBeNull();
  });

  it("offers coach exercises in pickers, but not as yours", async () => {
    const { replaceCoachLibrary } = await import("$lib/sync/librarySync");
    const { exercises, library } = await repos();
    await replaceCoachLibrary([
      shared("exdb_goblet", "strength", { name: "Tempo goblet squat", primaryMuscles: ["quads"], secondaryMuscles: [] }),
      shared("exdb_squat", "strength", { name: "squat", primaryMuscles: ["quads"], secondaryMuscles: [] }),
    ], library);
    const all = await exercises.list({ query: "squat", limit: 200 });
    expect(all.filter((e) => e.name.toLowerCase() === "squat").map((e) => e.id)).toEqual(["core_squat"]);
    expect(all.map((e) => e.id)).toContain("exdb_goblet");
    expect((await exercises.list({ filter: "mine" })).map((e) => e.id)).not.toContain("exdb_goblet");
  });

  it("changing a coach's exercise saves it as yours under the same id", async () => {
    const { replaceCoachLibrary } = await import("$lib/sync/librarySync");
    const { exercises, library } = await repos();
    await replaceCoachLibrary([shared("exdb_goblet", "strength", { name: "Tempo goblet squat", primaryMuscles: ["quads"], secondaryMuscles: [] })], library);
    const updated = await exercises.update("exdb_goblet", { notes: "Use the 24 kg bell" });
    expect(updated.notes).toBe("Use the 24 kg bell");
    expect((await exercises.list({ filter: "mine" })).map((e) => e.id)).toContain("exdb_goblet");
  });
});

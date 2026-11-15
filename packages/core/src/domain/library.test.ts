import { describe, expect, it } from "vitest";
import { CORE_EXERCISES, LEGACY_CORE_EXERCISE_IDS, canonicalExerciseId, coreExerciseById } from "./coreExercises";
import { BUILTIN_CARDIO } from "./cardioActivity";
import { BUILTIN_MOBILITY_DRILLS, MOBILITY_AREAS } from "./mobilityDrill";
import { EQUIPMENT } from "./exercise";
import {
  copyLibraryItem,
  entryDetails,
  filterLibrary,
  libraryItemFromJson,
  libraryItemToJson,
  librarySections,
  logitEntries,
  mergeLibrary,
  newCardioActivity,
  newMobilityDrill,
  type LibraryEntry,
} from "./library";

/** The names the phone has seeded since the start; their ids must never change. */
const PHONE_SEEDED = [
  "Bench Press", "Incline Bench Press", "Squat", "Front Squat", "Deadlift", "Romanian Deadlift",
  "Overhead Press", "Pull-Up", "Lat Pulldown", "Barbell Row", "Dumbbell Row", "Chest Fly",
  "Lateral Raise", "Rear Delt Fly", "Bicep Curl", "Hammer Curl", "Tricep Pushdown", "Skullcrusher",
  "Leg Press", "Leg Curl", "Leg Extension", "Calf Raise", "Plank", "Hanging Leg Raise",
  "Machine French Press", "Pec Deck", "JM Press", "T-Bar Row", "Hip Abduction", "Hip Adduction",
  "Machine Back Extension", "Dips",
];
const phoneId = (name: string) => `core_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;

describe("LogIt bank", () => {
  it("has unique ids and names in every kind", () => {
    for (const list of [CORE_EXERCISES, BUILTIN_CARDIO, BUILTIN_MOBILITY_DRILLS]) {
      const ids = list.map((x) => x.id);
      const names = list.map((x) => x.name.toLowerCase());
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("keeps the ids the phone has always used for its built-ins", () => {
    for (const name of PHONE_SEEDED) {
      const found = CORE_EXERCISES.find((e) => e.name === name);
      expect(found, name).toBeDefined();
      expect(found!.id).toBe(phoneId(name));
    }
  });

  it("maps every old web id to an exercise in the bank", () => {
    for (const [old, id] of Object.entries(LEGACY_CORE_EXERCISE_IDS)) {
      expect(coreExerciseById(old)?.id, old).toBe(id);
    }
    expect(canonicalExerciseId("exdb_abc")).toBe("exdb_abc");
  });

  it("gives every item what the library shows", () => {
    for (const e of CORE_EXERCISES) {
      expect(e.primaryMuscles.length, e.name).toBeGreaterThan(0);
      expect(EQUIPMENT).toContain(e.equipment);
      expect(e.cues?.length, e.name).toBeGreaterThan(0);
    }
    for (const d of BUILTIN_MOBILITY_DRILLS) {
      expect(MOBILITY_AREAS).toContain(d.area);
      expect(d.cues.length, d.name).toBeGreaterThan(0);
    }
  });
});

describe("sync records", () => {
  it("keeps strength rows as a bare exercise", () => {
    const ex = CORE_EXERCISES[0]!;
    const json = libraryItemToJson({ kind: "strength", item: { ...ex, isCore: false } });
    expect(JSON.parse(json).kind).toBeUndefined();
    expect(libraryItemFromJson(json)).toMatchObject({ kind: "strength", item: { name: ex.name } });
  });

  it("round-trips cardio and mobility", () => {
    const c = newCardioActivity({ name: " Sled drag ", measures: "time", cues: ["Low", " "] });
    expect(c.name).toBe("Sled drag");
    expect(c.cues).toEqual(["Low"]);
    expect(libraryItemFromJson(libraryItemToJson({ kind: "cardio", item: c }))).toEqual({ kind: "cardio", item: c });

    const d = newMobilityDrill({ name: "Hip airplane", area: "hips", perSide: true });
    expect(libraryItemFromJson(libraryItemToJson({ kind: "mobility", item: d }))).toEqual({ kind: "mobility", item: d });
  });

  it("uses the row's kind when the JSON has none, and rejects junk", () => {
    expect(libraryItemFromJson(JSON.stringify({ id: "x", name: "Rope" }), "cardio")?.kind).toBe("cardio");
    expect(libraryItemFromJson("{nope")).toBeNull();
    expect(libraryItemFromJson(JSON.stringify({ name: "no id" }))).toBeNull();
    expect(libraryItemFromJson(JSON.stringify({ id: "x", name: "y", kind: "yoga" }))).toBeNull();
  });
});

describe("building the list", () => {
  const coach = { coachId: "c1", coachName: "Alex" };
  const mine: LibraryEntry = {
    kind: "strength", source: "mine",
    item: { id: "exdb_1", name: "landmine press", notes: null, isCore: false, createdAtMs: 1, primaryMuscles: ["shoulders"], secondaryMuscles: [] },
  };
  const fromCoach: LibraryEntry = {
    kind: "strength", source: "coach", coach,
    item: { id: "exdb_9", name: "Tempo goblet squat", notes: null, isCore: false, createdAtMs: 1, primaryMuscles: ["quads", "glutes"], secondaryMuscles: [] },
  };
  const coachDupe: LibraryEntry = { ...fromCoach, item: { ...fromCoach.item, id: "exdb_8", name: "Squat" } };

  it("keeps one per name: yours, then the coach's, then LogIt's", () => {
    const all = mergeLibrary([logitEntries("strength"), [mine, fromCoach, coachDupe]]);
    const named = (n: string) => all.filter((e) => e.item.name.toLowerCase() === n.toLowerCase());
    expect(named("Landmine Press")).toEqual([mine]);
    expect(named("Squat")).toEqual([coachDupe]);
    expect(named("Tempo goblet squat")).toEqual([fromCoach]);
    expect(all.length).toBe(CORE_EXERCISES.length + 1);
  });

  it("doesn't merge across kinds", () => {
    const cardioSquat: LibraryEntry = { kind: "cardio", source: "mine", item: newCardioActivity({ name: "Squat" }) };
    const all = mergeLibrary([logitEntries(), [cardioSquat]]);
    expect(all.filter((e) => e.item.name === "Squat").map((e) => e.kind).sort()).toEqual(["cardio", "strength"]);
  });

  it("filters by kind, source, coach and words in the name or details", () => {
    const all = mergeLibrary([logitEntries(), [mine, fromCoach]]);
    expect(filterLibrary(all, { kind: "strength", source: "coach:c1" })).toEqual([fromCoach]);
    expect(filterLibrary(all, { source: "coach:c2" })).toEqual([]);
    expect(filterLibrary(all, { source: "mine" })).toEqual([mine]);
    expect(filterLibrary(all, { kind: "mobility", query: "hip flexors" }).length).toBeGreaterThan(1);
    expect(filterLibrary(all, { kind: "strength", query: "goblet quads" })).toEqual(
      expect.arrayContaining([fromCoach]),
    );
  });

  it("orders sections Mine, From coach, LogIt", () => {
    const all = mergeLibrary([logitEntries("strength"), [mine, fromCoach]]);
    expect(librarySections(all).map((s) => s.label)).toEqual(["Mine", "From Alex", "LogIt"]);
  });

  it("describes items for the list", () => {
    expect(entryDetails({ kind: "strength", item: coreExerciseById("core_squat")! })).toBe("quads, glutes · barbell");
    expect(entryDetails({ kind: "mobility", item: newMobilityDrill({ name: "x", area: "hip-flexors", perSide: true }) })).toBe("hip flexors · hold · each side");
    expect(entryDetails({ kind: "cardio", item: newCardioActivity({ name: "x", measures: "time" }) })).toBe("time");
  });

  it("copies an item as a new one of yours", () => {
    const copy = copyLibraryItem({ kind: "strength", item: coreExerciseById("core_squat")! }, "My squat");
    expect(copy.item).toMatchObject({ name: "My squat", isCore: false, primaryMuscles: ["quads", "glutes"] });
    expect(copy.item.id).not.toBe("core_squat");
  });
});

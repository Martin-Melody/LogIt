import { describe, expect, it } from "vitest";
import { BUILTIN_MOBILITY_DRILLS } from "./mobilityDrill";
import { DRILL_PROGRESSIONS, drillArea, progressionFor } from "./mobilityProgressions";

describe("mobility drill progressions (data)", () => {
  const ids = new Set(BUILTIN_MOBILITY_DRILLS.map((d) => d.id));

  it("covers every built-in drill and links only to real ones", () => {
    expect(Object.keys(DRILL_PROGRESSIONS).sort()).toEqual([...ids].sort());
    for (const [id, p] of Object.entries(DRILL_PROGRESSIONS)) {
      for (const other of [...p.harder, ...p.easier]) {
        expect(ids.has(other), `${id} → ${other}`).toBe(true);
        expect(other).not.toBe(id);
      }
    }
  });

  it("is a tree: Lizard pose leads to several harder drills", () => {
    expect(progressionFor({ id: "core:lizard", name: "Lizard pose" })!.harder.map((d) => d.name)).toEqual(["Couch stretch", "Pigeon pose", "Frog stretch"]);
  });

  it("finds a drill and its area by name when a block has no id", () => {
    expect(drillArea({ name: "lizard pose" })).toBe("hip-flexors");
    expect(progressionFor({ name: "Neck CARs" })!.steady).toBe(true);
    expect(progressionFor({ name: "My own drill" })).toBeNull();
  });
});

describe("drills from packs and your own", () => {
  const own = { id: "own_1", name: "Wall pigeon", area: "glutes", defaultMetric: "hold", perSide: true, cues: [], notes: null, isCore: false } as const;
  const pack = { id: "pack:x:split-prep", name: "Split prep", area: "hip-flexors", defaultMetric: "hold", perSide: true, cues: [], notes: null, isCore: false,
    takesLoad: false, harderCues: ["Lower"], harder: ["Couch stretch", "Front split"] } as const;
  const catalog = [...BUILTIN_MOBILITY_DRILLS, own, pack];

  it("know their area from the catalog", () => {
    expect(drillArea({ name: "Wall pigeon" }, catalog)).toBe("glutes");
    expect(drillArea({ name: "Wall pigeon" })).toBeNull(); // built-ins only
  });

  it("a pack's own links resolve to drills that exist; your own drill declares none", () => {
    expect(progressionFor({ id: "pack:x:split-prep", name: "Split prep" }, catalog)).toEqual({
      takesLoad: false, harderCues: ["Lower"], harder: [{ id: "core:couch-stretch", name: "Couch stretch" }], steady: false,
    });
    expect(progressionFor({ name: "Wall pigeon" }, catalog)).toEqual({ takesLoad: false, harderCues: [], harder: [], steady: false });
  });
});

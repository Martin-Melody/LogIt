import { describe, it, expect } from "vitest";
import { parseMobilityPack, buildMobilityPack, packMobilityDrillId } from "./mobilityPack";

const good = {
  formatVersion: 1,
  pluginId: "com.example.hips",
  drills: [
    { name: "Deep Squat Hold", area: "ankles", defaultMetric: "hold", perSide: false, cues: ["heels down"] },
    { name: "Banded Hip Raise", area: "hip-flexors", defaultMetric: "reps", perSide: true },
  ],
};

describe("parseMobilityPack", () => {
  it("parses a valid pack", () => {
    const pack = parseMobilityPack(good, "com.example.hips");
    expect(pack.drills).toHaveLength(2);
    expect(pack.drills[1]!.perSide).toBe(true);
    expect(pack.drills[0]!.defaultMetric).toBe("hold");
  });

  it("defaults metric to hold and perSide to false", () => {
    const pack = parseMobilityPack({
      formatVersion: 1,
      pluginId: "x",
      drills: [{ name: "Thing", area: "hips" }],
    });
    expect(pack.drills[0]!.defaultMetric).toBe("hold");
    expect(pack.drills[0]!.perSide).toBe(false);
  });

  it("drops in-pack duplicate names", () => {
    const pack = parseMobilityPack({
      formatVersion: 1,
      pluginId: "x",
      drills: [
        { name: "Pancake", area: "adductors" },
        { name: "pancake", area: "hamstrings" },
      ],
    });
    expect(pack.drills).toHaveLength(1);
  });

  it("rejects an unknown area", () => {
    expect(() =>
      parseMobilityPack({ formatVersion: 1, pluginId: "x", drills: [{ name: "Y", area: "elbows" }] }),
    ).toThrow(/unknown area/i);
  });

  it("rejects a bad metric", () => {
    expect(() =>
      parseMobilityPack({
        formatVersion: 1,
        pluginId: "x",
        drills: [{ name: "Y", area: "hips", defaultMetric: "seconds" }],
      }),
    ).toThrow(/hold.*reps/i);
  });

  it("rejects a pluginId mismatch", () => {
    expect(() => parseMobilityPack(good, "com.other")).toThrow(/does not match/i);
  });

  it("round-trips through buildMobilityPack", () => {
    const built = buildMobilityPack("com.example.hips", [
      { name: "X", area: "hips", defaultMetric: "reps", perSide: true, cues: [], notes: null },
    ]);
    expect(built.pluginId).toBe("com.example.hips");
    expect(packMobilityDrillId("com.example.hips", "X")).toBe("pack:com.example.hips:x");
  });
});

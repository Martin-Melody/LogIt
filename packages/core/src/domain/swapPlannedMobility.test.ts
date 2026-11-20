import { describe, expect, it } from "vitest";
import { swapPlannedMobilityDrill, type WorkoutSplit } from "./WorkoutSplit";

describe("swapPlannedMobilityDrill", () => {
  const split = { id: "s", name: "S", archived: false, createdAtMs: 0, updatedAtMs: 0, days: [
    { id: "d1", orderIndex: 0, blocks: [{ type: "mobility", id: "m", orderIndex: 0, drillName: "Butterfly stretch", drillId: "core:butterfly", metric: "hold", perSide: false, targets: { sets: 2 } }] },
    { id: "d2", orderIndex: 1, blocks: [{ type: "mobility", id: "m2", orderIndex: 0, drillName: "Butterfly stretch", drillId: "core:butterfly", metric: "hold", perSide: false }] },
  ] } as WorkoutSplit;

  it("replaces the drill on that day only, keeping its targets", () => {
    const out = swapPlannedMobilityDrill(split, "d1", { drillId: "core:butterfly", drillName: "Butterfly stretch" }, { drillId: "core:frog-stretch", drillName: "Frog stretch" })!;
    expect(out.days[0]!.blocks[0]).toMatchObject({ drillName: "Frog stretch", drillId: "core:frog-stretch", targets: { sets: 2 } });
    expect(out.days[1]!.blocks[0]).toMatchObject({ drillName: "Butterfly stretch" });
    expect(swapPlannedMobilityDrill(split, "d1", { drillName: "Pigeon pose" }, { drillName: "Frog stretch" })).toBeNull();
  });
});

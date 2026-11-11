// Split rotation syncs between devices: each split keeps whichever "last day done" is newer,
// and a workout pushes the profile so other devices follow.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";

const pushNavConfig = vi.fn(async () => {});
vi.mock("$lib/sync/syncService", () => ({ pushNavConfig }));

const { advanceRotation, applyRemoteRotations, getNextDay, getRotations } = await import(
  "$lib/usecases/Splits/splitRotation"
);

const split = {
  id: "ppl",
  days: [
    { id: "push", orderIndex: 0 },
    { id: "pull", orderIndex: 1 },
    { id: "legs", orderIndex: 2 },
  ],
} as unknown as WorkoutSplit;

beforeEach(() => {
  localStorage.clear();
  pushNavConfig.mockClear();
});

describe("split rotation sync", () => {
  it("a workout advances the rotation and pushes the profile", async () => {
    advanceRotation("ppl", "push");
    expect(getNextDay(split)?.id).toBe("pull");
    await vi.waitFor(() => expect(pushNavConfig).toHaveBeenCalledTimes(1));
  });

  it("only the asked-for splits go into the profile", () => {
    advanceRotation("ppl", "push");
    advanceRotation("someone-elses-split", "x");
    expect(Object.keys(getRotations(["ppl"]))).toEqual(["ppl"]);
  });

  it("another device's newer workout moves the next day here", () => {
    advanceRotation("ppl", "push");
    applyRemoteRotations({ ppl: { lastDayId: "pull", recordedAtMs: Date.now() + 1_000 } });
    expect(getNextDay(split)?.id).toBe("legs");
  });

  it("an older remote rotation doesn't rewind this device", () => {
    advanceRotation("ppl", "pull");
    applyRemoteRotations({ ppl: { lastDayId: "push", recordedAtMs: Date.now() - 60_000 } });
    expect(getNextDay(split)?.id).toBe("legs");
  });

  it("a remote rotation for a split never done here is taken as is", () => {
    applyRemoteRotations({ ppl: { lastDayId: "legs", recordedAtMs: Date.now() } });
    expect(getNextDay(split)?.id).toBe("push");
  });
});

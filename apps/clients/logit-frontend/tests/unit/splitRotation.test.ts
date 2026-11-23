// The rotation pointer still syncs between devices for older app versions (this one plans from
// the workouts themselves): each split keeps whichever "last day done" is newer.
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushNavConfig = vi.fn(async () => {});
vi.mock("$lib/sync/syncService", () => ({ pushNavConfig }));

const { advanceRotation, applyRemoteRotations, getRotations } = await import(
  "$lib/usecases/Splits/splitRotation"
);

beforeEach(() => {
  localStorage.clear();
  pushNavConfig.mockClear();
});

describe("split rotation sync", () => {
  it("a workout advances the rotation and pushes the profile", async () => {
    advanceRotation("ppl", "push");
    expect(getRotations(["ppl"]).ppl?.lastDayId).toBe("push");
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
    expect(getRotations(["ppl"]).ppl?.lastDayId).toBe("pull");
  });

  it("an older remote rotation doesn't rewind this device", () => {
    advanceRotation("ppl", "pull");
    applyRemoteRotations({ ppl: { lastDayId: "push", recordedAtMs: Date.now() - 60_000 } });
    expect(getRotations(["ppl"]).ppl?.lastDayId).toBe("pull");
  });

  it("a remote rotation for a split never done here is taken as is", () => {
    applyRemoteRotations({ ppl: { lastDayId: "legs", recordedAtMs: Date.now() } });
    expect(getRotations(["ppl"]).ppl?.lastDayId).toBe("legs");
  });
});

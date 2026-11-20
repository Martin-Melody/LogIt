import { describe, expect, it } from "vitest";
import { sameEveryTime } from "./sameEveryTime";

const drill = { name: "Couch stretch", metric: "hold" as const, perSide: true };

describe("Same every time (mobility)", () => {
  it("starts with 30-second holds, both sides, twice", async () => {
    const out = await sameEveryTime.suggest({ drill, history: [], state: null, userPreferences: {}, now: 0 });
    expect(out.sets).toEqual([
      { side: "left", durationSec: 30 }, { side: "right", durationSec: 30 },
      { side: "left", durationSec: 30 }, { side: "right", durationSec: 30 },
    ]);
  });

  it("repeats last time's sets as they were done, never adding", async () => {
    const history = [{ sessionId: "s", performedAtMs: 1, sets: [
      { side: "left" as const, durationSec: 45, completed: true }, { side: "right" as const, durationSec: 40, completed: true, loadKg: 5 },
      { side: "left" as const, durationSec: 45, completed: false },
    ] }];
    const out = await sameEveryTime.suggest({ drill, history, state: null, userPreferences: {}, now: 0 });
    expect(out.sets).toEqual([{ side: "left", durationSec: 45 }, { side: "right", durationSec: 40, loadKg: 5 }]);
    expect(out.label).toBe("Same as last time: 45 s");
  });
});

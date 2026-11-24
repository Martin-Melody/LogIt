import { describe, expect, it } from "vitest";
import type { SessionBlock } from "@logit/core/domain/workout";
import { blockStages } from "./stage";

const strength = (id: string, order: number, done: boolean[], superset?: string): SessionBlock => ({
  id,
  type: "strength",
  orderIndex: order,
  data: {
    exerciseName: id,
    sets: done.map((c, i) => ({ id: `${id}-${i}`, setType: "normal", reps: 8, weight: 50, orderIndex: i, completed: c })),
    ...(superset ? { superset: { id: superset } } : {}),
  },
});

describe("blockStages", () => {
  it("done, then the first unfinished one is current, the rest next", () => {
    const s = blockStages({ blocks: [strength("a", 0, [true, true]), strength("b", 1, [false, false]), strength("c", 2, [false])] });
    expect([...s.values()]).toEqual(["done", "current", "next"]);
  });

  it("a started block further down is current (you jumped ahead)", () => {
    const s = blockStages({ blocks: [strength("a", 0, [false]), strength("b", 1, [true, false])] });
    expect(s.get("a")).toBe("next");
    expect(s.get("b")).toBe("current");
  });

  it("a superset moves as one", () => {
    const s = blockStages({ blocks: [strength("a", 0, [true], "g"), strength("b", 1, [false], "g"), strength("c", 2, [false])] });
    expect(s.get("a")).toBe("current");
    expect(s.get("b")).toBe("current");
    expect(s.get("c")).toBe("next");
  });

  it("a block with no sets is unfinished, everything done is all done", () => {
    expect(blockStages({ blocks: [strength("a", 0, [])] }).get("a")).toBe("current");
    expect([...blockStages({ blocks: [strength("a", 0, [true]), strength("b", 1, [true])] }).values()]).toEqual(["done", "done"]);
  });
});

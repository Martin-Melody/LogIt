import { describe, expect, it } from "vitest";
import { meterRow } from "$lib/features/session/planFormat";

const short = (cells: string[]) => cells.map((c) => ({ hit: "H", bonus: "B", target: "T", rest: "." })[c]).join("");

describe("meterRow", () => {
  it("shows today's aim before the set is done", () => {
    const r = meterRow(0, 5, 8);
    expect(short(r.cells)).toBe("TTTTT...");
    expect(r.right).toBe("aim 5");
  });

  it("hitting the aim exactly is all blue and reads against the aim, not the goal", () => {
    const r = meterRow(6, 6, 8);
    expect(short(r.cells)).toBe("HHHHHH..");
    expect(r.right).toBe("6/6");
  });

  it("reps beyond the aim are bonus cells", () => {
    const r = meterRow(7, 5, 8);
    expect(short(r.cells)).toBe("HHHHHBB.");
    expect(r.right).toBe("7 +2");
  });

  it("falling short leaves the rest of the aim dashed", () => {
    const r = meterRow(4, 6, 8);
    expect(short(r.cells)).toBe("HHHHTT..");
    expect(r.right).toBe("4/6");
  });

  it("reaching the goal is marked done", () => {
    const r = meterRow(8, 6, 8);
    expect(short(r.cells)).toBe("HHHHHHBB");
    expect(r.right).toBe("8 ✓");
  });

  it("a set with no aim counts every rep towards the goal", () => {
    const r = meterRow(5, 0, 8);
    expect(short(r.cells)).toBe("HHHHH...");
    expect(r.right).toBe("5");
  });
});

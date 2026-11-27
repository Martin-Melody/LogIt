import { describe, expect, it } from "vitest";
import { parseProgramPack } from "./programPack";
import { copyToMyPrograms, programSummary } from "../domain/CoachProgram";

const pack = {
  formatVersion: 1,
  programs: [{
    name: "Upper / lower", weeks: [{ id: "w1", weekNumber: 1, days: [{ id: "d1", orderIndex: 0, name: "Upper A", blocks: [
      { type: "strength", id: "b1", orderIndex: 0, exerciseName: "Bench Press", sets: [{ id: "s1", orderIndex: 0, setType: "normal", repsMin: 6, repsMax: 8 }] },
    ] }] }],
  }],
};

describe("program packs", () => {
  it("reads a pack, as v2, and copying it makes the coach's own program", () => {
    const parsed = parseProgramPack(pack, "app.gripstrong.ul");
    const p = parsed.programs[0]!;
    expect(p.schemaVersion).toBe(2);
    expect(programSummary(p)).toBe("1 week · 1 day a week · Fixed");
    const mine = copyToMyPrograms(p, { kind: "community", id: "app.gripstrong.ul", name: "Upper / lower", author: "gripstrong" });
    expect(mine.id).not.toBe(p.id);
    expect(mine.origin?.kind).toBe("community");
    expect(mine.weeks[0]!.days[0]!.id).not.toBe("d1");
  });

  it("turns down what isn't a pack, with words a coach can read", () => {
    expect(() => parseProgramPack({ formatVersion: 2, programs: [] }, "x")).toThrow("newer LogIt");
    expect(() => parseProgramPack({ formatVersion: 1, programs: [] }, "x")).toThrow("no programs");
    expect(() => parseProgramPack({ formatVersion: 1, programs: [{ name: "", weeks: [] }] }, "x")).toThrow("missing its name");
    const tooLong = { formatVersion: 1, programs: [{ name: "Long", weeks: Array.from({ length: 60 }, (_, i) => ({ id: `w${i}`, weekNumber: i + 1, days: [] })) }] };
    expect(() => parseProgramPack(tooLong, "x")).toThrow("1 to 52 weeks");
  });
});

import { describe, expect, it } from "vitest";
import { BUILTIN_PROGRAMS, BUILTIN_PROGRAM_IDS, getBuiltinProgram, isBuiltinProgramId } from "./builtinPrograms";

describe("builtinPrograms", () => {
  it("has exactly one program per declared id, and ids are unique", () => {
    expect(BUILTIN_PROGRAMS).toHaveLength(BUILTIN_PROGRAM_IDS.length);
    const ids = BUILTIN_PROGRAMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([...BUILTIN_PROGRAM_IDS].sort());
  });

  it("every program has at least one week with at least one day with at least one exercise with sets", () => {
    for (const program of BUILTIN_PROGRAMS) {
      expect(program.weeks.length).toBeGreaterThan(0);
      for (const week of program.weeks) {
        expect(week.days.length).toBeGreaterThan(0);
        for (const day of week.days) {
          expect(day.blocks.length).toBeGreaterThan(0);
          for (const block of day.blocks) {
            if (block.type === "strength") {
              expect(block.sets.length).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it("is manual-start (not auto-dated), matching the repeating-routine framing", () => {
    for (const program of BUILTIN_PROGRAMS) {
      expect(program.startMode).toBe("manual");
      expect(program.startDateMs).toBeUndefined();
    }
  });

  it("getBuiltinProgram finds a program by id and returns null for an unknown one", () => {
    expect(getBuiltinProgram("builtin-full-body-3x")?.name).toBe("Full-Body 3x/week");
    expect(getBuiltinProgram("not-a-real-id")).toBeNull();
  });

  it("isBuiltinProgramId narrows correctly", () => {
    expect(isBuiltinProgramId("builtin-strength-5x5")).toBe(true);
    expect(isBuiltinProgramId("some-other-id")).toBe(false);
  });
});

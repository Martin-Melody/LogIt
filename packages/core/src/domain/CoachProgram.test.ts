import { describe, expect, it } from "vitest";
import {
  addDay,
  addStrengthBlock,
  addWeek,
  copyProgramForClient,
  copyWeekOver,
  createCoachProgram,
  leaveSuperset,
  loadText,
  moveBlock,
  supersetLabels,
  supersetWithPrevious,
  updateDay,
  parseLoadText,
  parseRepsText,
  parseRestText,
  repsText,
  restText,
  updateCopyFromTemplate,
  fromDateInputValue,
  getCurrentWeek,
  getProgramProgress,
  getProgramStartMs,
  setProgramStart,
  startOfLocalDayMs,
  toDateInputValue,
  type CoachProgram,
} from "./CoachProgram";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 16); // a Monday

function threeWeekProgram(patch: Partial<CoachProgram> = {}): CoachProgram {
  let p = createCoachProgram("Block");
  p = addWeek(p);
  p = addWeek(p);
  return { ...p, ...patch };
}

describe("program start", () => {
  it("a new program waits for the client to tap Start", () => {
    const p = threeWeekProgram();
    expect(p.startMode).toBe("manual");
    expect(getProgramProgress(p, START)).toEqual({ status: "not-started" });
    expect(getCurrentWeek(p, START)).toBeNull();
  });

  it("manual: runs from the client's start, week by week, then finishes", () => {
    const p = threeWeekProgram({ clientStartedAtMs: START });
    expect(getProgramProgress(p, START)).toEqual({ status: "running", weekNumber: 1 });
    expect(getProgramProgress(p, START + 6 * DAY)).toEqual({ status: "running", weekNumber: 1 });
    expect(getProgramProgress(p, START + 7 * DAY)).toEqual({ status: "running", weekNumber: 2 });
    expect(getProgramProgress(p, START + 20 * DAY)).toEqual({ status: "running", weekNumber: 3 });
    expect(getProgramProgress(p, START + 21 * DAY)).toEqual({ status: "finished" });
    expect(getCurrentWeek(p, START + 8 * DAY)?.weekNumber).toBe(2);
  });

  it("manual ignores a coach date, fixed-date ignores the client's start", () => {
    const both = { startDateMs: START, clientStartedAtMs: START + 3 * DAY };
    expect(getProgramStartMs(threeWeekProgram({ ...both, startMode: "manual" }))).toBe(START + 3 * DAY);
    expect(getProgramStartMs(threeWeekProgram({ ...both, startMode: "fixed-date" }))).toBe(START);
  });

  it("fixed-date: scheduled before the date, running from it", () => {
    const p = threeWeekProgram({ startMode: "fixed-date", startDateMs: START });
    expect(getProgramProgress(p, START - DAY)).toEqual({ status: "scheduled", startsAtMs: START });
    expect(getProgramProgress(p, START)).toEqual({ status: "running", weekNumber: 1 });
  });

  it("fixed-date without a date yet is not started", () => {
    const p = threeWeekProgram({ startMode: "fixed-date" });
    expect(getProgramProgress(p, START)).toEqual({ status: "not-started" });
  });

  it('programs saved with the old "on-accept" mode behave as manual', () => {
    const legacy = { ...threeWeekProgram(), startMode: "on-accept" } as unknown as CoachProgram;
    expect(getProgramProgress(legacy, START)).toEqual({ status: "not-started" });
    const started = { ...legacy, clientStartedAtMs: START };
    expect(getProgramProgress(started, START + DAY)).toEqual({ status: "running", weekNumber: 1 });
  });

  it("startOfLocalDayMs is local midnight of the same day", () => {
    const noon = new Date(2026, 10, 18, 12, 30).getTime();
    expect(startOfLocalDayMs(noon)).toBe(new Date(2026, 10, 18).getTime());
  });

  it("setProgramStart switches modes and drops a stale date", () => {
    const date = new Date(2026, 10, 16, 15).getTime();
    const fixed = setProgramStart(threeWeekProgram(), { mode: "fixed-date", startDateMs: date });
    expect(fixed.startMode).toBe("fixed-date");
    expect(fixed.startDateMs).toBe(new Date(2026, 10, 16).getTime());
    const manual = setProgramStart(fixed, { mode: "manual" });
    expect(manual.startMode).toBe("manual");
    expect(manual.startDateMs).toBeUndefined();
  });

  it("date input values round-trip in local time", () => {
    const ms = new Date(2026, 0, 5).getTime();
    expect(toDateInputValue(ms)).toBe("2026-01-05");
    expect(fromDateInputValue("2026-01-05")).toBe(ms);
    expect(fromDateInputValue("")).toBeNull();
  });
});

describe("library copies", () => {
  function template(): CoachProgram {
    let p = threeWeekProgram();
    p = addDay(p, p.weeks[0].id, "Upper");
    p = addStrengthBlock(p, p.weeks[0].id, p.weeks[0].days[0].id, { exerciseName: "Bench press" });
    return { ...p, description: "Upper / lower" };
  }

  it("assigning makes a linked copy with new ids and the chosen start", () => {
    const t = template();
    const copy = copyProgramForClient(t, { mode: "fixed-date", startDateMs: START + 3 * 60 * 60 * 1000 });
    expect(copy.id).not.toBe(t.id);
    expect(copy.sourceProgramId).toBe(t.id);
    expect(copy.startMode).toBe("fixed-date");
    expect(copy.startDateMs).toBe(startOfLocalDayMs(START + 3 * 60 * 60 * 1000));
    expect(copy.weeks).toHaveLength(3);
    expect(copy.weeks[0].id).not.toBe(t.weeks[0].id);
    expect(copy.weeks[0].days[0].blocks[0].id).not.toBe(t.weeks[0].days[0].blocks[0].id);
    expect(copy.weeks[0].days[0].blocks[0]).toMatchObject({ type: "strength", exerciseName: "Bench press" });
  });

  it("a manual copy drops any start the template carried", () => {
    const t = { ...template(), startMode: "fixed-date" as const, startDateMs: START, clientStartedAtMs: START };
    const copy = copyProgramForClient(t, { mode: "manual" });
    expect(copy.startMode).toBe("manual");
    expect(copy.startDateMs).toBeUndefined();
    expect(copy.clientStartedAtMs).toBeUndefined();
  });

  it("updating a copy takes the library weeks but keeps the client's start", () => {
    const t = template();
    const copy = { ...copyProgramForClient(t, { mode: "manual" }), clientStartedAtMs: START };
    const edited = { ...addWeek(t), name: "Block v2", description: "now 4 weeks" };
    const updated = updateCopyFromTemplate(copy, edited);
    expect(updated.id).toBe(copy.id);
    expect(updated.sourceProgramId).toBe(t.id);
    expect(updated.clientStartedAtMs).toBe(START);
    expect(updated.name).toBe("Block v2");
    expect(updated.description).toBe("now 4 weeks");
    expect(updated.weeks).toHaveLength(4);
    expect(updated.lengthWeeks).toBe(4);
    expect(getProgramProgress(updated, START + 8 * DAY)).toEqual({ status: "running", weekNumber: 2 });
  });

  it("copies one week over another", () => {
    const t = template();
    const out = copyWeekOver(t, t.weeks[0].id, t.weeks[2].id);
    expect(out.weeks[2].days).toHaveLength(1);
    expect(out.weeks[2].days[0].name).toBe("Upper");
    expect(out.weeks[2].days[0].id).not.toBe(t.weeks[0].days[0].id);
    expect(out.weeks[2].id).toBe(t.weeks[2].id);
    expect(out.weeks[2].weekNumber).toBe(3);
    expect(copyWeekOver(t, t.weeks[0].id, t.weeks[0].id)).toBe(t);
  });
});

describe("set targets as text", () => {
  it("reads reps, ranges and AMRAP", () => {
    expect(parseRepsText("8")).toEqual({ reps: 8, repsMin: undefined, repsMax: undefined, setType: "normal" });
    expect(parseRepsText("8-10")).toMatchObject({ reps: undefined, repsMin: 8, repsMax: 10 });
    expect(parseRepsText("12–8")).toMatchObject({ repsMin: 8, repsMax: 12 });
    expect(parseRepsText("5 to 5")).toMatchObject({ reps: 5, repsMin: undefined });
    expect(parseRepsText("amrap")).toMatchObject({ setType: "amrap", reps: undefined });
    expect(parseRepsText("8", "amrap")).toMatchObject({ setType: "normal", reps: 8 });
    expect(parseRepsText("8", "warmup")).toMatchObject({ setType: "warmup" });
    expect(parseRepsText("")).toMatchObject({ reps: undefined });
    expect(parseRepsText("lots")).toBeNull();
  });

  it("writes reps back", () => {
    const base = { id: "s", orderIndex: 0, setType: "normal" as const };
    expect(repsText({ ...base, reps: 8 })).toBe("8");
    expect(repsText({ ...base, repsMin: 8, repsMax: 10 })).toBe("8–10");
    expect(repsText({ ...base, setType: "amrap" })).toBe("AMRAP");
    expect(repsText(base)).toBe("");
  });

  it("reads kilos and percentages", () => {
    expect(parseLoadText("60")).toEqual({ weight: 60, percent1RM: undefined });
    expect(parseLoadText("62,5 kg")).toEqual({ weight: 62.5, percent1RM: undefined });
    expect(parseLoadText("72%")).toEqual({ weight: undefined, percent1RM: 72 });
    expect(parseLoadText("")).toEqual({ weight: undefined, percent1RM: undefined });
    expect(parseLoadText("200%")).toBeNull();
    expect(parseLoadText("heavy")).toBeNull();
    const base = { id: "s", orderIndex: 0, setType: "normal" as const };
    expect(loadText({ ...base, percent1RM: 72 })).toBe("72%");
    expect(loadText({ ...base, weight: 60 })).toBe("60");
  });

  it("reads rest times", () => {
    expect(parseRestText("2:30")).toBe(150);
    expect(parseRestText("90")).toBe(90);
    expect(parseRestText("90s")).toBe(90);
    expect(parseRestText("2m")).toBe(120);
    expect(parseRestText("")).toBeUndefined();
    expect(parseRestText("soon")).toBeNull();
    expect(restText(150)).toBe("2:30");
    expect(restText(60)).toBe("1:00");
    expect(restText(undefined)).toBe("");
  });
});

describe("day and block edits", () => {
  function day3(): CoachProgram {
    let p = createCoachProgram("P");
    p = addDay(p, p.weeks[0].id, "Upper");
    const w = p.weeks[0].id;
    const d = p.weeks[0].days[0].id;
    for (const n of ["Bench", "Row", "Face pull", "Curl"]) p = addStrengthBlock(p, w, d, { exerciseName: n });
    return p;
  }
  const ids = (p: CoachProgram) => p.weeks[0].days[0].blocks.slice().sort((a, b) => a.orderIndex - b.orderIndex).map((b) => b.id);

  it("supersets label as A1/A2 and leave cleanly", () => {
    let p = day3();
    const [, row, face, curl] = ids(p);
    const w = p.weeks[0].id, d = p.weeks[0].days[0].id;
    p = supersetWithPrevious(p, w, d, face); // Row + Face pull
    p = supersetWithPrevious(p, w, d, curl); // joins: Row + Face pull + Curl
    let labels = supersetLabels(p.weeks[0].days[0]);
    expect([labels.get(row), labels.get(face), labels.get(curl)]).toEqual(["A1", "A2", "A3"]);
    p = leaveSuperset(p, w, d, face);
    p = leaveSuperset(p, w, d, curl);
    labels = supersetLabels(p.weeks[0].days[0]);
    expect(labels.size).toBe(0);
    expect(p.weeks[0].days[0].blocks.every((b) => !b.supersetGroup)).toBe(true);
  });

  it("the first block can't superset with nothing", () => {
    const p = day3();
    const [bench] = ids(p);
    const out = supersetWithPrevious(p, p.weeks[0].id, p.weeks[0].days[0].id, bench);
    expect(out.weeks[0].days[0].blocks.every((b) => !b.supersetGroup)).toBe(true);
  });

  it("moves blocks and renumbers", () => {
    let p = day3();
    const [bench, row] = ids(p);
    p = moveBlock(p, p.weeks[0].id, p.weeks[0].days[0].id, row, -1);
    expect(ids(p).slice(0, 2)).toEqual([row, bench]);
    expect(p.weeks[0].days[0].blocks.map((b) => b.orderIndex).sort()).toEqual([0, 1, 2, 3]);
  });

  it("updates a day's name and weekday", () => {
    let p = day3();
    p = updateDay(p, p.weeks[0].id, p.weeks[0].days[0].id, { name: "Push", weekday: 1 });
    expect(p.weeks[0].days[0]).toMatchObject({ name: "Push", weekday: 1 });
  });
});

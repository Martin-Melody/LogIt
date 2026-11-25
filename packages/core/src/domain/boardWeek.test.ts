import { describe, expect, it } from "vitest";
import { volumeVsUsual } from "./boardWeek";
import { allDone, boardPlaces, volumeText, type BoardRow } from "../api/boardsApi";

const day = 86_400_000;
const monday = Date.UTC(2026, 10, 23);

describe("the board's numbers", () => {
  it("compares volume per workout this week with the last four weeks", () => {
    const s = (offsetDays: number, volumeKg: number) => ({ startedAtMs: monday + offsetDays * day, volumeKg });
    expect(volumeVsUsual([s(-7, 10_000), s(-14, 10_000), s(1, 11_000)], monday)).toBe(10);
    expect(volumeVsUsual([s(-7, 10_000), s(-40, 99_000), s(1, 9_600)], monday)).toBe(-4); // older than four weeks doesn't count
    expect(volumeVsUsual([s(1, 9_000)], monday)).toBeNull(); // no usual yet
    expect(volumeVsUsual([s(-7, 9_000)], monday)).toBeNull(); // nothing this week
  });
  it("numbers the places, skipping rest weeks, and writes volume and all-done", () => {
    const r = (rest: boolean) => ({ rest }) as BoardRow;
    expect(boardPlaces([r(false), r(true), r(false)])).toEqual([1, null, 2]);
    expect([volumeText(6), volumeText(-4), volumeText(0), volumeText(null)]).toEqual(["+6%", "−4%", "0%", ""]);
    expect([allDone({ done: 4, planned: 4, rest: false }), allDone({ done: 3, planned: 4, rest: false }), allDone({ done: 0, planned: 0, rest: true })]).toEqual([true, false, false]);
  });
});

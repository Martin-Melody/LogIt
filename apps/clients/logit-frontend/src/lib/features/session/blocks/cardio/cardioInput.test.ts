import { describe, expect, it } from "vitest";
import { distanceInputValue, parseDistance, parseDuration } from "./cardioInput";

describe("parseDistance (bug hunt 13.1)", () => {
  it("reads a plain number as km, with a dot or a comma", () => {
    expect(parseDistance("3")).toBe(3000);
    expect(parseDistance("5,2")).toBe(5200);
    expect(parseDistance("5.2")).toBe(5200);
  });
  it("reads metres when asked for or when the number is too big for km", () => {
    expect(parseDistance("400 m")).toBe(400);
    expect(parseDistance("50m")).toBe(50);
    expect(parseDistance("400")).toBe(400);
    expect(parseDistance("2 km")).toBe(2000);
  });
  it("uses miles for lb users", () => {
    expect(parseDistance("3", "mi")).toBe(4828);
    expect(parseDistance("400", "mi")).toBe(400);
  });
  it("refuses nonsense", () => {
    expect(parseDistance("")).toBeNull();
    expect(parseDistance("abc")).toBeNull();
    expect(parseDistance("0")).toBeNull();
  });
  it("shows what it saved in a form that reads back the same", () => {
    for (const m of [50, 400, 3000, 5200]) expect(parseDistance(distanceInputValue(m))).toBe(m);
    expect(parseDistance(distanceInputValue(4828, "mi"), "mi")).toBe(4828);
  });
});

describe("parseDuration (bug hunt 13.2)", () => {
  it("reads a plain number as minutes", () => {
    expect(parseDuration("20")).toBe(20 * 60_000);
    expect(parseDuration("2.5")).toBe(150_000);
    expect(parseDuration("2,5")).toBe(150_000);
  });
  it("reads three to six digits like a clock, since the keypad has no colon", () => {
    expect(parseDuration("130")).toBe(90_000);
    expect(parseDuration("2000")).toBe(20 * 60_000);
    expect(parseDuration("13000")).toBe(90 * 60_000);
  });
  it("still reads m:ss and h:mm:ss", () => {
    expect(parseDuration("20:30")).toBe((20 * 60 + 30) * 1000);
    expect(parseDuration("1:05:00")).toBe(65 * 60_000);
  });
  it("refuses nonsense", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("a:b")).toBeNull();
  });
});

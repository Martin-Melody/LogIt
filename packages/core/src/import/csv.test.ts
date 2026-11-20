import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("reads quotes, commas, doubled quotes and line breaks inside quotes", () => {
    const text = '﻿a,b,c\r\n1,"grip wide, ""paused"" reps","line one\nline two"\n\n2,,x\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["1", 'grip wide, "paused" reps', "line one\nline two"],
      ["2", "", "x"],
    ]);
  });

  it("uses semicolons when the header does", () => {
    expect(parseCsv("date;exercise;weight\n2026-11-20;Squat;102,5")).toEqual([["date", "exercise", "weight"], ["2026-11-20", "Squat", "102,5"]]);
  });
});

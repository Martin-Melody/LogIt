import { describe, expect, it } from "vitest";
import { monthReportBody, monthReportFrom, parseMonthReport } from "./monthReport";

describe("a month sent to a client (canvas W7)", () => {
  const views = [
    { title: "Training", body: [{ kind: "stat-grid", stats: [{ label: "Sessions", value: "15 of 16" }, { label: "Records", value: "3" }] }] },
    { title: "Body", body: [{ kind: "stat-grid", stats: [{ label: "Weight, 7-day average", value: "71.8 → 70.9 kg" }, { label: "Progress photos", value: "3" }] }] },
    { title: "Food", body: [], empty: { text: "Nothing logged" } },
  ] as never;
  it("keeps the numbers, never photos, and leaves out empty cards", () => {
    const r = monthReportFrom("2026-11", "November", "  Brilliant month.  ", views);
    expect(r.sections.map((s) => s.title)).toEqual(["Training", "Body"]);
    expect(r.sections[1]!.stats.map((s) => s.label)).toEqual(["Weight, 7-day average"]);
    expect(r.note).toBe("Brilliant month.");
    expect(monthReportBody(r)).toBe("Your November: Brilliant month.");
  });
  it("reads only a well-formed card", () => {
    const r = monthReportFrom("2026-11", "November", "", views);
    expect(parseMonthReport(JSON.stringify(r))).toEqual(r);
    expect(parseMonthReport('{"v":1,"month":"Nov"}')).toBeNull();
    expect(parseMonthReport("nope")).toBeNull();
  });
});

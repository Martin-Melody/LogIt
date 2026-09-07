import { describe, expect, it } from "vitest";
import { classifyTrend } from "./progression";

const NOW = 1_000_000_000_000;
const recent = NOW - 3 * 86_400_000;

describe("classifyTrend", () => {
  it("new when fewer than 3 sessions", () => {
    expect(classifyTrend({ values: [100, 102], lastTrainedMs: recent, nowMs: NOW }).status).toBe("new");
  });

  it("detraining when last trained over 3 weeks ago", () => {
    const old = NOW - 30 * 86_400_000;
    expect(classifyTrend({ values: [100, 102, 104], lastTrainedMs: old, nowMs: NOW }).status).toBe("detraining");
  });

  it("progressing on a rising series", () => {
    const r = classifyTrend({ values: [100, 102, 104, 106, 108], lastTrainedMs: recent, nowMs: NOW });
    expect(r.status).toBe("progressing");
    expect(r.slopePctPerSession).toBeGreaterThan(0);
  });

  it("plateaued on a flat series with no recent PR", () => {
    const r = classifyTrend({ values: [110, 108, 109, 108, 109, 108], lastTrainedMs: recent, nowMs: NOW });
    expect(r.status).toBe("plateaued");
    expect(r.sessionsSincePr).toBeGreaterThanOrEqual(4);
  });

  it("regressing on a clearly falling series", () => {
    const r = classifyTrend({ values: [120, 116, 112, 108, 104], lastTrainedMs: recent, nowMs: NOW });
    expect(r.status).toBe("regressing");
  });

  it("a fresh PR beats a flat slope", () => {
    // last value is an all-time best → progressing even if the window slope is mild
    const r = classifyTrend({ values: [100, 100, 100, 100, 101], lastTrainedMs: recent, nowMs: NOW });
    expect(r.status).toBe("progressing");
    expect(r.sessionsSincePr).toBe(0);
  });
});

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

  describe("reasoning", () => {
    it("new/detraining verdicts carry high confidence — they're facts, not statistical inference", () => {
      const isNew = classifyTrend({ values: [100, 102], lastTrainedMs: recent, nowMs: NOW });
      expect(isNew.reasoning.confidence).toBe("high");
      expect(isNew.reasoning.verdict).toBe("new");
      expect(isNew.reasoning.inputs.sessionsAvailable).toBe(2);

      const old = NOW - 30 * 86_400_000;
      const detraining = classifyTrend({ values: [100, 102, 104], lastTrainedMs: old, nowMs: NOW });
      expect(detraining.reasoning.confidence).toBe("high");
      expect(detraining.reasoning.verdict).toBe("detraining");
      expect(detraining.reasoning.inputs.daysSinceLastTrained).toBe(30);
    });

    it("slope-based confidence scales with how many points were considered", () => {
      const few = classifyTrend({ values: [100, 102, 104], lastTrainedMs: recent, nowMs: NOW });
      expect(few.reasoning.confidence).toBe("low");

      const many = classifyTrend({
        values: [100, 101, 102, 103, 104, 105, 106, 107],
        lastTrainedMs: recent,
        nowMs: NOW,
      });
      expect(many.reasoning.confidence).toBe("high");
      expect(many.reasoning.inputs.pointsConsidered).toBe(8);
    });

    it("computed slope in the reasoning matches the returned slopePctPerSession", () => {
      const r = classifyTrend({ values: [120, 116, 112, 108, 104], lastTrainedMs: recent, nowMs: NOW });
      expect(r.reasoning.computed.slopePctPerSession).toBeCloseTo(r.slopePctPerSession, 1);
      expect(r.reasoning.verdict).toBe(r.status);
    });
  });
});

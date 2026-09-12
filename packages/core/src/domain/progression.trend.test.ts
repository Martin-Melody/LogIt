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

  describe("session-position fatigue adjustment", () => {
    it("does not adjust when sessionPositions is omitted", () => {
      const r = classifyTrend({ values: [100, 96, 100, 96, 100, 96], lastTrainedMs: recent, nowMs: NOW });
      expect(r.reasoning.inputs.fatigueCalibrated).toBe(false);
      expect(r.reasoning.computed.rawSlopePctPerSession).toBe(r.reasoning.computed.slopePctPerSession);
    });

    it("does not adjust when there aren't enough samples in both position groups", () => {
      // Only 2 "fresh" (position 0) readings — below MIN_FATIGUE_CALIBRATION_SAMPLES.
      const r = classifyTrend({
        values: [100, 96, 100, 96, 100, 96],
        sessionPositions: [0, 1, 0, 1, 1, 1],
        lastTrainedMs: recent,
        nowMs: NOW,
      });
      expect(r.reasoning.inputs.fatigueCalibrated).toBe(false);
      expect(r.reasoning.computed.fatigueDiscountPct).toBe(0);
    });

    it("credits later-in-session readings back toward fresh-equivalent once calibrated, avoiding a false regression", () => {
      // A lift consistently 100 when done first (position 0), consistently 90 when
      // done later (position 1) — a stable ~10% position effect, not real regression.
      // Alternating position with a flat underlying trend within each group.
      const values = [100, 90, 100, 90, 100, 90, 100, 90];
      const sessionPositions = [0, 1, 0, 1, 0, 1, 0, 1];

      const withoutContext = classifyTrend({ values, lastTrainedMs: recent, nowMs: NOW });
      const withContext = classifyTrend({ values, sessionPositions, lastTrainedMs: recent, nowMs: NOW });

      expect(withContext.reasoning.inputs.fatigueCalibrated).toBe(true);
      expect(withContext.reasoning.computed.fatigueDiscountPct).toBeGreaterThan(5);
      // Both raw readings are flat/alternating (no real trend either way) — the
      // adjustment shouldn't invent progression, just confirm there's no hidden
      // regression once the position effect is accounted for.
      expect(withoutContext.status).not.toBe("regressing");
      expect(withContext.status).not.toBe("regressing");
    });

    it("actually flips a false 'regressing' read caused entirely by a position switch", () => {
      // Six sessions done fresh (position 0) at a rising 100→105, oldest→newest. Then
      // the last two sessions get done last in the session (position 1) at the SAME
      // underlying capability (110, 112 — still rising) but read lower (99, 100.8)
      // due to the known ~10% position discount. Raw slope over the last 8 points looks
      // like a fall-off right at the end; the adjustment should recognise those last
      // two as position-explained and not call it regressing.
      const fresh = [100, 101, 102, 103, 104, 105];
      const lastTwoRaw = [99, 100.8]; // 110*0.9, 112*0.9 — same 10% discount as calibration will find
      const values = [...fresh, ...lastTwoRaw];
      const sessionPositions = [0, 0, 0, 0, 0, 0, 1, 1];

      // Need enough "fatigued" samples to calibrate — reuse a longer history where
      // the same stable 10% position effect shows up earlier too.
      const longerValues = [90, 100, 91, 101, 92, 102, ...values];
      const longerPositions = [1, 0, 1, 0, 1, 0, ...sessionPositions];

      const r = classifyTrend({
        values: longerValues,
        sessionPositions: longerPositions,
        lastTrainedMs: recent,
        nowMs: NOW,
      });

      expect(r.reasoning.inputs.fatigueCalibrated).toBe(true);
      expect(r.status).not.toBe("regressing");
    });
  });

  describe("comparableToCurrent regime filtering", () => {
    it("does not filter anything when comparableToCurrent is omitted", () => {
      const values = [100, 102, 104, 106, 108];
      const r = classifyTrend({ values, lastTrainedMs: recent, nowMs: NOW });
      expect(r.reasoning.inputs.excludedForRegimeChange).toBe(0);
    });

    it("excludes points marked false before fitting the slope or counting PRs", () => {
      // A big e1RM drop at a rep-range switch (index 3) — a real level shift, not
      // regression. Marked incomparable; the two points either side of it (both
      // in the "current" regime) are flat, so the trend should read plateaued,
      // not regressing.
      const values = [120, 121, 120, 90, 91, 90];
      const comparableToCurrent = [false, false, false, true, true, true];
      const r = classifyTrend({ values, comparableToCurrent, lastTrainedMs: recent, nowMs: NOW });
      expect(r.status).not.toBe("regressing");
      expect(r.reasoning.inputs.excludedForRegimeChange).toBe(3);
    });

    it("actually flips a false 'regressing' read caused entirely by a rep-range switch", () => {
      // Rising e1RM at the old rep range, then a switch drops the reading (lower
      // reps → less accurate/lower Epley estimate at the same true effort), then
      // flat-to-rising again at the new range. Naively this reads as a steep fall.
      const beforeSwitch = [100, 102, 104, 106];
      const afterSwitch = [85, 85, 86, 87, 88];
      const values = [...beforeSwitch, ...afterSwitch];
      // Switched for good — only the pre-switch points are the "different regime".
      const comparableToCurrent = [false, false, false, false, true, true, true, true, true];

      const withoutContext = classifyTrend({ values, lastTrainedMs: recent, nowMs: NOW });
      const withContext = classifyTrend({ values, comparableToCurrent, lastTrainedMs: recent, nowMs: NOW });

      expect(withoutContext.status).toBe("regressing");
      expect(withContext.status).not.toBe("regressing");
    });

    it("sessionPositions stays index-aligned with the filtered values, not the original array", () => {
      // Position-fatigue adjustment and regime filtering must compose: excluded
      // points' positions shouldn't shift the remaining points' alignment.
      const values = [100, 999, 90, 100, 90, 100, 90, 100, 90];
      const sessionPositions = [0, 0, 0, 1, 0, 1, 0, 1, 0];
      const comparableToCurrent = [true, false, true, true, true, true, true, true, true];

      const r = classifyTrend({
        values,
        sessionPositions,
        comparableToCurrent,
        lastTrainedMs: recent,
        nowMs: NOW,
      });
      // The excluded 999 outlier shouldn't be able to masquerade as a PR or drag
      // the slope — behaviour should match the same series with it simply absent.
      const equivalent = classifyTrend({
        values: [100, 90, 100, 90, 100, 90, 100, 90],
        sessionPositions: [0, 0, 1, 0, 1, 0, 1, 0],
        lastTrainedMs: recent,
        nowMs: NOW,
      });
      expect(r.status).toBe(equivalent.status);
      expect(r.reasoning.computed.slopePctPerSession).toBeCloseTo(equivalent.reasoning.computed.slopePctPerSession, 5);
    });
  });
});

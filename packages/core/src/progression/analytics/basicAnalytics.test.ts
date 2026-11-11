import { describe, it, expect } from "vitest";
import { basicAnalytics } from "./basicAnalytics";
import type { AnalyticsInput } from "../../domain/analytics";

const set = (reps: number, weight: number) => ({ id: `s${reps}${weight}`, setType: "normal" as const, reps, weight, orderIndex: 0 });

function input(name: string, weights: number[][]): AnalyticsInput {
  return {
    exercise: { name },
    history: weights.map((ws, i) => ({
      sessionId: `h${i}`,
      performedAtMs: i * 86_400_000,
      sets: ws.map((w) => set(8, w)),
    })),
  };
}

describe("basicAnalytics", () => {
  it("treats an untyped exercise with assisted (negative) sets as bodyweight work", async () => {
    const out = await basicAnalytics.compute(input("Dips", [[-25, 0], [-22.5, 2.5]]));
    const ids = out.metrics.map((m) => m.id);
    expect(ids).toContain("total_reps");
    expect(ids).not.toContain("total_volume");
  });

  it("never reports negative volume for weighted work", async () => {
    const out = await basicAnalytics.compute(input("Bench Press", [[60, 60], [62.5]]));
    const vol = out.metrics.find((m) => m.id === "total_volume")!;
    expect(vol.value).toBe(8 * 60 * 2 + 8 * 62.5);
  });
});

describe("basicAnalytics with a known bodyweight", () => {
  const withBw = (inp: AnalyticsInput, kg: number): AnalyticsInput => ({
    ...inp,
    history: inp.history.map((h) => ({ ...h, bodyweightKg: kg })),
  });

  it("charts bodyweight volume as reps × (bodyweight ± the logged number)", async () => {
    const out = await basicAnalytics.compute(withBw(input("Dips", [[-25, 0], [10]]), 90));
    const vol = out.metrics.find((m) => m.id === "total_volume")!;
    expect(vol.value).toBe(8 * 65 + 8 * 90 + 8 * 100);
    expect(out.series.find((s) => s.metricId === "total_volume")!.points.map((p) => p.value)).toEqual([8 * 65 + 8 * 90, 8 * 100]);
    expect(out.metrics.map((m) => m.id)).toContain("max_reps");
  });

  it("treats an untyped pull-up at 0 kg as bodyweight work", async () => {
    const out = await basicAnalytics.compute(withBw(input("Pull-Up", [[0, 0]]), 80));
    expect(out.metrics.find((m) => m.id === "total_volume")!.value).toBe(2 * 8 * 80);
    expect(out.metrics.map((m) => m.id)).not.toContain("max_weight");
  });

  it("subtracts the assistance for the assisted type", async () => {
    const base = input("Assisted Dip", [[30]]);
    const out = await basicAnalytics.compute(withBw({ ...base, exercise: { ...base.exercise, exerciseType: "assisted" } }, 90));
    expect(out.metrics.find((m) => m.id === "total_volume")!.value).toBe(8 * 60);
  });

  it("leaves volume out when no bodyweight is known", async () => {
    const out = await basicAnalytics.compute(input("Dips", [[-25]]));
    expect(out.metrics.map((m) => m.id)).not.toContain("total_volume");
  });
});

import { describe, expect, it } from "vitest";
import { learnedMuscleGroupInsight } from "./learnedMuscleGroupInsight";
import type { MuscleGroupInsightContributingExercise, MuscleGroupInsightWeek } from "@logit/core/domain/muscleGroupInsight";
import { weekBucket } from "@logit/core/domain/time";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

function weeksAgoTimestamp(weeksAgo: number): number {
  const now = Date.now();
  const daysSinceMonday = (new Date(now).getUTCDay() + 6) % 7;
  const thisMonday = now - daysSinceMonday * DAY;
  return thisMonday - weeksAgo * WEEK + DAY;
}

describe("learnedMuscleGroupInsight", () => {
  it("does not offer a volume insight with fewer than the minimum weeks of history", async () => {
    const weeks: MuscleGroupInsightWeek[] = [2, 1, 0].map((w) => ({
      weekBucket: weekBucket(weeksAgoTimestamp(w)),
      weightedSets: 3,
      sessionCount: 1,
    }));
    const contributingExercises: MuscleGroupInsightContributingExercise[] = [
      {
        exerciseName: "Bench",
        status: "plateaued",
        seriesPoints: [2, 1, 0].map((w) => ({ date: weeksAgoTimestamp(w), value: 100 })),
      },
    ];

    const output = await learnedMuscleGroupInsight.analyze({
      muscleGroup: "chest",
      weeks,
      contributingExercises,
      state: null,
      userPreferences: {},
      now: Date.now(),
    });

    expect(output.volumeInsight).toBeUndefined();
    expect(output.reasoning.confidence).toBe("low");
  });

  it("surfaces a volume insight once there's a clear, well-supported correlation", async () => {
    // 16 weeks: even weeks (high volume, 4 sets) improve the lift; odd weeks (low
    // volume, 1 set) don't — a clean, deliberately unambiguous split.
    const weeks: MuscleGroupInsightWeek[] = [];
    const points: { date: number; value: number }[] = [];
    let weight = 100;
    for (let w = 0; w < 16; w++) {
      const weeksAgo = 15 - w;
      const highVolume = w % 2 === 0;
      if (highVolume) weight += 2;
      weeks.push({ weekBucket: weekBucket(weeksAgoTimestamp(weeksAgo)), weightedSets: highVolume ? 4 : 1, sessionCount: 1 });
      points.push({ date: weeksAgoTimestamp(weeksAgo), value: weight });
    }
    const contributingExercises: MuscleGroupInsightContributingExercise[] = [
      { exerciseName: "Bench", status: "progressing", seriesPoints: points },
    ];

    const output = await learnedMuscleGroupInsight.analyze({
      muscleGroup: "chest",
      weeks,
      contributingExercises,
      state: null,
      userPreferences: {},
      now: Date.now(),
    });

    expect(output.volumeInsight).toBeDefined();
    expect(output.volumeInsight!.direction).toBe("higher");
    expect(output.reasoning.confidence).not.toBe("low");
  });

  it("passes state straight through as nextState (v1 is stateless)", async () => {
    const state = { anything: 1 };
    const output = await learnedMuscleGroupInsight.analyze({
      muscleGroup: "chest",
      weeks: [],
      contributingExercises: [],
      state,
      userPreferences: {},
      now: Date.now(),
    });
    expect(output.nextState).toBe(state);
  });
});

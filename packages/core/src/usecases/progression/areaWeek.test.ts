import { describe, expect, it } from "vitest";
import { areaWeekSec } from "./getMobilitySuggestion";
import type { WorkoutSession } from "../../domain/workout";

const block = (drillName: string, sets: { durationSec?: number; reps?: number; completed?: boolean }[], drillId?: string) =>
  ({ id: drillName, type: "mobility", orderIndex: 0, data: { drillName, ...(drillId ? { drillId } : {}), metric: "hold", perSide: false, sets: sets.map((s, i) => ({ id: `s${i}`, orderIndex: i, ...s })) } });

describe("areaWeekSec", () => {
  const now = new Date(2026, 10, 20, 18).getTime(); // Friday
  const monday = new Date(2026, 10, 16, 7).getTime();
  const lastWeek = new Date(2026, 10, 13, 7).getTime();
  const sessions = [
    { id: "a", startedAtMs: monday, blocks: [block("Lizard pose", [{ durationSec: 60, completed: true }, { durationSec: 60, completed: false }]), block("Pigeon pose", [{ durationSec: 90, completed: true }])] },
    { id: "b", startedAtMs: now, blocks: [block("Couch stretch", [{ durationSec: 45, completed: true }], "core:couch-stretch"), block("Standing hip flexor raise", [{ reps: 10, completed: true }])] },
    { id: "c", startedAtMs: lastWeek, blocks: [block("Lizard pose", [{ durationSec: 600, completed: true }])] },
  ] as unknown as WorkoutSession[];

  it("adds up this week's finished sets of every drill in the area, reps at 3 s each", () => {
    // Lizard 60 + Couch 45 + hip flexor raise 10 reps (30 s); not Pigeon (glutes), not last week.
    expect(areaWeekSec(sessions, "hip-flexors", now)).toBe(135);
    expect(areaWeekSec(sessions, "glutes", now)).toBe(90);
  });
});

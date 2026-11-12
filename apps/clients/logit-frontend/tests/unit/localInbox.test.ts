// The device's own notifications: which PRs and progression changes become one.
import { describe, expect, it } from "vitest";
import { prNotifications, progressionNotification } from "$lib/features/inbox/localInbox";

describe("prNotifications", () => {
  it("keeps weight and rep PRs and skips first-ever sets", () => {
    const out = prNotifications(
      [
        { exerciseName: "Bench Press", exerciseId: "b", weight: 100, reps: 5, kind: "weight" },
        { exerciseName: "Squat", weight: 120, reps: 8, kind: "reps" },
        { exerciseName: "Curl", weight: 12, reps: 10, kind: "first" },
      ],
      1000,
    );
    expect(out.map((n) => n.exerciseName)).toEqual(["Bench Press", "Squat"]);
    expect(out[0]).toMatchObject({ kind: "pr", prKind: "weight", weightKg: 100, reps: 5, read: false, exerciseId: "b" });
    expect(new Set(out.map((n) => n.id)).size).toBe(2);
  });
});

describe("progressionNotification", () => {
  const ex = { id: "b", name: "Bench Press" };

  it("is made for a raised target and for a deload", () => {
    expect(progressionNotification(ex, { kind: "increase", text: "+2.5 kg" }, 1)).toMatchObject({
      kind: "progression",
      exerciseName: "Bench Press",
      change: { kind: "increase", text: "+2.5 kg" },
    });
    expect(progressionNotification(ex, { kind: "deload", text: "Deload" }, 1)?.change.kind).toBe("deload");
  });

  it("is not made for smaller changes or none", () => {
    expect(progressionNotification(ex, { kind: "reps", text: "+1 rep" }, 1)).toBeNull();
    expect(progressionNotification(ex, { kind: "repeat", text: "Repeat" }, 1)).toBeNull();
    expect(progressionNotification(ex, undefined, 1)).toBeNull();
  });
});

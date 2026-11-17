// What follows a finished workout once onboarding has made a plan (src/lib/features/onboarding),
// and the reminder sentence (design canvas O5, O6).
import { beforeEach, describe, expect, it } from "vitest";
import { afterWorkoutRoute, markFirstWorkoutPending, markSaveAsked } from "$lib/features/onboarding/afterWorkout";
import { mondayFirst, reminderSentence } from "$lib/features/onboarding/workoutReminders";
import { setActiveOwnerId } from "$lib/data/activeOwner";

beforeEach(() => {
  localStorage.clear();
  setActiveOwnerId(null);
});

describe("after a workout", () => {
  it("the first workout of a plan goes to 'When will you train?', once", () => {
    markFirstWorkoutPending();
    expect(afterWorkoutRoute("s1", 0)).toBe("/onboarding/first-workout?id=s1");
    expect(afterWorkoutRoute("s2", 1)).toBe("/");
  });

  it("without a plan from onboarding it goes home", () => {
    expect(afterWorkoutRoute("s1", 0)).toBe("/");
  });

  it("'Not now' to saving comes back once, after workout 3, then never", () => {
    markSaveAsked();
    expect(afterWorkoutRoute("s2", 1)).toBe("/");
    expect(afterWorkoutRoute("s3", 2)).toBe("/onboarding/first-workout?id=s3&save=again");
    markSaveAsked();
    expect(afterWorkoutRoute("s3", 2)).toBe("/");
    expect(afterWorkoutRoute("s9", 8)).toBe("/");
  });

  it("is per account", () => {
    setActiveOwnerId("a");
    markFirstWorkoutPending();
    setActiveOwnerId("b");
    expect(afterWorkoutRoute("s1", 0)).toBe("/");
    setActiveOwnerId("a");
    expect(afterWorkoutRoute("s1", 0)).toBe("/onboarding/first-workout?id=s1");
  });
});

describe("the reminder sentence", () => {
  it("lists the days Monday first, at the time", () => {
    expect(reminderSentence([5, 1, 4, 2], "07:00")).toBe("I'll train Mon, Tue, Thu and Fri at 7:00.");
    expect(reminderSentence([0, 6], "18:30")).toBe("I'll train Sat and Sun at 18:30.");
    expect(reminderSentence([3], "06:00")).toBe("I'll train Wed at 6:00.");
    expect(mondayFirst([0, 1, 6])).toEqual([1, 6, 0]);
  });
});

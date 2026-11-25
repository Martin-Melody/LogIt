import { describe, expect, it } from "vitest";
import { cardTitle, readCard, readGroupInvite, readStoryPhoto, readStoryQuote, recordCard } from "./messageCard";

describe("message cards", () => {
  it("reads a record and a workout, and nothing broken", () => {
    const r = readCard("PersonalRecord", recordCard({ exerciseName: "Squat", weight: 107.5, reps: 3, atMs: 1 }))!;
    expect(cardTitle(r)).toBe("Squat 107.5 kg × 3");
    const w = readCard("WorkoutSession", JSON.stringify({ name: "Lower A", duration: 52 * 60_000, exercises: [{ name: "Squat", sets: 4 }] }))!;
    expect(cardTitle(w)).toBe("Lower A · 52 min · 1 exercise");
    expect(readCard("WorkoutSession", "not json")).toBeNull();
    expect(readCard("Algorithm", "{}")).toBeNull();
    expect(readCard("PersonalRecord", "{}")).toBeNull();
  });

  it("reads a story reply's quote, and nothing once the story has gone", () => {
    const q = JSON.stringify({ storyId: "s1", type: "PersonalRecord", data: { exerciseName: "Squat", weight: 110, reps: 3 }, expiresAtMs: 1 });
    expect(cardTitle(readStoryQuote(q)!)).toBe("Squat 110 kg × 3");
    expect(readStoryQuote(JSON.stringify({ storyId: "s1" }))).toBeNull(); // still sending
    expect(readStoryQuote(null)).toBeNull();
  });

  it("reads a photo story's quoted photo, with or without a card", () => {
    const q = JSON.stringify({ storyId: "s1", type: "", data: null, photoUrl: "/photos/abc", photoWidth: 900, photoHeight: 1600, expiresAtMs: 1 });
    expect(readStoryPhoto(q)).toEqual({ url: "/photos/abc", width: 900, height: 1600 });
    expect(readStoryQuote(q)).toBeNull();
    expect(readStoryPhoto(JSON.stringify({ storyId: "s1" }))).toBeNull();
  });

  it("reads a group invite, and nothing while it's still sending", () => {
    expect(readGroupInvite(JSON.stringify({ groupId: "g1", name: "Iron Club", kind: "Gym", members: 14 }))).toEqual({ groupId: "g1", name: "Iron Club", kind: "Gym", place: null, photoUrl: null, members: 14 });
    expect(readGroupInvite(JSON.stringify({ groupId: "g1" }))).toBeNull();
  });
});

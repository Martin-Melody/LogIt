import { describe, expect, it } from "vitest";
import { howToFor, parseVideoLink, videoEmbedUrl } from "./howTo";

describe("how-tos (6.12)", () => {
  it("takes YouTube and Vimeo links with a start time, and nothing else", () => {
    expect(parseVideoLink("https://youtu.be/dQw4w9WgXcQ?t=45")).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ", startSec: 45 });
    expect(parseVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s")).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ", startSec: 65 });
    expect(parseVideoLink("https://vimeo.com/76979871#t=12")).toEqual({ provider: "vimeo", id: "76979871", startSec: 12 });
    expect(parseVideoLink("https://example.com/clip.mp4")).toBeNull();
    expect(videoEmbedUrl({ provider: "vimeo", id: "76979871" })).toContain("dnt=1");
    expect(videoEmbedUrl({ provider: "youtube", id: "dQw4w9WgXcQ", startSec: 45 })).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=45");
  });

  it("the coach's how-to wins, LogIt's fills the rest", () => {
    const goblet = { id: "core_goblet_squat", cues: ["a", "b", "c"], isCore: true, videoUrl: undefined };
    expect(howToFor("Goblet Squat", goblet)).toMatchObject({ from: "logit", cues: ["a", "b", "c"], mistake: expect.stringMatching(/Heels lifting/) });
    const coach = [{ exerciseName: "goblet squat", note: "Go as deep as you can with a flat back." }];
    expect(howToFor("Goblet Squat", goblet, coach)).toMatchObject({ from: "coach", cues: ["a", "b", "c"], note: "Go as deep as you can with a flat back." });
  });
});

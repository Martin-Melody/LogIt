import { describe, expect, it } from "vitest";
import { peaksFrom, voiceTime } from "./voiceApi";

describe("voice messages", () => {
  it("turns loudness into a waveform of digits, the loudest as 9", () => {
    expect(peaksFrom([0, 0.5, 1, 0.25], 4)).toBe("0592");
    expect(peaksFrom([0.2, 0.4, 0.1, 0.4, 0.8, 0.8], 3)).toBe("559");
    expect(peaksFrom([], 32)).toBe("");
    expect(peaksFrom(Array(500).fill(0.3)).length).toBe(32);
  });
  it("shows the length as m:ss", () => {
    expect(voiceTime(11_000)).toBe("0:11");
    expect(voiceTime(60_000)).toBe("1:00");
    expect(voiceTime(800)).toBe("0:01");
  });
});

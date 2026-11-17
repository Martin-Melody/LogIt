// Settings › Sounds (src/lib/features/sound/sounds.ts).
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SOUND_SETTINGS, getSoundSettings, playSound, setSoundSettings } from "$lib/features/sound/sounds";
import { setActiveOwnerId } from "$lib/data/activeOwner";

beforeEach(() => {
  localStorage.clear();
  setActiveOwnerId(null);
});

describe("sound settings", () => {
  it("start with timers and celebrations on, taps off, vibration on", () => {
    expect(getSoundSettings()).toEqual({ timers: true, celebrations: true, taps: false, volume: 70, vibration: true });
    expect(DEFAULT_SOUND_SETTINGS.taps).toBe(false);
  });

  it("are kept per account", () => {
    setActiveOwnerId("a");
    setSoundSettings({ ...DEFAULT_SOUND_SETTINGS, timers: false });
    setActiveOwnerId("b");
    expect(getSoundSettings().timers).toBe(true);
    setActiveOwnerId("a");
    expect(getSoundSettings().timers).toBe(false);
  });

  it("playing with no audio device available doesn't throw", () => {
    expect(() => playSound("rest")).not.toThrow();
    expect(() => playSound("tap", { preview: true })).not.toThrow();
  });
});

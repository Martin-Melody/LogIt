import { describe, expect, it, vi } from "vitest";
vi.mock("$lib/components/ui/sonner/index", () => ({ toast: { error: vi.fn() } }));
import { clock, quietSummary } from "./pushSettings.svelte";

describe("quiet mode summary", () => {
  it("reads like the mock-up", () => {
    expect(quietSummary({ quietDays: 127, quietFromMinute: 1320, quietToMinute: 420 })).toBe("Every night, 22:00 to 07:00");
    expect(quietSummary({ quietDays: 0b10011, quietFromMinute: 1380, quietToMinute: 390 })).toBe("Mon, Tue and Fri, 23:00 to 06:30");
    expect(clock(5)).toBe("00:05");
  });
});

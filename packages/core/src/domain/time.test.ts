import { describe, expect, it } from "vitest";
import { weekBucket } from "./time";

describe("weekBucket", () => {
  it("groups timestamps within the same Mon–Sun week into the same bucket", () => {
    const monday = Date.UTC(2026, 8, 7); // 2026-09-07 is a Monday
    const wednesday = monday + 2 * 86_400_000;
    const sunday = monday + 6 * 86_400_000 + 23 * 3_600_000;
    expect(weekBucket(monday)).toBe(weekBucket(wednesday));
    expect(weekBucket(monday)).toBe(weekBucket(sunday));
  });

  it("puts the following Monday in the next bucket", () => {
    const monday = Date.UTC(2026, 8, 7);
    const nextMonday = monday + 7 * 86_400_000;
    expect(weekBucket(nextMonday)).toBe(weekBucket(monday) + 1);
  });
});

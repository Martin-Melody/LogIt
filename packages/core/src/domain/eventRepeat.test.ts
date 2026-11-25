import { describe, expect, it } from "vitest";
import { repeatDates, repeatLabel } from "./eventRepeat";

const days = (list: { startsAt: Date }[]) => list.map((x) => `${x.startsAt.getDate()}/${x.startsAt.getMonth() + 1} ${x.startsAt.getHours()}:${String(x.startsAt.getMinutes()).padStart(2, "0")}`);

describe("repeating events", () => {
  it("gives every Tue and Thu from the first day until the last, keeping the local time", () => {
    // Tue 2 Dec 2025 to Thu 11 Dec 2025
    const out = repeatDates({ firstDay: "2025-12-02", from: "19:00", to: "20:30", days: [2, 4], every: 1, until: "2025-12-11" });
    expect(days(out)).toEqual(["2/12 19:00", "4/12 19:00", "9/12 19:00", "11/12 19:00"]);
    expect(out[0]!.endsAt!.getHours()).toBe(20);
  });
  it("skips every other week, counted from the first day's week, and keeps 7pm across the clock change", () => {
    // Sat 21 Mar 2026 every 2 weeks to 18 Apr (Irish clocks go forward on 29 Mar)
    const out = repeatDates({ firstDay: "2026-03-21", from: "19:00", days: [6], every: 2, until: "2026-04-18" });
    expect(days(out)).toEqual(["21/3 19:00", "4/4 19:00", "18/4 19:00"]);
  });
  it("ends past midnight on the next day, and stops at the cap", () => {
    const [late] = repeatDates({ firstDay: "2025-12-05", from: "22:00", to: "01:00", days: [5], every: 1, until: "2025-12-05" });
    expect(late!.endsAt!.getDate()).toBe(6);
    expect(repeatDates({ firstDay: "2025-01-01", from: "07:00", days: [0, 1, 2, 3, 4, 5, 6], every: 1, until: "2026-12-31" }, 120)).toHaveLength(120);
  });
  it("names the pattern", () => {
    expect(repeatLabel([4, 2], 1)).toBe("Every Tue and Thu");
    expect(repeatLabel([6], 2)).toBe("Every 2 weeks on Sat");
    expect(repeatLabel([0, 1, 3], 1)).toBe("Every Mon, Wed and Sun");
  });
});

import { describe, expect, it } from "vitest";
import { parseProfileData, shownCards } from "./profileCards";

describe("profileCards", () => {
  it("shows switched-on cards with something in them, in order", () => {
    const d = parseProfileData(JSON.stringify({
      widgets: [
        { id: "profile-personal-records", enabled: true, order: 1 },
        { id: "profile-active-split", enabled: true, order: 0 },
        { id: "profile-body-stats", enabled: false, order: 2 },
        { id: "profile-weight-trend", enabled: true, order: 3 },
        { id: "someone-elses-plugin", enabled: true, order: 4 },
      ],
      activeSplit: { name: "PPL", days: [] },
      personalRecords: [{ exerciseName: "Squat", weight: 140, reps: 3 }],
      bodyStats: { height: 174, heightUnit: "cm", weight: 91, weightUnit: "kg" },
      weightTrend: { points: [{ dateIso: "2026-11-01", kg: 90 }] },
    }));
    expect(shownCards(d)).toEqual(["split", "prs"]);
    expect(shownCards(parseProfileData("not json"))).toEqual([]);
  });
});

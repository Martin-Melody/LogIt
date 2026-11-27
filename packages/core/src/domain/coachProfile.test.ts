import { describe, expect, it } from "vitest";
import { whereText } from "./coachProfile";

describe("whereText", () => {
  it("says where a coach coaches", () => {
    expect(whereText({ mode: "online", place: "Cork" })).toBe("Online");
    expect(whereText({ mode: "inperson", place: " Cork " })).toBe("In person in Cork");
    expect(whereText({ mode: "inperson", place: null })).toBe("In person");
    expect(whereText({ mode: "both", place: "Iron Gym" })).toBe("Online and in Iron Gym");
    expect(whereText({ mode: "both", place: "" })).toBe("Online and in person");
  });
});

import { describe, expect, it } from "vitest";
import { gatherSeries, goingLine, type GroupEvent } from "./eventsApi";

const p = (username: string) => ({ id: username, username, displayName: username[0]!.toUpperCase() + username.slice(1), avatarUrl: null });

describe("who's going", () => {
  it("names a couple and counts the rest, you as You", () => {
    expect(goingLine({ going: 0, goingPeople: [] }, "ava")).toBe("Nobody's said they're going yet");
    expect(goingLine({ going: 1, goingPeople: [p("riya")] }, "ava")).toBe("Riya is going");
    expect(goingLine({ going: 1, goingPeople: [p("ava")] }, "ava")).toBe("You are going");
    expect(goingLine({ going: 2, goingPeople: [p("ava"), p("riya")] }, "ava")).toBe("You and Riya are going");
    expect(goingLine({ going: 6, goingPeople: [p("riya"), p("dev"), p("conor")] }, "ava")).toBe("Riya, Dev and 4 others going");
  });
});

describe("repeating events in a list", () => {
  it("shows each series once, at its next date, with the rest under it", () => {
    const ev = (id: string, seriesId: string | null) => ({ id, seriesId }) as GroupEvent;
    const out = gatherSeries([ev("a1", "a"), ev("x", null), ev("a2", "a"), ev("b1", "b"), ev("a3", "a")]);
    expect(out.map((g) => [g.event.id, g.dates.map((d) => d.id)])).toEqual([["a1", ["a2", "a3"]], ["x", []], ["b1", []]]);
  });
});

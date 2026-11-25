import { describe, expect, it } from "vitest";
import { goingLine } from "./eventsApi";

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

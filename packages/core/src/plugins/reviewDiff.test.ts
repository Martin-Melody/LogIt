import { describe, expect, it } from "vitest";
import { aroundChanges, lineDiff } from "./reviewDiff";

describe("lineDiff", () => {
  it("marks changed lines and keeps the rest", () => {
    const d = lineDiff("a\nb\nc\nd", "a\nB\nc\nd\ne")!;
    expect(d.map((l) => `${l.kind}:${l.text}`)).toEqual(["same:a", "del:b", "add:B", "same:c", "same:d", "add:e"]);
  });

  it("handles empty sides", () => {
    expect(lineDiff("", "x")!.map((l) => l.kind)).toEqual(["del", "add"]);
    expect(lineDiff("x", "x")!.every((l) => l.kind === "same")).toBe(true);
  });

  it("gives up on files too big to compare", () => {
    const big = Array.from({ length: 2500 }, (_, n) => `line ${n}`).join("\n");
    expect(lineDiff(big, big)).toBeNull();
  });
});

describe("aroundChanges", () => {
  it("folds unchanged stretches into gaps", () => {
    const old = Array.from({ length: 20 }, (_, n) => `${n}`).join("\n");
    const next = old.replace("\n10\n", "\nten\n");
    const shown = aroundChanges(lineDiff(old, next)!, 2);
    expect(shown[0]).toEqual({ kind: "gap", hidden: 8 });
    expect(shown.filter((l) => l.kind !== "gap").map((l) => ("text" in l ? l.text : ""))).toEqual(["8", "9", "10", "ten", "11", "12"]);
    expect(shown[shown.length - 1]).toEqual({ kind: "gap", hidden: 7 });
  });
});

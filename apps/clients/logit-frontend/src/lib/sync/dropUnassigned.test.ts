import { describe, expect, it, vi } from "vitest";
vi.mock("$app/environment", () => ({ browser: false }));
import { dropUnassigned } from "./syncService";

describe("dropUnassigned", () => {
  it("removes what the coach no longer assigns (coaching stopped) and keeps the rest", async () => {
    const removed: string[] = [];
    await dropUnassigned([{ id: "prog_a" }, { id: "prog_b" }], ["prog_b"], async (id) => void removed.push(id), "test");
    expect(removed).toEqual(["prog_a"]);
  });
  it("an empty list (no coach any more) removes everything", async () => {
    const removed: string[] = [];
    await dropUnassigned([{ id: "x" }, { id: "y" }], [], async (id) => void removed.push(id), "test");
    expect(removed).toEqual(["x", "y"]);
  });
});

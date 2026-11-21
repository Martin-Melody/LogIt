// The web starts on the bundled algorithm like a new phone profile does; a beginner's best
// lifts and planned weights depended on it (bug hunt 2026-11-21).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({ browser: true }));
import { createLocalProgressionRepo } from "$lib/data/progressionRepo.local";
import { DEFAULT_PROGRESSION_ALGORITHM_ID } from "@logit/core/progression/localAlgorithmRegistry";

beforeEach(() => localStorage.clear());

describe("web progression default", () => {
  it("a new browser gets the default algorithm", async () => {
    expect((await createLocalProgressionRepo().getConfig())?.algorithmId).toBe(DEFAULT_PROGRESSION_ALGORITHM_ID);
  });

  it("turning suggestions off stays off", async () => {
    await createLocalProgressionRepo().clearConfig();
    expect(await createLocalProgressionRepo().getConfig()).toBeNull();
  });

  it("a chosen algorithm is kept", async () => {
    localStorage.setItem("logit:progression:config:v1", JSON.stringify({ algorithmId: "linear-progression" }));
    expect((await createLocalProgressionRepo().getConfig())?.algorithmId).toBe("linear-progression");
  });
});

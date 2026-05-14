import { test, expect, type Page } from "@playwright/test";

// ── Factories ─────────────────────────────────────────────────────────────────

function makeSet(id: string, orderIndex: number, reps: number, weight: number) {
  return { id, setType: "normal", reps, weight, orderIndex, completed: true };
}

function makeStrengthBlock(
  id: string,
  exerciseName: string,
  sets: object[],
  exerciseId?: string,
) {
  return {
    id,
    type: "strength",
    orderIndex: 0,
    data: { exerciseName, exerciseId, sets },
  };
}

function makeCompletedSession(id: string, block: object) {
  const now = Date.now();
  return {
    id,
    startedAtMs: now - 86_400_000,
    endedAtMs: now - 83_000_000,
    blocks: [block],
  };
}

function makeDraftSession(block: object) {
  return {
    id: "current-sess",
    startedAtMs: Date.now() - 600_000,
    blocks: [block],
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

type SeedOpts = {
  draft: object;
  history?: object[];
  progressionState?: {
    key: string;
    exerciseName: string;
    workingWeight: number;
    failedAttempts?: number;
  };
};

async function seed(page: Page, opts: SeedOpts) {
  await page.addInitScript((o) => {
    localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
    localStorage.setItem(
      "logit:tours:v1",
      JSON.stringify({ home: true, session: true, splits: true }),
    );
    localStorage.setItem(
      "logit:profile:v1",
      JSON.stringify({ blocksCollapsedByDefault: false }),
    );
    localStorage.setItem("logit:progression:config:v1", JSON.stringify({ algorithmId: "linear-progression" }));
    localStorage.setItem("logit:draft:v1", JSON.stringify(o.draft));

    if (o.history) {
      localStorage.setItem("logit:sessions:v1", JSON.stringify(o.history));
    }

    if (o.progressionState) {
      const s = o.progressionState;
      localStorage.setItem(
        "logit:progression:states:v1",
        JSON.stringify({
          [s.key]: {
            key: s.key,
            exerciseName: s.exerciseName,
            algorithmId: "linear-progression",
            state: {
              workingWeight: s.workingWeight,
              failedAttempts: s.failedAttempts ?? 0,
              increment: 2.5,
              repRange: [5, 8],
            },
            updatedAtMs: Date.now() - 100_000,
          },
        }),
      );
    }
  }, opts);
}

async function goToSession(page: Page) {
  await page.goto("/session/current");
  await page.waitForLoadState("networkidle");
}

// ── Target label helpers ──────────────────────────────────────────────────────

/** Waits for any Target: label and returns its text. */
async function getTargetText(page: Page): Promise<string> {
  const el = page.getByText(/Target:/);
  await expect(el).toBeVisible({ timeout: 5_000 });
  return el.textContent() ?? "";
}

// ── History lookup — name fallback ────────────────────────────────────────────

test.describe("progression history — name fallback", () => {
  test("uses history from past session with a different exerciseId", async ({ page }) => {
    // Past session has "Pec Deck" saved under OLD_ID.
    // Current draft has "Pec Deck" under NEW_ID (different — as if re-created).
    // Bug before fix: history lookup failed because IDs didn't match.
    const OLD_ID = "exdb_old_pec_deck";
    const NEW_ID = "exdb_new_pec_deck";

    const historySets = [
      makeSet("hs1", 0, 6, 80),
      makeSet("hs2", 1, 6, 80),
      makeSet("hs3", 2, 6, 80),
    ];

    await seed(page, {
      draft: makeDraftSession(makeStrengthBlock("b1", "Pec Deck", [], NEW_ID)),
      history: [
        makeCompletedSession(
          "hist-sess-1",
          makeStrengthBlock("pb1", "Pec Deck", historySets, OLD_ID),
        ),
      ],
    });
    await goToSession(page);

    // Should seed from history (80kg), not the default 20kg.
    const target = await getTargetText(page);
    expect(target).toContain("80kg");
    expect(target).not.toContain("20kg");
  });

  test("uses history from past session that had no exerciseId (split-generated block)", async ({
    page,
  }) => {
    // Split-generated sessions store blocks without exerciseId.
    // Ad-hoc blocks always have an exerciseId. The lookup must still match by name.
    const historySets = [
      makeSet("hs1", 0, 7, 60),
      makeSet("hs2", 1, 7, 60),
      makeSet("hs3", 2, 7, 60),
    ];

    await seed(page, {
      draft: makeDraftSession(
        makeStrengthBlock("b1", "Overhead Press", [], "ex_core_ohp"),
      ),
      history: [
        makeCompletedSession(
          "hist-sess-1",
          // no exerciseId — as created by startSessionFromSplitDay with no id on block
          makeStrengthBlock("pb1", "Overhead Press", historySets, undefined),
        ),
      ],
    });
    await goToSession(page);

    const target = await getTargetText(page);
    expect(target).toContain("60kg");
    expect(target).not.toContain("20kg");
  });

  test("uses history across multiple sessions with mismatched ids, taking the most recent", async ({
    page,
  }) => {
    // Two past sessions: older at 60kg, newer at 70kg (different IDs both).
    // Should seed from the most recent (70kg).
    const older = makeCompletedSession(
      "hist-old",
      makeStrengthBlock(
        "pb1",
        "Romanian Deadlift",
        [makeSet("s1", 0, 6, 60), makeSet("s2", 1, 6, 60), makeSet("s3", 2, 6, 60)],
        "exdb_rdl_v1",
      ),
    );
    // Make the older session actually older
    (older as any).endedAtMs = Date.now() - 172_800_000;
    (older as any).startedAtMs = Date.now() - 180_000_000;

    const newer = makeCompletedSession(
      "hist-new",
      makeStrengthBlock(
        "pb2",
        "Romanian Deadlift",
        [makeSet("s1", 0, 6, 70), makeSet("s2", 1, 6, 70), makeSet("s3", 2, 6, 70)],
        "exdb_rdl_v2",
      ),
    );

    await seed(page, {
      draft: makeDraftSession(
        makeStrengthBlock("b1", "Romanian Deadlift", [], "exdb_rdl_v3"),
      ),
      history: [older, newer],
    });
    await goToSession(page);

    const target = await getTargetText(page);
    expect(target).toContain("70kg");
  });
});

// ── State recovery — stale 20 kg default ──────────────────────────────────────

test.describe("progression state — stale default recovery", () => {
  test("history weight overrides a stale 20kg saved state", async ({ page }) => {
    // The saved state has workingWeight: 20 because when it was written, history
    // lookup failed (ID mismatch). History now shows the real working weight.
    const historySets = [
      makeSet("hs1", 0, 6, 100),
      makeSet("hs2", 1, 6, 100),
      makeSet("hs3", 2, 6, 100),
    ];

    await seed(page, {
      draft: makeDraftSession(
        makeStrengthBlock("b1", "Squat", [], "exdb_squat_new"),
      ),
      history: [
        makeCompletedSession(
          "hist-1",
          makeStrengthBlock("pb1", "Squat", historySets, "exdb_squat_old"),
        ),
      ],
      // Stale state saved under new ID — workingWeight stuck at default.
      progressionState: {
        key: "exdb_squat_new",
        exerciseName: "Squat",
        workingWeight: 20,
      },
    });
    await goToSession(page);

    const target = await getTargetText(page);
    expect(target).toContain("100kg");
    expect(target).not.toContain("20kg");
  });

  test("legitimate low working weight is not overridden when history matches", async ({ page }) => {
    // User genuinely trains at 30kg. State correctly says 30kg, history also
    // shows 30kg. Should not be bumped up to anything else.
    const historySets = [
      makeSet("hs1", 0, 6, 30),
      makeSet("hs2", 1, 6, 30),
      makeSet("hs3", 2, 6, 30),
    ];

    const EXERCISE_ID = "ex_core_ohp";

    await seed(page, {
      draft: makeDraftSession(
        makeStrengthBlock("b1", "Overhead Press", [], EXERCISE_ID),
      ),
      history: [
        makeCompletedSession(
          "hist-1",
          makeStrengthBlock("pb1", "Overhead Press", historySets, EXERCISE_ID),
        ),
      ],
      progressionState: {
        key: EXERCISE_ID,
        exerciseName: "Overhead Press",
        workingWeight: 30,
      },
    });
    await goToSession(page);

    const target = await getTargetText(page);
    expect(target).toContain("30kg");
  });
});

// ── State key fallback — name key → id key migration ─────────────────────────

test.describe("progression state — name key fallback", () => {
  test("finds state saved under name key when current exercise has an id", async ({ page }) => {
    // State was originally saved with key = name (no exerciseId at the time).
    // Now the exercise has an id. Should find the name-keyed state.
    await seed(page, {
      draft: makeDraftSession(
        makeStrengthBlock("b1", "Bench Press", [], "ex_core_bench"),
      ),
      progressionState: {
        key: "bench press",     // name-based key — written before exerciseId existed
        exerciseName: "Bench Press",
        workingWeight: 120,
      },
    });
    await goToSession(page);

    const target = await getTargetText(page);
    expect(target).toContain("120kg");
  });
});

// ── Correct progression still works end-to-end ───────────────────────────────

test.describe("progression — correct behaviour unchanged", () => {
  test("shows default 20kg when there is genuinely no history", async ({ page }) => {
    await seed(page, {
      draft: makeDraftSession(
        makeStrengthBlock("b1", "Farmers Carry", [], "exdb_farmers"),
      ),
    });
    await goToSession(page);

    const target = await getTargetText(page);
    expect(target).toContain("20kg");
  });

  test("shows 'Next: Xkg' when last session hit the rep ceiling", async ({ page }) => {
    const EXERCISE_ID = "ex_core_bench";
    const ceilingSets = [
      makeSet("s1", 0, 8, 100),
      makeSet("s2", 1, 8, 100),
      makeSet("s3", 2, 8, 100),
    ];

    await seed(page, {
      draft: makeDraftSession(
        makeStrengthBlock("b1", "Bench Press", [], EXERCISE_ID),
      ),
      history: [
        makeCompletedSession(
          "hist-1",
          makeStrengthBlock("pb1", "Bench Press", ceilingSets, EXERCISE_ID),
        ),
      ],
      progressionState: {
        key: EXERCISE_ID,
        exerciseName: "Bench Press",
        workingWeight: 100,
      },
    });
    await goToSession(page);

    // Ceiling hit → next increment shown in label
    await expect(page.getByText(/Next: 102\.5kg/)).toBeVisible();
  });

  test("shows 'Deload next' after two consecutive failures", async ({ page }) => {
    const EXERCISE_ID = "ex_core_squat";
    const failureSets = [
      makeSet("s1", 0, 3, 100),
      makeSet("s2", 1, 4, 100),
      makeSet("s3", 2, 3, 100),
    ];

    await seed(page, {
      draft: makeDraftSession(
        makeStrengthBlock("b1", "Squat", [], EXERCISE_ID),
      ),
      history: [
        makeCompletedSession(
          "hist-1",
          makeStrengthBlock("pb1", "Squat", failureSets, EXERCISE_ID),
        ),
      ],
      progressionState: {
        key: EXERCISE_ID,
        exerciseName: "Squat",
        workingWeight: 100,
        failedAttempts: 1, // second failure triggers deload
      },
    });
    await goToSession(page);

    await expect(page.getByText(/Deload next: 90kg/)).toBeVisible();
  });
});

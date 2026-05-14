import { test, expect, type Page } from "@playwright/test";

// ── Test data factories ───────────────────────────────────────────────────────

function makeSession(blocks: object[] = []) {
  return {
    id: "sess-test",
    startedAtMs: Date.now() - 600_000,
    blocks,
  };
}

function makeStrengthBlock(
  id: string,
  orderIndex: number,
  exerciseName: string,
  sets: object[] = [],
) {
  return {
    id,
    type: "strength",
    orderIndex,
    data: { exerciseName, sets },
  };
}

function makeSet(id: string, orderIndex: number, reps: number, weight: number, setType = "normal") {
  return { id, setType, reps, weight, orderIndex };
}

/** A completed session seeded into history — used for progression label tests. */
function makeCompletedSession(exerciseName: string, sets: object[]) {
  const now = Date.now();
  return {
    id: "prev-sess",
    startedAtMs: now - 86_400_000,
    endedAtMs: now - 83_000_000,
    blocks: [
      {
        id: "prev-block",
        type: "strength",
        orderIndex: 0,
        data: { exerciseName, sets },
      },
    ],
  };
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

type SeedOpts = {
  session?: object;
  progressionState?: { exerciseName: string; workingWeight: number; failedAttempts?: number };
  history?: object[];
  blocksCollapsedByDefault?: boolean;
};

async function seedSession(page: Page, opts: SeedOpts = {}) {
  const {
    session = makeSession(),
    progressionState,
    history,
    blocksCollapsedByDefault = false,
  } = opts;

  await page.addInitScript(
    ({ session, progressionState, history, blocksCollapsedByDefault }) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
      localStorage.setItem(
        "logit:tours:v1",
        JSON.stringify({ home: true, session: true, splits: true }),
      );
      localStorage.setItem("logit:draft:v1", JSON.stringify(session));
      localStorage.setItem(
        "logit:profile:v1",
        JSON.stringify({ blocksCollapsedByDefault }),
      );

      if (progressionState) {
        localStorage.setItem(
          "logit:progression:config:v1",
          JSON.stringify({ algorithmId: "linear-progression" }),
        );
        const key = progressionState.exerciseName.toLowerCase().trim();
        localStorage.setItem(
          "logit:progression:states:v1",
          JSON.stringify({
            [key]: {
              key,
              exerciseName: progressionState.exerciseName,
              algorithmId: "linear-progression",
              state: {
                workingWeight: progressionState.workingWeight,
                failedAttempts: progressionState.failedAttempts ?? 0,
                increment: 2.5,
                repRange: [5, 8],
              },
              updatedAtMs: Date.now(),
            },
          }),
        );
      }

      if (history) {
        localStorage.setItem("logit:sessions:v1", JSON.stringify(history));
      }
    },
    { session, progressionState, history, blocksCollapsedByDefault },
  );
}

async function goToSession(page: Page) {
  await page.goto("/session/current");
  await page.waitForLoadState("networkidle");
}

// ── Session loads ─────────────────────────────────────────────────────────────

test.describe("session loads", () => {
  test("empty session shows empty state", async ({ page }) => {
    await seedSession(page, { session: makeSession([]) });
    await goToSession(page);

    await expect(page.getByText("No exercises yet.")).toBeVisible();
    await expect(page.getByText("Add first exercise")).toBeVisible();
  });

  test("session with one exercise shows the exercise block", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
    });
    await goToSession(page);

    await expect(page.getByText("Bench Press")).toBeVisible();
  });

  test("session with two exercises shows both blocks", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press"),
        makeStrengthBlock("b2", 1, "Squat"),
      ]),
    });
    await goToSession(page);

    await expect(page.getByText("Bench Press")).toBeVisible();
    await expect(page.getByText("Squat")).toBeVisible();
  });

  test("shows seeded sets for an exercise", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [
          makeSet("s1", 0, 5, 100),
          makeSet("s2", 1, 5, 100),
          makeSet("s3", 2, 5, 100),
        ]),
      ]),
    });
    await goToSession(page);

    // 3 sets = 3 drag handles, one per set row
    await expect(page.locator('[aria-label="Drag to reorder set"]')).toHaveCount(3);
  });
});

// ── Progression targets ───────────────────────────────────────────────────────

test.describe("progression targets", () => {
  test("shows suggestion target from seeded progression state", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
      progressionState: { exerciseName: "Bench Press", workingWeight: 100 },
    });
    await goToSession(page);

    // ExerciseCard renders "Target: 3×5–8 @ 100kg" when expanded
    await expect(page.getByText(/Target:.*100kg/)).toBeVisible();
  });

  test("shows 'Next: Xkg' label when last session hit the rep ceiling", async ({ page }) => {
    const ceilingSets = [
      makeSet("ps1", 0, 8, 100), // 8 = ceiling of repRange [5, 8]
      makeSet("ps2", 1, 8, 100),
      makeSet("ps3", 2, 8, 100),
    ];

    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
      progressionState: { exerciseName: "Bench Press", workingWeight: 100 },
      history: [makeCompletedSession("Bench Press", ceilingSets)],
    });
    await goToSession(page);

    // All 3 sets hit ceiling → next session increment → "Next: 102.5kg"
    await expect(page.getByText(/Next: 102\.5kg/)).toBeVisible();
  });

  test("shows 'Deload next' label after two consecutive failures", async ({ page }) => {
    const failureSets = [
      makeSet("ps1", 0, 3, 100), // 3 < 5 = below floor
      makeSet("ps2", 1, 4, 100),
      makeSet("ps3", 2, 3, 100),
    ];

    // failedAttempts: 1 means this is the second failure → triggers deload
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
      progressionState: { exerciseName: "Bench Press", workingWeight: 100, failedAttempts: 1 },
      history: [makeCompletedSession("Bench Press", failureSets)],
    });
    await goToSession(page);

    // Second failure → deload (100 * 0.9 = 90) → "Deload next: 90kg"
    await expect(page.getByText(/Deload next: 90kg/)).toBeVisible();
  });

  test("shows 20kg default target for first-time exercise with no history", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Overhead Press")]),
      progressionState: { exerciseName: "Overhead Press", workingWeight: 20 },
    });
    await goToSession(page);

    await expect(page.getByText(/Target:.*20kg/)).toBeVisible();
  });

  test("no target shown when progression is not configured", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
      // No progressionState — config key not set, getSuggestion returns null
    });
    await goToSession(page);

    await expect(page.getByText(/Target:/)).not.toBeVisible();
  });
});

// ── Adding exercises ──────────────────────────────────────────────────────────

test.describe("adding exercises", () => {
  test("FAB opens the block picker then the add exercise dialog", async ({ page }) => {
    await seedSession(page, { session: makeSession([]) });
    await goToSession(page);

    // Two block types registered → FAB opens picker first
    await page.locator('[aria-label="Add block"]').click();
    await expect(page.getByText("Strength exercise")).toBeVisible();

    await page.getByText("Strength exercise").click();

    await expect(page.locator('input[placeholder="e.g. Bench Press"]')).toBeVisible();
  });

  test("adding a new exercise name creates a block", async ({ page }) => {
    await seedSession(page, { session: makeSession([]) });
    await goToSession(page);

    await page.locator('[aria-label="Add block"]').click();
    await page.getByText("Strength exercise").click();

    const input = page.locator('input[placeholder="e.g. Bench Press"]');
    await expect(input).toBeVisible();
    await input.fill("Romanian Deadlift");
    // Enter submits when no result matches — confirmNew() fires on keydown
    await page.keyboard.press("Enter");

    await expect(page.locator('input[placeholder="e.g. Bench Press"]')).not.toBeVisible();
    await expect(page.getByText("Romanian Deadlift")).toBeVisible();
  });
});

// ── Adding and managing sets ──────────────────────────────────────────────────

test.describe("managing sets", () => {
  test("'Add first set' creates a set row", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
    });
    await goToSession(page);

    await page.getByText("+ Add first set").click();

    // A set row should now be visible (weight input)
    await expect(page.locator('[aria-label="Add set"]')).toBeVisible();
  });

  test("add set button uses suggestion weight as default", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
      progressionState: { exerciseName: "Bench Press", workingWeight: 80 },
    });
    await goToSession(page);

    // Add first set uses suggestion
    await page.getByText("+ Add first set").click();

    // The weight input should be pre-filled with 80 from the suggestion
    const weightInput = page.locator('input[step="0.5"]').first();
    await expect(weightInput).toHaveValue("80");
  });

  test("marking a set complete toggles its visual state", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 5, 100)]),
      ]),
    });
    await goToSession(page);

    const completeBtn = page.locator('[aria-label="Mark complete"]').first();
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();

    await expect(page.locator('[aria-label="Mark incomplete"]').first()).toBeVisible();
  });

  test("completing a set and un-completing it returns to initial state", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 5, 100)]),
      ]),
    });
    await goToSession(page);

    await page.locator('[aria-label="Mark complete"]').first().click();
    await expect(page.locator('[aria-label="Mark incomplete"]').first()).toBeVisible();

    await page.locator('[aria-label="Mark incomplete"]').first().click();
    await expect(page.locator('[aria-label="Mark complete"]').first()).toBeVisible();
  });

  test("deleting an exercise removes it from the session", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
    });
    await goToSession(page);

    await page.locator('[aria-label="Delete exercise"]').first().click();
    // Confirm dialog appears
    await page.getByRole("button", { name: "Remove" }).click();

    await expect(page.getByText("Bench Press")).not.toBeVisible();
    await expect(page.getByText("No exercises yet.")).toBeVisible();
  });
});

// ── Block drag to reorder ─────────────────────────────────────────────────────

test.describe("block reorder", () => {
  test("dragging a block grip moves it below the next block", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press"),
        makeStrengthBlock("b2", 1, "Squat"),
        makeStrengthBlock("b3", 2, "Deadlift"),
      ]),
    });
    await goToSession(page);

    // Wait for all blocks to be visible
    await expect(page.getByText("Bench Press")).toBeVisible();
    await expect(page.getByText("Squat")).toBeVisible();

    // Grab the first block grip and drag it down past the second block
    const grips = page.locator('[aria-label="Drag to reorder"]');
    const firstGrip = grips.first();
    const box = await firstGrip.boundingBox();
    expect(box).not.toBeNull();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    const targetY = cy + box!.height * 2.5;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(cx, cy + ((targetY - cy) * i) / steps);
    }
    await page.mouse.up();
    await page.waitForTimeout(800);

    // Read final order from the DOM
    const names = await page.locator('[aria-label="Drag to reorder"]').evaluateAll((els) =>
      els.map((el) => {
        const card = el.closest("[class*=border-b]") ?? el.parentElement;
        return card?.querySelector("[class*=font-semibold]")?.textContent?.trim() ?? "";
      }),
    );

    // Bench Press (was #1) should have moved below Squat (was #2)
    expect(names.indexOf("Bench Press")).toBeGreaterThan(names.indexOf("Squat"));
  });
});

// ── Set drag to reorder within a block ───────────────────────────────────────

test.describe("set reorder", () => {
  test("dragging a set grip moves it to a new position", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [
          makeSet("s1", 0, 5, 60),
          makeSet("s2", 1, 5, 80),
          makeSet("s3", 2, 5, 100),
        ]),
      ]),
    });
    await goToSession(page);

    const grips = page.locator('[aria-label="Drag to reorder set"]');
    await expect(grips).toHaveCount(3);

    const firstGrip = grips.first();
    const box = await firstGrip.boundingBox();
    expect(box).not.toBeNull();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    const targetY = cy + box!.height * 2.5;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(cx, cy + ((targetY - cy) * i) / steps);
    }
    await page.mouse.up();
    await page.waitForTimeout(800);

    // The set that started at 60kg (first) should now appear after 80kg
    const weightInputs = page.locator('input[step="0.5"]');
    const values = await weightInputs.evaluateAll((inputs) =>
      inputs.map((el) => (el as HTMLInputElement).value),
    );
    // 60 was first — after dragging it down it should no longer be first
    expect(values[0]).not.toBe("60");
  });
});

// ── Finish session ────────────────────────────────────────────────────────────

test.describe("finish session", () => {
  test("'Finish workout' shows the recap screen", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 5, 100)]),
      ]),
    });
    await goToSession(page);

    await page.getByRole("button", { name: "Finish workout" }).click();

    await expect(page.getByText("Workout complete")).toBeVisible();
  });

  test("recap screen shows session stats", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [
          makeSet("s1", 0, 5, 100),
          makeSet("s2", 1, 5, 100),
        ]),
      ]),
    });
    await goToSession(page);

    await page.getByRole("button", { name: "Finish workout" }).click();

    await expect(page.getByText("Workout complete")).toBeVisible();
    // "Sets" stat label in recap (exact match avoids "2 sets" exercise count chip)
    await expect(page.getByText("Sets", { exact: true })).toBeVisible();
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
  });

  test("'Back to workout' cancels the recap and returns to session", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
    });
    await goToSession(page);

    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(page.getByText("Workout complete")).toBeVisible();

    await page.getByRole("button", { name: "Back to workout" }).click();

    await expect(page.getByText("Workout complete")).not.toBeVisible();
    await expect(page.getByText("Bench Press")).toBeVisible();
  });

  test("'Save & finish' saves session and navigates to /", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 5, 100)]),
      ]),
    });
    await goToSession(page);

    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(page.getByText("Workout complete")).toBeVisible();

    await page.getByRole("button", { name: "Save & finish" }).click();

    await page.waitForURL(/^\http:\/\/localhost:5173\/$/, { timeout: 10_000 });
    expect(page.url()).toBe("http://localhost:5173/");

    // Poll until the session is written — finish() runs async after navigation
    await page.waitForFunction(
      () => {
        const raw = localStorage.getItem("logit:sessions:v1");
        if (!raw) return false;
        const arr = JSON.parse(raw);
        return Array.isArray(arr) && arr.length > 0;
      },
      { timeout: 5000 },
    );
  });

  test("finishing a session clears the draft", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 5, 100)]),
      ]),
    });
    await goToSession(page);

    await page.getByRole("button", { name: "Finish workout" }).click();
    await page.getByRole("button", { name: "Save & finish" }).click();

    await page.waitForURL(/^\http:\/\/localhost:5173\/$/, { timeout: 10_000 });

    const draft = await page.evaluate(() => localStorage.getItem("logit:draft:v1"));
    expect(draft).toBeNull();
  });
});

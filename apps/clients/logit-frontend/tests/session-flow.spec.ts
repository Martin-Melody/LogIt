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
  // savedAtMs: when the state was saved. Before the history session means that
  // session hasn't been applied yet (it's the one being progressed from).
  progressionState?: { exerciseName: string; workingWeight: number; failedAttempts?: number; savedAtMs?: number };
  history?: object[];
  blocksCollapsedByDefault?: boolean;
  /** Profile bodyweight (kg), for bodyweight-exercise volume. */
  bodyweightKg?: number;
};

async function seedSession(page: Page, opts: SeedOpts = {}) {
  const {
    session = makeSession(),
    progressionState,
    history,
    blocksCollapsedByDefault = false,
    bodyweightKg,
  } = opts;

  await page.addInitScript(
    ({ session, progressionState, history, blocksCollapsedByDefault, bodyweightKg }) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
      localStorage.setItem(
        "logit:tours:v1",
        JSON.stringify({ home: true, session: true, splits: true }),
      );
      localStorage.setItem("logit:draft:v1", JSON.stringify(session));
      localStorage.setItem(
        "logit:profile:v1",
        JSON.stringify({
          blocksCollapsedByDefault,
          ...(bodyweightKg ? { weight: bodyweightKg, weightUnit: "kg" } : {}),
        }),
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
              updatedAtMs: progressionState.savedAtMs ?? Date.now(),
            },
          }),
        );
      }

      if (history) {
        localStorage.setItem("logit:sessions:v1", JSON.stringify(history));
      }
    },
    { session, progressionState, history, blocksCollapsedByDefault, bodyweightKg },
  );
}

/** Swap / superset / remove live in the exercise header's ⋯ menu. */
async function openExerciseMenu(page: Page, i = 0) {
  await page.getByRole("button", { name: /^More actions for/ }).nth(i).click();
}

/** ⋯ → "Superset / circuit with…", tick `names` in the picker and confirm. */
async function groupWith(page: Page, names: string[], menuIndex = 0) {
  await openExerciseMenu(page, menuIndex);
  await page.getByRole("menuitem", { name: "Superset / circuit with…" }).click();
  for (const name of names) await page.getByRole("checkbox", { name: new RegExp(name) }).check();
  await page.getByRole("button", { name: /^Make (superset|circuit)/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function goToSession(page: Page) {
  await page.goto("/session/current");
  await page.waitForLoadState("networkidle");
}

// ── Session loads ─────────────────────────────────────────────────────────────

/** Set row `i`'s plan or logged value as "reps × weight" (placeholders count). */
async function rowText(page: Page, i = 0): Promise<string> {
  const r = page.getByTestId("set-reps").nth(i);
  const w = page.getByTestId("set-weight").nth(i);
  const reps = (await r.inputValue()) || (await r.getAttribute("placeholder")) || "";
  const weight = (await w.inputValue()) || (await w.getAttribute("placeholder")) || "";
  return `${reps} × ${weight}`;
}

test.describe("session loads", () => {
  test("empty session shows empty state", async ({ page }) => {
    await seedSession(page, { session: makeSession([]) });
    await goToSession(page);

    await expect(page.getByText("Nothing logged yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add exercise" })).toBeVisible();
  });

  test("'Repeat last workout' clones the previous session's exercises into an empty draft", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([]),
      history: [
        makeCompletedSession("Bench Press", [
          makeSet("ps1", 0, 5, 100),
          makeSet("ps2", 1, 5, 100),
        ]),
      ],
    });
    await goToSession(page);

    await page.getByRole("button", { name: "Repeat last workout" }).click();

    await expect(page.getByText("Bench Press")).toBeVisible();
    // Two sets carried over, none marked complete.
    await expect(page.locator('[aria-label="Drag to reorder set"]')).toHaveCount(2);
    await expect(page.locator('[aria-label="Mark incomplete"]')).toHaveCount(0);
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

    // The block plans its sets straight away: no history yet, so the rep range at 100kg.
    await expect(page.getByTestId("set-reps")).toHaveCount(3);
    await expect.poll(() => rowText(page, 0)).toBe("5–8 × 100");
  });

  test("plans the next weight up when last session hit the rep ceiling", async ({ page }) => {
    const ceilingSets = [
      makeSet("ps1", 0, 8, 100), // 8 = ceiling of repRange [5, 8]
      makeSet("ps2", 1, 8, 100),
      makeSet("ps3", 2, 8, 100),
    ];

    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
      progressionState: { exerciseName: "Bench Press", workingWeight: 100, savedAtMs: Date.now() - 3 * 86_400_000 },
      history: [makeCompletedSession("Bench Press", ceilingSets)],
    });
    await goToSession(page);

    // All 3 sets hit ceiling → today is 102.5kg, starting from the bottom of the range.
    await expect.poll(() => rowText(page, 0)).toBe("5 × 102.5");
    await expect(page.getByText("+2.5kg", { exact: true })).toBeVisible();
    await expect(page.getByText(/8 on every set →\s*105 kg/)).toBeVisible();
  });

  test("plans a deload after two consecutive failures", async ({ page }) => {
    const failureSets = [
      makeSet("ps1", 0, 3, 100), // 3 < 5 = below floor
      makeSet("ps2", 1, 4, 100),
      makeSet("ps3", 2, 3, 100),
    ];

    // failedAttempts: 1 means this is the second failure → triggers deload
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
      progressionState: {
        exerciseName: "Bench Press",
        workingWeight: 100,
        failedAttempts: 1,
        savedAtMs: Date.now() - 3 * 86_400_000,
      },
      history: [makeCompletedSession("Bench Press", failureSets)],
    });
    await goToSession(page);

    // Second failure → deload (100 * 0.9 = 90)
    await expect.poll(() => rowText(page, 0)).toBe("5 × 90");
    await expect(page.getByText("Deload", { exact: true })).toBeVisible();
  });

  test("shows 20kg default target for first-time exercise with no history", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Overhead Press")]),
      progressionState: { exerciseName: "Overhead Press", workingWeight: 20 },
    });
    await goToSession(page);

    await expect.poll(() => rowText(page, 0)).toBe("5–8 × 20");
  });

  test("no target shown when progression is not configured", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
      // No progressionState — config key not set, getSuggestion returns null
    });
    await goToSession(page);

    await expect(page.getByTestId("progress-meter")).toHaveCount(0);
    await expect(page.getByText("+ Add first set")).toBeVisible();
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

test.describe("bodyweight prompt", () => {
  async function addExercise(page: Page, name: string) {
    await page.locator('[aria-label="Add block"]').click();
    await page.getByText("Strength exercise").click();
    const input = page.locator('input[placeholder="e.g. Bench Press"]');
    await input.fill(name);
    await page.keyboard.press("Enter");
    await expect(input).not.toBeVisible();
  }

  test("asks for bodyweight when a bodyweight exercise is added and none is known", async ({ page }) => {
    await seedSession(page, { session: makeSession([]) });
    await goToSession(page);

    await addExercise(page, "Weighted Dips");
    await expect(page.getByRole("dialog", { name: "What do you weigh?" })).toBeVisible();
    await page.getByLabel("Bodyweight").fill("88.5");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog", { name: "What do you weigh?" })).not.toBeVisible();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("logit:profile:v1") ?? "{}").weight);
    expect(saved).toBe(88.5);

    // Known now, so a second bodyweight exercise doesn't ask again.
    await addExercise(page, "Chin-Up");
    await expect(page.getByText("Chin-Up")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog", { name: "What do you weigh?" })).toHaveCount(0);
  });

  test("doesn't ask for weighted exercises, or again after 'Not now'", async ({ page }) => {
    await seedSession(page, { session: makeSession([]) });
    await goToSession(page);

    await addExercise(page, "Romanian Deadlift");
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog", { name: "What do you weigh?" })).toHaveCount(0);

    await addExercise(page, "Pull ups");
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("dialog", { name: "What do you weigh?" })).toHaveCount(0);

    await addExercise(page, "Push-Up");
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog", { name: "What do you weigh?" })).toHaveCount(0);
  });

  test("isn't asked when bodyweight is already set", async ({ page }) => {
    await seedSession(page, { session: makeSession([]), bodyweightKg: 80 });
    await goToSession(page);
    await addExercise(page, "Dips");
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog", { name: "What do you weigh?" })).toHaveCount(0);
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

  test("set rows show the previous session's reps/weight under Last time", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
      history: [
        makeCompletedSession("Bench Press", [
          makeSet("ps1", 0, 6, 90),
          makeSet("ps2", 1, 6, 90),
        ]),
      ],
    });
    await goToSession(page);

    await page.getByText("+ Add first set").click();

    await expect(page.getByTestId("set-last").first()).toHaveText("6 × 90");
  });

  test("add set button uses suggestion weight as default", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
      progressionState: { exerciseName: "Bench Press", workingWeight: 80 },
    });
    await goToSession(page);

    // The plan creates the sets itself, weight filled in from the suggestion.
    await expect(page.getByText("+ Add first set")).toHaveCount(0);
    await expect.poll(() => rowText(page, 0)).toContain("× 80");

    // A set added beyond the plan carries the same weight.
    await page.getByRole("button", { name: "Add set" }).click();
    await expect(page.getByTestId("set-reps")).toHaveCount(4);
    await expect.poll(() => rowText(page, 3)).toContain("× 80");
  });

  test("warm-up ramp prepends warm-up sets before the working set", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Squat", [makeSet("s1", 0, 5, 100)]),
      ]),
    });
    await goToSession(page);

    await expect(page.locator('[aria-label="Drag to reorder set"]')).toHaveCount(1);
    await page.getByText("+ Warm-up ramp").click();

    // bar 20 + 40/60/80% of 100 → 4 warm-ups, then the working set = 5 rows.
    await expect(page.locator('[aria-label="Drag to reorder set"]')).toHaveCount(5);
    // First row is a warm-up (W badge).
    await expect(page.locator("main").getByText("W", { exact: true }).first()).toBeVisible();
    // Offer is gone once warm-ups exist.
    await expect(page.getByText("+ Warm-up ramp")).toHaveCount(0);
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

  test("swapping an exercise keeps the logged sets", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [
          makeSet("s1", 0, 8, 60),
          makeSet("s2", 1, 8, 60),
        ]),
      ]),
    });
    await goToSession(page);

    await openExerciseMenu(page);
    await page.getByRole("menuitem", { name: "Swap exercise" }).click();
    const input = page.locator('input[placeholder="e.g. Bench Press"]');
    await expect(input).toBeVisible();
    await input.fill("Incline Bench Press");
    await page.keyboard.press("Enter");

    await expect(page.getByText("Incline Bench Press")).toBeVisible();
    await expect(page.getByText("Bench Press", { exact: true })).not.toBeVisible();
    // Both sets still there.
    await expect(page.locator('[aria-label="Drag to reorder set"]')).toHaveCount(2);
  });

  test("swap search stays usable on an exercise added mid-session", async ({ page }) => {
    // Regression: the swap dialog lives inside StrengthBlock, which mounts while
    // the draft autosave is in flight. AddExerciseDialog used to read `saving`
    // non-reactively, freezing it `true` for the life of that block and leaving
    // the swap search input permanently disabled.
    await seedSession(page, { session: makeSession([]) });
    await goToSession(page);

    await page.locator('[aria-label="Add block"]').click();
    await page.getByText("Strength exercise").click();
    const addInput = page.locator('input[placeholder="e.g. Bench Press"]');
    await addInput.fill("Overhead Press");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Overhead Press")).toBeVisible();

    await openExerciseMenu(page);
    await page.getByRole("menuitem", { name: "Swap exercise" }).click();
    const swapInput = page.locator('input[placeholder="e.g. Bench Press"]');
    await expect(swapInput).toBeVisible();
    await expect(swapInput).toBeEnabled();
    await swapInput.fill("Incline Bench Press");
    await expect(swapInput).toHaveValue("Incline Bench Press");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Incline Bench Press")).toBeVisible();
  });

  test("deleting an exercise removes it from the session", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([makeStrengthBlock("b1", 0, "Bench Press")]),
    });
    await goToSession(page);

    await openExerciseMenu(page);
    await page.getByRole("menuitem", { name: "Remove exercise" }).click();
    // Confirm dialog appears
    await page.getByRole("button", { name: "Remove" }).click();

    await expect(page.getByText("Bench Press")).not.toBeVisible();
    await expect(page.getByText("Nothing logged yet.")).toBeVisible();
  });
});

// ── Supersets ─────────────────────────────────────────────────────────────────

test.describe("supersets", () => {
  test("linking two exercises makes a superset; add round appends a set to each", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 8, 60)]),
        makeStrengthBlock("b2", 1, "Row", [makeSet("s2", 0, 8, 40)]),
      ]),
    });
    await goToSession(page);

    await groupWith(page, ["Row"]);

    await expect(page.getByText("SUPERSET")).toBeVisible();
    await expect(page.getByText("2 exercises · 1 round")).toBeVisible();

    await page.getByRole("button", { name: "Add round" }).click();
    await expect(page.getByText("2 exercises · 2 rounds")).toBeVisible();

    // By exercise (the default), each exercise now has 2 set rows.
    await expect(page.getByRole("button", { name: "By exercise" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[aria-label="Drag to reorder set"]')).toHaveCount(4);

    // By round, each round is its own row.
    await page.getByRole("button", { name: "By round" }).click();
    await expect(page.getByRole("button", { name: /Round 2/ })).toBeVisible();

    // Ungroup (from the group's menu) restores plain blocks.
    await page.getByRole("button", { name: "More actions for this superset" }).click();
    await page.getByRole("menuitem", { name: "Ungroup" }).click();
    await expect(page.getByText("SUPERSET")).not.toBeVisible();
    await expect(page.getByText("Bench Press")).toBeVisible();
    await expect(page.getByText("Row", { exact: true })).toBeVisible();
  });

  test("with 'Collapse blocks by default' on, a group starts collapsed", async ({ page }) => {
    await seedSession(page, {
      session: makeSession(
        [
          makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 8, 60)]),
          makeStrengthBlock("b2", 1, "Row", [makeSet("s2", 0, 8, 40)]),
        ].map((b) => ({ ...b, data: { ...b.data, superset: { id: "g1" } } })),
      ),
      blocksCollapsedByDefault: true,
    });
    await goToSession(page);

    const toggle = page.getByRole("button", { name: /^(Expand|Collapse) Superset$/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "By exercise" })).toHaveCount(0);

    await toggle.click();
    await expect(page.getByRole("button", { name: "By exercise" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a drill's menu builds a circuit: same kind first, add another comes back ticked", async ({ page }) => {
    const drill = (id: string, orderIndex: number, drillName: string) => ({
      id, type: "mobility", orderIndex,
      data: { drillName, metric: "hold", perSide: false, sets: [{ id: `${id}-1`, orderIndex: 0, durationSec: 30 }] },
    });
    await seedSession(page, {
      session: makeSession([
        drill("m1", 0, "Hamstring stretch"),
        makeStrengthBlock("b1", 1, "Bench Press", [makeSet("s1", 0, 8, 60)]),
        drill("m2", 2, "Butterfly stretch"),
      ]),
    });
    await goToSession(page);

    await page.getByRole("button", { name: "More actions for Hamstring stretch" }).click();
    await page.getByRole("menuitem", { name: "Superset / circuit with…" }).click();
    const picker = page.getByRole("dialog", { name: "Superset / circuit with Hamstring stretch" });
    await expect(picker).toBeVisible();
    // Mobility first, then everything else.
    await expect(picker.getByRole("checkbox")).toHaveCount(2);
    await expect(picker.getByText("Mobility", { exact: true })).toBeVisible();
    await expect(picker.getByText("Other exercises")).toBeVisible();
    await picker.getByRole("checkbox", { name: /Butterfly stretch/ }).check();
    await expect(picker.getByRole("button", { name: "Make superset" })).toBeVisible();

    // A drill that isn't in the workout yet.
    await picker.getByRole("button", { name: /Add another exercise/ }).click();
    await page.getByRole("button", { name: /Mobility \/ Stretching/ }).click();
    await page.getByPlaceholder("Search drills, or type a new one…").fill("Middle split");
    await page.getByRole("dialog", { name: "Add mobility drill" }).getByRole("button", { name: "Add", exact: true }).click();

    await expect(picker).toBeVisible();
    await expect(picker.getByRole("checkbox", { name: /Middle split/ })).toBeChecked();
    await picker.getByRole("button", { name: "Make circuit · 3 exercises" }).click();
    await expect(picker).toHaveCount(0);

    await expect(page.getByText("CIRCUIT")).toBeVisible();
    // Grouped drills sit together, in workout order; Bench Press is pushed below.
    const names = await page.getByRole("button", { name: /^More actions for (?!this )/ }).evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label")!.replace("More actions for ", "")),
    );
    expect(names).toEqual(["Hamstring stretch", "Butterfly stretch", "Middle split", "Bench Press"]);
  });

  test("a circuit of drills counts rounds, and add round carries the hold target", async ({ page }) => {
    const drill = (id: string, orderIndex: number, drillName: string, perSide = false) => ({
      id, type: "mobility", orderIndex,
      data: {
        drillName, metric: "hold", perSide, restBetweenSetsMs: 30_000,
        sets: perSide
          ? [
              { id: `${id}-l`, orderIndex: 0, side: "left", targetSec: 30, durationSec: 30 },
              { id: `${id}-r`, orderIndex: 1, side: "right", targetSec: 30, durationSec: 30 },
            ]
          : [{ id: `${id}-1`, orderIndex: 0, targetSec: 30, durationSec: 30 }],
      },
    });
    await seedSession(page, {
      session: makeSession([drill("m1", 0, "Hamstring stretch"), drill("m2", 1, "Pigeon stretch", true)]),
    });
    await goToSession(page);

    await groupWith(page, ["Pigeon stretch"]);
    await expect(page.getByText("2 exercises · 1 round")).toBeVisible();
    await page.getByRole("button", { name: "By exercise" }).click();

    // Not the last drill of the round: ticking it moves on without a rest.
    await page.getByRole("button", { name: "Mark complete" }).first().click();
    await expect(page.getByLabel("Dismiss rest timer")).toHaveCount(0);
    // The last drill's first side goes straight on to the other side…
    await page.getByRole("button", { name: "Mark complete" }).first().click();
    await expect(page.getByLabel("Dismiss rest timer")).toHaveCount(0);
    // …and the end of the round rests with the drill's own rest.
    await page.getByRole("button", { name: "Mark complete" }).first().click();
    await expect(page.getByLabel("Dismiss rest timer")).toHaveCount(1);
    await page.getByLabel("Dismiss rest timer").click();

    await page.getByRole("button", { name: "Add round" }).click();
    await expect(page.getByText("2 exercises · 2 rounds")).toBeVisible();
    // One new set for the hamstring, one L/R pair for the pigeon.
    await expect(page.locator('[aria-label="Drag to reorder set"]')).toHaveCount(4);
    // Round 1 is all done, so the open hold rows are the new ones, each with the 30 s target.
    const holdRows = page.getByRole("row", { name: /Start hold timer/ });
    await expect(holdRows).toHaveCount(3);
    await expect(page.getByRole("row", { name: /Start hold timer.*30s goal/ })).toHaveCount(3);
  });

  test("one drill can be a circuit on its own, and run with the countdown", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        {
          id: "m1", type: "mobility", orderIndex: 0,
          data: {
            drillName: "Couch stretch", metric: "hold", perSide: false,
            sets: [{ id: "m1-1", orderIndex: 0, targetSec: 20 }, { id: "m1-2", orderIndex: 1, targetSec: 20 }],
          },
        },
      ]),
    });
    await goToSession(page);

    await page.getByRole("button", { name: "More actions for Couch stretch" }).click();
    await page.getByRole("menuitem", { name: "Superset / circuit with…" }).click();
    const picker = page.getByRole("dialog", { name: "Superset / circuit with Couch stretch" });
    await expect(picker.getByRole("radio", { name: "Circuit" })).toHaveAttribute("aria-checked", "true");
    await expect(picker.getByRole("radio", { name: "Superset" })).toBeDisabled();
    await picker.getByRole("button", { name: "Make circuit · 1 exercise" }).click();
    await expect(picker).toHaveCount(0);

    await expect(page.getByText("Circuit", { exact: true })).toBeVisible();
    await expect(page.getByText("1 exercise · 2 rounds")).toBeVisible();
    await page.getByRole("button", { name: "Start circuit" }).click();
    await expect(page.getByRole("dialog", { name: "Circuit timer" }).getByText("Round 1 of 2")).toBeVisible();
  });

  test("a superset can be called a circuit, and a whole group removed", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 8, 60)]),
        makeStrengthBlock("b2", 1, "Row", [makeSet("s2", 0, 8, 40)]),
        makeStrengthBlock("b3", 2, "Squat", [makeSet("s3", 0, 5, 100)]),
      ]),
    });
    await goToSession(page);
    await groupWith(page, ["Row"]);
    await expect(page.getByText("SUPERSET")).toBeVisible();

    await page.getByRole("button", { name: "More actions for this superset" }).click();
    await page.getByRole("menuitem", { name: "Make it a circuit" }).click();
    await expect(page.getByText("Circuit", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "More actions for this circuit" }).click();
    await page.getByRole("menuitem", { name: "Remove circuit and its exercises" }).click();
    await expect(page.getByText("Removes all 2 exercises and everything logged in them.")).toBeVisible();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("Circuit", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Bench Press")).toHaveCount(0);
    await expect(page.getByText("Row", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Squat")).toBeVisible();
  });

  test("rest starts only after the last exercise of a superset round", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [
          { id: "s1", setType: "normal", reps: 8, weight: 60, orderIndex: 0, restDurationMs: 90_000 },
        ]),
        makeStrengthBlock("b2", 1, "Row", [
          { id: "s2", setType: "normal", reps: 8, weight: 40, orderIndex: 0, restDurationMs: 90_000 },
        ]),
      ]),
    });
    await goToSession(page);

    await groupWith(page, ["Row"]);
    await expect(page.getByText("SUPERSET")).toBeVisible();

    // First member — completing it flows straight on, no rest.
    await page.getByRole("button", { name: "Mark complete" }).first().click();
    await expect(page.getByLabel("Dismiss rest timer")).toHaveCount(0);

    // Anchor (last member) — completing starts the one shared round rest.
    await page.getByRole("button", { name: "Mark complete" }).first().click();
    await expect(page.getByLabel("Dismiss rest timer")).toHaveCount(1);
  });

  test("a circuit rests between exercises by default; the edit sheet changes it", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [
          { id: "s1", setType: "normal", reps: 8, weight: 60, orderIndex: 0, restDurationMs: 90_000 },
          { id: "s3", setType: "normal", reps: 8, weight: 60, orderIndex: 1, restDurationMs: 90_000 },
        ]),
        makeStrengthBlock("b2", 1, "Row", [
          { id: "s2", setType: "normal", reps: 8, weight: 40, orderIndex: 0, restDurationMs: 90_000 },
          { id: "s4", setType: "normal", reps: 8, weight: 40, orderIndex: 1, restDurationMs: 90_000 },
        ]),
      ]),
    });
    await goToSession(page);
    await groupWith(page, ["Row"]);
    await page.getByRole("button", { name: "By exercise" }).click();

    // Tapping the group's name opens its sheet: make it a named circuit.
    await page.getByRole("button", { name: "Edit Superset" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit superset" });
    await sheet.getByRole("button", { name: "Circuit", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Edit circuit" })).toBeVisible();
    const circuit = page.getByRole("dialog", { name: "Edit circuit" });
    await expect(circuit.getByRole("button", { name: "15 s", exact: true })).toHaveAttribute("aria-pressed", "true");
    await circuit.getByLabel("Name").fill("Push pull");
    await circuit.getByRole("button", { name: "Save" }).click();
    await circuit.getByRole("button", { name: "Close" }).last().click();
    await expect(page.getByText("PUSH PULL", { exact: false })).toBeVisible();

    // The first exercise now starts the 15 s rest between exercises.
    await page.getByRole("button", { name: "Mark complete" }).first().click();
    await expect(page.getByLabel("Dismiss rest timer")).toHaveCount(1);
    await expect.poll(async () =>
      page.evaluate(() => {
        const draft = JSON.parse(localStorage.getItem("logit:draft:v1")!);
        const bench = draft.blocks.find((b: { id: string }) => b.id === "b1");
        return bench.data.sets.find((x: { id: string }) => x.id === "s1").restDurationMs;
      }),
    ).toBe(15_000);

    // Off in the sheet: straight on to the next exercise.
    await page.getByRole("button", { name: "Edit Push pull" }).click();
    await page.getByRole("dialog", { name: "Edit circuit" }).getByRole("button", { name: "Off", exact: true }).first().click();
    await page.getByRole("dialog", { name: "Edit circuit" }).getByRole("button", { name: "Close" }).last().click();
    await page.getByLabel("Dismiss rest timer").click();
    // Bench's second set, not the last exercise of its round.
    await page.getByRole("button", { name: "Mark complete" }).first().click();
    await expect(page.getByLabel("Dismiss rest timer")).toHaveCount(0);
  });

  test("by round: the round being worked on is open, and each round opens and closes", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 8, 60), makeSet("s3", 1, 8, 60)]),
        makeStrengthBlock("b2", 1, "Row", [
          { ...makeSet("s2", 0, 8, 40), restDurationMs: 60_000 },
          makeSet("s4", 1, 8, 40),
        ]),
      ]),
    });
    await goToSession(page);
    await groupWith(page, ["Row"]);
    await page.getByRole("button", { name: "By round" }).click();

    const round1 = page.getByRole("button", { name: /^Round 1/ });
    const round2 = page.getByRole("button", { name: /^Round 2/ });
    await expect(round1).toHaveAttribute("aria-expanded", "true");
    await expect(round2).toHaveAttribute("aria-expanded", "false");
    await expect(round2).toContainText("Up next");
    // Round 1 shows each exercise once, with its first set.
    await expect(page.getByRole("button", { name: "Mark complete" })).toHaveCount(2);

    // Finishing round 1 opens round 2; round 1 stays open while its rest runs.
    await page.getByRole("button", { name: "Mark complete" }).first().click();
    await page.getByRole("button", { name: "Mark complete" }).first().click();
    await expect(round1).toContainText("Done");
    await expect(round2).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("Dismiss rest timer")).toHaveCount(1);
    await page.getByLabel("Dismiss rest timer").click();
    await expect(round1).toHaveAttribute("aria-expanded", "false");

    // Any round can be opened or closed by hand.
    await round1.click();
    await expect(round1).toHaveAttribute("aria-expanded", "true");
    await round2.click();
    await expect(round2).toHaveAttribute("aria-expanded", "false");
  });

  test("the edit sheet adds and removes rounds, and ungroups", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 0, 60)]),
        makeStrengthBlock("b2", 1, "Row", [makeSet("s2", 0, 0, 40)]),
      ]),
    });
    await goToSession(page);
    await groupWith(page, ["Row"]);
    await expect(page.getByText("2 exercises · 1 round")).toBeVisible();

    await page.getByRole("button", { name: "Edit Superset" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit superset" });
    await expect(sheet.getByRole("button", { name: "One round fewer" })).toBeDisabled();
    await sheet.getByRole("button", { name: "One more round" }).click();
    await expect(sheet.getByText("2 exercises · 2 rounds")).toBeVisible();
    await sheet.getByRole("button", { name: "One round fewer" }).click();
    await expect(sheet.getByText("2 exercises · 1 round")).toBeVisible();

    await sheet.getByRole("button", { name: "Ungroup" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText("SUPERSET")).toHaveCount(0);
  });

  test("a group collapses to one line with its progress", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [
          { id: "s1", setType: "normal", reps: 8, weight: 60, orderIndex: 0, completed: true },
        ]),
        makeStrengthBlock("b2", 1, "Row", [{ id: "s2", setType: "normal", reps: 8, weight: 40, orderIndex: 0 }]),
      ]),
    });
    await goToSession(page);
    await groupWith(page, ["Row"]);

    await page.getByRole("button", { name: "Collapse Superset" }).click();
    await expect(page.getByText("2 exercises · round 1 of 1")).toBeVisible();
    await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add round" })).toHaveCount(0);
    await expect(page.getByText("Row", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Expand Superset" }).click();
    await expect(page.getByRole("button", { name: "Add round" })).toBeVisible();
  });
});

// ── Circuit countdown ─────────────────────────────────────────────────────────

test.describe("circuit countdown", () => {
  /** A drill already in group `g1`, with `rounds` sets (L/R pairs when per side) and a target. */
  function groupedDrill(id: string, orderIndex: number, drillName: string, perSide: boolean, rounds: number, targetSec: number) {
    const sets = [];
    for (let r = 0; r < rounds; r++) {
      if (perSide) {
        sets.push({ id: `${id}-${r}l`, orderIndex: sets.length, side: "left", targetSec });
        sets.push({ id: `${id}-${r}r`, orderIndex: sets.length, side: "right", targetSec });
      } else {
        sets.push({ id: `${id}-${r}`, orderIndex: sets.length, targetSec });
      }
    }
    return {
      id, type: "mobility", orderIndex,
      data: { drillName, metric: "hold", perSide, sets, superset: { id: "g1", roundRestMs: 30_000 } },
    };
  }

  type DraftSet = { id: string; durationSec?: number; completed?: boolean };
  async function draftSets(page: Page): Promise<Record<string, DraftSet>> {
    return page.evaluate(() => {
      const draft = JSON.parse(localStorage.getItem("logit:draft:v1")!);
      const out: Record<string, DraftSet> = {};
      for (const b of draft.blocks) for (const set of b.data.sets ?? []) out[set.id] = set;
      return out;
    });
  }

  test("runs the drills with a 3-2-1, holds that stop on their own, sides and a round rest", async ({ page }) => {
    await page.clock.install();
    await seedSession(page, {
      session: makeSession([
        groupedDrill("ham", 0, "Hamstring stretch", false, 2, 20),
        groupedDrill("pig", 1, "Pigeon stretch", true, 2, 20),
      ]),
    });
    await goToSession(page);
    await expect(page.getByText("2 exercises · 2 rounds · 30 s rest")).toBeVisible();

    await page.getByRole("button", { name: "Start superset" }).click();
    const overlay = page.getByRole("dialog", { name: "Superset timer" });
    await expect(overlay.getByText("Get ready")).toBeVisible();
    await expect(overlay.getByRole("heading", { name: "Hamstring stretch" })).toBeVisible();
    await expect(overlay.getByText("Round 1 of 2")).toBeVisible();
    await expect(overlay.getByText("Pigeon stretch, left side")).toBeVisible(); // up next

    // 3-2-1, then the hold counts down from 20 s and stops on its own.
    await page.clock.runFor(3_500);
    await expect(overlay.getByRole("img", { name: /seconds left of 20/ })).toBeVisible();
    await page.clock.runFor(20_000);
    await expect(overlay.getByRole("heading", { name: "Pigeon stretch" })).toBeVisible();
    await expect(overlay.getByText("Get ready")).toBeVisible();
    await expect.poll(async () => (await draftSets(page))["ham-0"]).toMatchObject({ durationSec: 20, completed: true });

    // Start now, +10 s, and the hold runs to 30 s; the right side then gets a 5 s switch.
    await overlay.getByRole("button", { name: "Start now" }).click();
    await expect(overlay.getByText("Left side")).toBeVisible();
    await expect(overlay.getByText("5 s to switch")).toBeVisible();
    await overlay.getByRole("button", { name: "Add 10 seconds" }).click();
    await expect(overlay.getByText("of 30 s")).toBeVisible();
    await page.clock.runFor(30_500);
    await expect(overlay.getByText("Switch sides")).toBeVisible();
    await expect.poll(async () => (await draftSets(page))["pig-0l"]).toMatchObject({ durationSec: 30, completed: true });

    // Skipping about 5 s into the right side keeps the time held (the switch started 0.5 s ago).
    await page.clock.runFor(4_500 + 5_000);
    await overlay.getByRole("button", { name: "Skip to next" }).click();
    await expect.poll(async () => (await draftSets(page))["pig-0r"]?.completed).toBe(true);
    const held = (await draftSets(page))["pig-0r"]!.durationSec!;
    expect(held).toBeGreaterThanOrEqual(5);
    expect(held).toBeLessThanOrEqual(6);

    // Round 1 done: rest between rounds, then round 2 starts with the hamstring.
    await expect(overlay.getByRole("heading", { name: "Rest" })).toBeVisible();
    await expect(overlay.getByText("Round 1 of 2 done")).toBeVisible();
    await expect(overlay.getByText("Up next · round 2 of 2")).toBeVisible();
    await expect(overlay.getByText("Hamstring stretch", { exact: true })).toBeVisible();
    await overlay.getByRole("button", { name: "Skip rest" }).click();
    await expect(overlay.getByText("Round 2 of 2")).toBeVisible();
    await expect(overlay.getByRole("heading", { name: "Hamstring stretch" })).toBeVisible();

    // Shrink to see the workout, pause, then end: what was logged stays.
    await overlay.getByRole("button", { name: "Shrink to see the workout" }).click();
    const bar = page.getByRole("region", { name: "Superset timer" });
    await expect(bar).toBeVisible();
    await expect(page.getByRole("button", { name: "Show the superset timer" })).toBeVisible();
    await bar.getByRole("button", { name: "Pause" }).click();
    await page.clock.runFor(60_000);
    await expect(bar.getByText("Paused")).toBeVisible();
    await bar.getByRole("button", { name: "Expand timer" }).click();
    await overlay.getByRole("button", { name: "End" }).click();
    await expect(overlay).toHaveCount(0);
    await expect(bar).toHaveCount(0);
    // The add button is back above the finish bar, not stuck at the bottom.
    const fab = await page.getByRole("button", { name: "Add block" }).boundingBox();
    const finish = await page.getByRole("button", { name: "Finish workout" }).boundingBox();
    expect(fab!.y + fab!.height).toBeLessThan(finish!.y);
    const sets = await draftSets(page);
    expect(sets["ham-1"]?.completed).toBeFalsy();
    await expect(page.getByRole("button", { name: "Start superset" })).toBeVisible();
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

// ── Tap targets ───────────────────────────────────────────────────────────────

test("every workout-screen control is at least 40px tall", async ({ page }) => {
  await seedSession(page, {
    session: makeSession([
      makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 5, 100), makeSet("s2", 1, 5, 100)]),
      makeStrengthBlock("b2", 1, "Row", [makeSet("s3", 0, 8, 60)]),
      {
        id: "m1", type: "mobility", orderIndex: 2,
        data: { drillName: "Couch Stretch", metric: "hold", perSide: true, sets: [
          { id: "ms1", orderIndex: 0, side: "left", durationSec: 30, completed: true },
          { id: "ms2", orderIndex: 1, side: "right" },
        ] },
      },
      {
        id: "m2", type: "mobility", orderIndex: 3,
        data: { drillName: "Cat Cow", metric: "reps", perSide: false, sets: [{ id: "ms3", orderIndex: 0, reps: 8 }] },
      },
      {
        id: "c1", type: "cardio", orderIndex: 4,
        data: { activityName: "Rower", intervals: [{ id: "i1", orderIndex: 0, durationMs: 300_000, distanceM: 1000, note: null }] },
      },
    ]),
  });
  await goToSession(page);
  await expect(page.getByTestId("set-weight").first()).toBeVisible();

  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, a[href], input, [role=button]")]
      .map((el) => {
        // A pick-one segment's tap area covers its whole track (an ::after over the
        // track's padding), so it's measured by the track.
        const seg = el.hasAttribute("aria-pressed") && el.parentElement?.classList.contains("p-[3px]");
        return { el, r: (seg ? el.parentElement! : el).getBoundingClientRect() };
      })
      // Swipe actions sit behind their row until revealed; they're 40px too.
      .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 40)
      .map(({ el, r }) => `${el.getAttribute("aria-label") ?? el.textContent?.trim()} (${Math.round(r.height)}px)`),
  );
  expect(small).toEqual([]);
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

  test("a session note is saved and shown on the recap", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 5, 100)]),
      ]),
    });
    await goToSession(page);

    await page.getByRole("button", { name: "+ Session note" }).click();
    const note = page.locator('textarea[placeholder^="Session note"]');
    await note.fill("felt strong today");
    await note.blur();

    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(page.getByText("felt strong today")).toBeVisible();
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

    // Per-exercise breakdown lists what was done.
    await expect(page.getByText("What you did")).toBeVisible();
    await expect(page.getByText("5×100").first()).toBeVisible();
  });

  test("recap keeps the buttons on screen with a long summary", async ({ page }) => {
    const names = ["Bench Press", "Incline Press", "Row", "Pulldown", "Curl", "Pushdown", "Lateral Raise", "Leg Press"];
    await seedSession(page, {
      session: makeSession(
        names.map((name, i) =>
          makeStrengthBlock(`b${i}`, i, name, [0, 1, 2, 3].map((j) => makeSet(`s${i}-${j}`, j, 8, 40 + j * 5))),
        ),
      ),
    });
    await goToSession(page);
    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(page.getByText("Workout complete")).toBeVisible();

    await expect(page.getByRole("button", { name: "Save & finish" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Back to workout" })).toBeInViewport();
  });

  test("recap shows assisted sets as BW and leaves them out of volume without a bodyweight", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Dips", [makeSet("s1", 0, 5, 2.5), makeSet("s2", 1, 8, -25)]),
        makeStrengthBlock("b2", 1, "Pec Deck", [makeSet("s3", 0, 10, 50)]),
      ]),
      // Pec Deck has history (and no PR today), so Dips is the only first-timer
      // and gets its own card.
      history: [makeCompletedSession("Pec Deck", [makeSet("ps1", 0, 10, 60)])],
    });
    await goToSession(page);
    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(page.getByText("Workout complete")).toBeVisible();

    const breakdown = page.locator("text=What you did").locator("xpath=following-sibling::*[1]");
    await expect(breakdown.getByText("8×BW−25")).toBeVisible();
    await expect(breakdown.getByText("5×BW+2.5")).toBeVisible();
    // The first-time PR card uses the same BW form, with no 1RM estimate.
    await expect(page.getByText("5 reps @ BW+2.5 kg")).toBeVisible();
    // Only the 10 × 50 pec deck: with no bodyweight known the dips aren't
    // counted, so the assisted set doesn't subtract 200 either.
    await expect(page.getByText("500", { exact: true })).toBeVisible();
  });

  test("recap groups first-time exercises into one card", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 5, 80)]),
        makeStrengthBlock("b2", 1, "Squat", [makeSet("s2", 0, 5, 100)]),
        makeStrengthBlock("b3", 2, "Row", [makeSet("s3", 0, 8, 60)]),
      ]),
    });
    await goToSession(page);
    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(page.getByText("Workout complete")).toBeVisible();

    await expect(page.getByText("3 new exercises")).toBeVisible();
    await expect(page.getByText(/Bench Press, Squat, Row/)).toBeVisible();
    await expect(page.getByText("5 reps @ 80 kg")).toHaveCount(0);
  });

  test("recap counts bodyweight work at bodyweight ± the logged number", async ({ page }) => {
    await seedSession(page, {
      bodyweightKg: 90,
      session: makeSession([
        makeStrengthBlock("b1", 0, "Dips", [makeSet("s1", 0, 5, 2.5), makeSet("s2", 1, 8, -25)]),
        makeStrengthBlock("b2", 1, "Pull-Up", [makeSet("s3", 0, 6, 0)]),
        makeStrengthBlock("b3", 2, "Pec Deck", [makeSet("s4", 0, 10, 50)]),
      ]),
    });
    await goToSession(page);
    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(page.getByText("Workout complete")).toBeVisible();

    // Dips 5 × 92.5 + 8 × 65 = 983 (rounded), pull-ups 6 × 90 = 540, pec deck 500.
    const breakdown = page.locator("text=What you did").locator("xpath=following-sibling::*[1]");
    await expect(breakdown.getByText("2 sets · 983 kg")).toBeVisible();
    await expect(breakdown.getByText("1 set · 540 kg")).toBeVisible();
    // Hero total: 982.5 + 540 + 500 = 2,022.5 → 2,023.
    await expect(page.getByText("2,023", { exact: true })).toBeVisible();
  });

  test("recap brackets superset exercises in the breakdown", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 8, 60)]),
        makeStrengthBlock("b2", 1, "Row", [makeSet("s2", 0, 8, 40)]),
      ]),
    });
    await goToSession(page);
    await groupWith(page, ["Row"]);
    await expect(page.getByText("SUPERSET")).toBeVisible();

    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(page.getByText("Workout complete")).toBeVisible();

    // The breakdown shows a "Superset" bracket over both members.
    const breakdown = page.locator("text=What you did").locator("xpath=following-sibling::*[1]");
    await expect(breakdown.getByText("Superset")).toBeVisible();
    await expect(breakdown.getByText("Bench Press")).toBeVisible();
    await expect(breakdown.getByText("Row", { exact: true })).toBeVisible();
  });

  test("recap celebrates a weight PR against history", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 3, 110)]),
      ]),
      history: [makeCompletedSession("Bench Press", [makeSet("ps1", 0, 5, 100)])],
    });
    await goToSession(page);

    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(page.getByText("Workout complete")).toBeVisible();
    await expect(page.getByText("Bench Press Weight PR")).toBeVisible();
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

    // finish() clears the draft asynchronously after navigation — poll for it.
    await page.waitForFunction(
      () => localStorage.getItem("logit:draft:v1") === null,
      { timeout: 5000 },
    );
  });
});

// ── Discard session ───────────────────────────────────────────────────────────

test.describe("discard session", () => {
  test("'Discard workout' asks for confirmation before discarding", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 5, 100)]),
      ]),
    });
    await goToSession(page);

    await page.getByRole("button", { name: "Discard workout" }).click();

    // Confirm dialog — the draft is untouched until the user confirms
    await expect(page.getByText("Discard this workout?")).toBeVisible();
    const draftStillThere = await page.evaluate(() => localStorage.getItem("logit:draft:v1"));
    expect(draftStillThere).not.toBeNull();

    await page.getByRole("button", { name: "Keep going" }).click();
    await expect(page.getByText("Discard this workout?")).not.toBeVisible();
    await expect(page.getByText("Bench Press")).toBeVisible();
  });

  test("confirming discard clears the draft and navigates home", async ({ page }) => {
    await seedSession(page, {
      session: makeSession([
        makeStrengthBlock("b1", 0, "Bench Press", [makeSet("s1", 0, 5, 100)]),
      ]),
    });
    await goToSession(page);

    await page.getByRole("button", { name: "Discard workout" }).click();
    await page.getByRole("button", { name: "Discard", exact: true }).click();

    await page.waitForURL(/^\http:\/\/localhost:5173\/$/, { timeout: 10_000 });

    await page.waitForFunction(
      () => localStorage.getItem("logit:draft:v1") === null,
      { timeout: 5000 },
    );
  });
});

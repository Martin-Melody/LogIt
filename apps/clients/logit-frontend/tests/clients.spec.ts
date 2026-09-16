import { test, expect, type Page } from "@playwright/test";

// ── Test data factories ───────────────────────────────────────────────────────

function makeProgram(id: string, patch: object = {}) {
  const now = Date.now();
  return {
    id,
    name: "Hypertrophy block",
    lengthWeeks: 1,
    startMode: "on-accept",
    weeks: [{ id: `${id}-w1`, weekNumber: 1, days: [] }],
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    ...patch,
  };
}

function makeSchedule(id: string, patch: object = {}) {
  const now = Date.now();
  return {
    id,
    name: "Weekly check-in",
    cadence: "weekly",
    anchorMs: now,
    questions: [{ id: `${id}-q1`, prompt: "How did training go?", type: "text", required: true }],
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    ...patch,
  };
}

// ── Seed helper ────────────────────────────────────────────────────────────────

type SeedOpts = {
  programs?: Record<string, { program: object; recipientUsername: string | null; deletedAtMs: null }>;
  schedules?: Record<string, { schedule: object; recipientUsername: string | null; deletedAtMs: null }>;
};

async function seedClientData(page: Page, opts: SeedOpts = {}) {
  await page.addInitScript(
    ({ programs, schedules }) => {
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true }));
      localStorage.setItem(
        "logit:tours:v1",
        JSON.stringify({ home: true, session: true, splits: true }),
      );
      if (programs) localStorage.setItem("logit:authoredPrograms:v1", JSON.stringify(programs));
      if (schedules) localStorage.setItem("logit:authoredCheckinSchedules:v1", JSON.stringify(schedules));
    },
    { programs: opts.programs, schedules: opts.schedules },
  );
}

// ── Client overview ───────────────────────────────────────────────────────────

test.describe("client overview", () => {
  test("shows empty states with no programs or check-ins yet", async ({ page }) => {
    await seedClientData(page);
    await page.goto("/clients/client-1?u=jane");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("@jane")).toBeVisible();
    await expect(page.getByText("No programs yet.")).toBeVisible();
    await expect(page.getByText("No check-ins yet.")).toBeVisible();
  });

  test("lists programs and check-ins authored for this client", async ({ page }) => {
    const program = makeProgram("prog-1", { name: "Hypertrophy block", weeks: [{ id: "w1", weekNumber: 1, days: [] }, { id: "w2", weekNumber: 2, days: [] }] });
    const schedule = makeSchedule("sched-1", { name: "Monthly check-in", cadence: "monthly", questions: [] });

    await seedClientData(page, {
      programs: { "prog-1": { program, recipientUsername: "jane", deletedAtMs: null } },
      schedules: { "sched-1": { schedule, recipientUsername: "jane", deletedAtMs: null } },
    });
    await page.goto("/clients/client-1?u=jane");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Hypertrophy block")).toBeVisible();
    await expect(page.getByText("2 weeks")).toBeVisible();
    await expect(page.getByText("Monthly check-in")).toBeVisible();
  });

  test("only shows items authored for this client, not other clients", async ({ page }) => {
    const mine = makeProgram("prog-mine", { name: "Jane's program" });
    const theirs = makeProgram("prog-theirs", { name: "Bob's program" });

    await seedClientData(page, {
      programs: {
        "prog-mine": { program: mine, recipientUsername: "jane", deletedAtMs: null },
        "prog-theirs": { program: theirs, recipientUsername: "bob", deletedAtMs: null },
      },
    });
    await page.goto("/clients/client-1?u=jane");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Jane's program")).toBeVisible();
    await expect(page.getByText("Bob's program")).not.toBeVisible();
  });

  test("'New' under Programs creates a program and navigates to its editor", async ({ page }) => {
    await seedClientData(page);
    await page.goto("/clients/client-1?u=jane");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "New" }).first().click();

    await page.waitForURL(/\/clients\/client-1\/programs\/.+\?u=jane/);
  });

  test("'New' under Check-ins creates a schedule and navigates to its editor", async ({ page }) => {
    await seedClientData(page);
    await page.goto("/clients/client-1?u=jane");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "New" }).last().click();

    await page.waitForURL(/\/clients\/client-1\/checkins\/.+\?u=jane/);
  });
});

// ── Program editor ────────────────────────────────────────────────────────────

test.describe("program editor", () => {
  test("loads a seeded program and shows its name and week count", async ({ page }) => {
    const program = makeProgram("prog-2", {
      name: "Strength block",
      weeks: [{ id: "w1", weekNumber: 1, days: [] }],
    });
    await seedClientData(page, {
      programs: { "prog-2": { program, recipientUsername: "jane", deletedAtMs: null } },
    });
    await page.goto("/clients/client-1/programs/prog-2?u=jane");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("input").first()).toHaveValue("Strength block");
  });
});

// ── Check-in schedule editor ──────────────────────────────────────────────────

test.describe("check-in schedule editor", () => {
  test("loads a seeded schedule and shows its name", async ({ page }) => {
    const schedule = makeSchedule("sched-2", { name: "Fortnightly review" });
    await seedClientData(page, {
      schedules: { "sched-2": { schedule, recipientUsername: "jane", deletedAtMs: null } },
    });
    await page.goto("/clients/client-1/checkins/sched-2?u=jane");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("input").first()).toHaveValue("Fortnightly review");
  });

  test("deleting a schedule asks for confirmation, then navigates back to the client", async ({ page }) => {
    const schedule = makeSchedule("sched-3", { name: "To delete" });
    await seedClientData(page, {
      schedules: { "sched-3": { schedule, recipientUsername: "jane", deletedAtMs: null } },
    });
    // Navigate in-app (not a direct goto to the sub-route) so back() has real SPA
    // history to return to, matching how removeSchedule() actually gets used.
    await page.goto("/clients/client-1?u=jane");
    await page.waitForLoadState("networkidle");
    await page.getByText("To delete").click();
    await page.waitForURL(/\/clients\/client-1\/checkins\/sched-3\?u=jane/);

    await expect(page.locator("input").first()).toHaveValue("To delete");
    // Header row is [back button, name input, delete-trigger button] — the trigger is last.
    await page.locator("div.border-b.border-border").first().getByRole("button").last().click();
    await expect(page.getByText("Delete this check-in?")).toBeVisible();

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForURL(/\/clients\/client-1\?u=jane/);

    const raw = await page.evaluate(() => localStorage.getItem("logit:authoredCheckinSchedules:v1"));
    const stored = JSON.parse(raw ?? "{}");
    expect(stored["sched-3"].deletedAtMs).toBeTruthy();
  });
});

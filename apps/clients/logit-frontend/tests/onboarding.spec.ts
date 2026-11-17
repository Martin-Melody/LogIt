import { test, expect, type Page } from "@playwright/test";

const API_BASE = "http://localhost:5118";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Clear all state and start onboarding fresh from step 0. */
async function resetState(page: Page) {
  await page.addInitScript(() => localStorage.clear());
}

/**
 * Seed localStorage so the onboarding page opens at a specific step.
 * Pass `extra` for any additional keys (e.g. auth tokens, server mode).
 */
async function seedAtStep(page: Page, step: number, extra?: Record<string, string>) {
  await page.addInitScript(
    ({ step, extra }) => {
      localStorage.clear();
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: false, step }));
      localStorage.setItem("logit:tours:v1", JSON.stringify({ home: true, session: true, splits: true }));
      if (extra) {
        for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
      }
    },
    { step, extra },
  );
}

/** Answers already given, so a test can open the plan screen straight away. */
async function seedAnswers(page: Page, step: number, answers: Record<string, unknown>) {
  await seedAtStep(page, step, { "logit:onboarding:answers": JSON.stringify(answers) });
}

async function savedSplits(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("logit:splits:v1");
    return raw ? (JSON.parse(raw) as { name: string; schedule?: string; days: { name?: string; weekday?: number }[] }[]) : null;
  });
}

async function onboardingState(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("logit:onboarding:v1");
    return raw ? (JSON.parse(raw) as { completed: boolean; step: number }) : null;
  });
}

const atHome = (u: URL) => u.pathname === "/";

async function goToOnboarding(page: Page) {
  await page.goto("/onboarding");
  await page.waitForLoadState("networkidle");
}

function unique(prefix: string) {
  return `${prefix}_${Date.now()}`;
}

async function deleteTestAccount(accessToken: string) {
  await fetch(`${API_BASE}/auth/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: "TestPass123!" }),
  }).catch(() => {});
}

// ── Welcome (step 0) ─────────────────────────────────────────────────────────

test.describe("welcome screen", () => {
  test("says what the app does for you", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await expect(page.getByRole("heading", { name: "Logit" })).toBeVisible();
    await expect(page.getByText("without guessing the weights")).toBeVisible();
    await expect(page.getByText("Know what to lift, every set")).toBeVisible();
    await expect(page.getByText("no account needed")).toBeVisible();
  });

  test("'Get started' asks for the goal", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Get started" }).click();

    await expect(page.getByRole("heading", { name: "What do you want from training?" })).toBeVisible();
  });

  test("'I already have an account' goes to sign in", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "I already have an account" }).click();

    await page.waitForURL(/\/auth/);
  });
});

// ── The questions (steps 1–3) ────────────────────────────────────────────────

test.describe("questions", () => {
  test("one tap each: goal, experience, days, with the goal echoed back", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);
    await page.getByRole("button", { name: "Get started" }).click();

    await page.getByRole("button", { name: /^Both/ }).click();
    await expect(page.getByRole("heading", { name: "How long have you been lifting?" })).toBeVisible();
    await expect(page.getByText("Stronger and bigger")).toBeVisible();

    await page.getByRole("button", { name: /^Under 2 years/ }).click();
    await expect(page.getByRole("heading", { name: "How many days a week can you train?" })).toBeVisible();

    await page.getByRole("button", { name: /^4 days/ }).click();
    await expect(page.getByRole("heading", { name: "Stronger and bigger in 4 days a week" })).toBeVisible();
  });

  test("Back goes to the previous question with the answer still picked", async ({ page }) => {
    await seedAnswers(page, 3, { goal: "muscle", experience: "new" });
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.getByRole("heading", { name: "How long have you been lifting?" })).toBeVisible();
    await expect(page.getByText("Bigger", { exact: true })).toBeVisible();
  });

  test("'Not sure?' picks 3 days", async ({ page }) => {
    await seedAnswers(page, 3, { goal: "fit", experience: "new" });
    await goToOnboarding(page);

    await page.getByRole("button", { name: /Not sure\?/ }).click();

    await expect(page.getByRole("heading", { name: "Fit in 3 days a week" })).toBeVisible();
    await expect(page.getByText("Full Body", { exact: true })).toBeVisible();
  });
});

// ── Your plan (step 4) ───────────────────────────────────────────────────────

test.describe("your plan", () => {
  const answers = { goal: "both", experience: "under2", days: 4, equipment: "gym", minutes: 45 };

  test("shows the plan, its week and the first workout with sets and rep ranges", async ({ page }) => {
    await seedAnswers(page, 4, answers);
    await goToOnboarding(page);

    await expect(page.getByText("Upper / Lower", { exact: true })).toBeVisible();
    await expect(page.getByText(/First up: Upper A · about \d+ min/)).toBeVisible();
    await expect(page.getByText("Bench Press", { exact: true })).toBeVisible();
    await expect(page.getByText("3 × 5–8").first()).toBeVisible();
  });

  test("the equipment chip swaps exercises in place", async ({ page }) => {
    await seedAnswers(page, 4, answers);
    await goToOnboarding(page);

    await page.getByLabel("Equipment").selectOption("dumbbells");

    await expect(page.getByText("Dumbbell Bench Press", { exact: true })).toBeVisible();
    await expect(page.getByText("Bench Press", { exact: true })).not.toBeVisible();
  });

  test("'Other plans' switches to another plan", async ({ page }) => {
    await seedAnswers(page, 4, answers);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Other plans" }).click();
    await page.getByRole("button", { name: /^Push \/ Pull \/ Legs/ }).click();

    await expect(page.getByRole("heading", { name: "Stronger and bigger in 3 days a week" })).toBeVisible();
    await expect(page.getByText(/First up: Push/)).toBeVisible();
  });

  test("'Start … now' saves the plan on a weekday schedule and opens the workout", async ({ page }) => {
    await seedAnswers(page, 4, answers);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Start Upper A now" }).click();

    await page.waitForURL(/\/session\/current/, { timeout: 10_000 });
    const splits = await savedSplits(page);
    expect(splits?.map((s) => s.name)).toEqual(["Upper / Lower"]);
    expect(splits?.[0]?.schedule).toBe("weekdays");
    expect(splits?.[0]?.days.map((d) => d.weekday)).toEqual([1, 2, 4, 5]);
    expect((await onboardingState(page))?.completed).toBe(true);
  });

  test("'I'll start later' saves the plan and goes home", async ({ page }) => {
    await seedAnswers(page, 4, answers);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "I'll start later" }).click();

    await page.waitForURL(atHome, { timeout: 10_000 });
    expect((await savedSplits(page))?.map((s) => s.name)).toEqual(["Upper / Lower"]);
    expect((await onboardingState(page))?.completed).toBe(true);
  });

  test("'Build my own' makes an empty split and opens it", async ({ page }) => {
    await seedAnswers(page, 4, answers);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Other plans" }).click();
    await page.getByRole("button", { name: "Build my own" }).click();

    await page.waitForURL(/\/splits\//, { timeout: 10_000 });
    expect((await savedSplits(page))?.map((s) => s.name)).toEqual(["My split"]);
    expect((await onboardingState(page))?.completed).toBe(true);
  });
});

// ── The first workout (O4) and after it (O5, O6) ────────────────────────────

test.describe("first workout", () => {
  const answers = { goal: "both", experience: "under2", days: 4, equipment: "gym", minutes: 45 };

  test("an exercise never done before says how heavy to go for the first set", async ({ page }) => {
    await seedAnswers(page, 4, answers);
    await goToOnboarding(page);
    await page.getByRole("button", { name: "Start Upper A now" }).click();
    await page.waitForURL(/\/session\/current/, { timeout: 10_000 });

    await page.keyboard.press("Escape"); // the workout walkthrough
    // Bench Press is in the 5–8 range: "about 8 times". The first exercise opens by itself.
    await expect(page.getByText("First time? Pick a weight you could lift about 8 times.").first()).toBeVisible({ timeout: 10_000 });
  });

  test("after workout 3, 'Not now' to saving the training goes home", async ({ page }) => {
    await seedAtStep(page, 0);
    await page.addInitScript(() => localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 })));
    await page.goto("/onboarding/first-workout?id=x&save=again");

    await expect(page.getByRole("dialog", { name: /workouts on this phone only/ })).toBeVisible();
    await page.getByRole("button", { name: "Not now" }).click();
    await page.waitForURL(atHome);
    expect(await page.evaluate(() => localStorage.getItem("logit:onboarding:saveAsked"))).toBe("1");
  });

  test("'Save to a free account' opens sign-up", async ({ page }) => {
    await seedAtStep(page, 0);
    await page.addInitScript(() => localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 })));
    await page.goto("/onboarding/first-workout?id=x&save=again");

    await page.getByRole("button", { name: "Save to a free account" }).click();
    await page.waitForURL(/\/auth\?mode=register/);
  });
});

// ── Week one (O7, O9) ────────────────────────────────────────────────────────

test.describe("week one", () => {
  const answers = { goal: "both", experience: "under2", days: 4, equipment: "gym", minutes: 45 };

  test("Home shows 'Your first week' with the plan's days", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-17T09:00:00")); // a Tuesday
    await seedAnswers(page, 4, answers);
    await goToOnboarding(page);
    await page.getByRole("button", { name: "I'll start later" }).click();
    await page.waitForURL(atHome, { timeout: 10_000 });

    await expect(page.getByText("Your first week", { exact: true })).toBeVisible();
    await expect(page.getByText("0 of 4 done. Finish all 4 for your first week on the streak.")).toBeVisible();
    await page.screenshot({ path: "test-results/first-week-home.png" });
  });

  test("the week-complete screen says who they are now", async ({ page }) => {
    await seedAtStep(page, 0);
    await page.addInitScript(() => localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 })));
    await page.goto("/onboarding/week-done");

    await expect(page.getByRole("heading", { name: /You're someone who trains/ })).toBeVisible();
    await page.getByRole("button", { name: "Onto week 2" }).click();
    await page.waitForURL(atHome);
  });
});

// ── Returning user via the welcome-screen login link — requires live API ─────

test.describe("returning user - requires API", () => {
  let cleanupToken: string | null = null;

  test.afterEach(async () => {
    if (cleanupToken) {
      await deleteTestAccount(cleanupToken);
      cleanupToken = null;
    }
  });

  test("API is reachable", async () => {
    const res = await fetch(`${API_BASE}/health`).catch(() => null);
    expect(res?.ok, `API not reachable at ${API_BASE} — is the server running?`).toBeTruthy();
  });

  test("logging in from the welcome screen skips setup and lands at /", async ({ page }) => {
    const username = unique("onblogin");
    const email = `${username}@test.example`;

    const registerRes = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password: "TestPass123!", displayName: username }),
    });
    expect(registerRes.ok).toBeTruthy();
    const { accessToken } = await registerRes.json();
    cleanupToken = accessToken;

    await fetch(`${API_BASE}/users/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ onboardingCompleted: true }),
    });

    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("logit:server:mode", "selfhosted");
      localStorage.setItem("logit:api:baseUrl", "http://localhost:5118");
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
    });

    await goToOnboarding(page);
    await page.getByRole("button", { name: "I already have an account" }).click();
    await page.waitForURL(/\/auth/);

    await page.locator('input[id="username"]').fill(username);
    await page.locator('input[id="password"]').fill("TestPass123!");
    await page.locator("form").getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL((u) => u.pathname === "/", { timeout: 15_000 });
  });
});

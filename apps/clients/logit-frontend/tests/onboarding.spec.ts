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

// ── Welcome screen (step 0) ──────────────────────────────────────────────────

test.describe("welcome screen", () => {
  test("shows branding and key selling points", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await expect(page.getByRole("heading", { name: "Logit" })).toBeVisible();
    await expect(page.getByText("Track your training. Own your data.")).toBeVisible();
    await expect(page.getByText("Track every set, rep, and PR")).toBeVisible();
    await expect(page.getByText("Works fully offline")).toBeVisible();
    await expect(page.getByText("Open source")).toBeVisible();
  });

  test("'Get started' advances to the name step", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Get started" }).click();

    await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  });

  test("'Already have an account?' link goes to /auth", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await page.getByRole("link", { name: /Already have an account/i }).click();

    await page.waitForURL(/\/auth/);
    expect(page.url()).toContain("/auth");
  });
});

// ── Name step (step 1) ───────────────────────────────────────────────────────

test.describe("name step", () => {
  test("Continue is disabled when name is empty", async ({ page }) => {
    await seedAtStep(page, 1);
    await goToOnboarding(page);

    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  test("Continue is enabled once a name is typed", async ({ page }) => {
    await seedAtStep(page, 1);
    await goToOnboarding(page);

    await page.locator('input[id="name"]').fill("Martin");

    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  test("Continue saves name and advances to split step", async ({ page }) => {
    await seedAtStep(page, 1);
    await goToOnboarding(page);

    await page.locator('input[id="name"]').fill("Martin");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Choose a training split" })).toBeVisible();

    const profile = await page.evaluate(() => {
      const raw = localStorage.getItem("logit:profile:v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(profile?.name).toBe("Martin");
  });

  test("'Skip for now' advances to split step without saving a name", async ({ page }) => {
    await seedAtStep(page, 1);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Skip for now" }).click();

    await expect(page.getByRole("heading", { name: "Choose a training split" })).toBeVisible();

    const profile = await page.evaluate(() => {
      const raw = localStorage.getItem("logit:profile:v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(profile?.name ?? "").toBe("");
  });

  test("Back button returns to welcome screen", async ({ page }) => {
    await seedAtStep(page, 1);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.getByRole("heading", { name: "Logit" })).toBeVisible();
  });
});

// ── Split step (step 2) ──────────────────────────────────────────────────────

test.describe("split step", () => {
  test("shows all four preset options", async ({ page }) => {
    await seedAtStep(page, 2);
    await goToOnboarding(page);

    await expect(page.getByText("Push / Pull / Legs")).toBeVisible();
    await expect(page.getByText("Upper / Lower")).toBeVisible();
    await expect(page.getByText("Full Body")).toBeVisible();
    await expect(page.getByText("Start blank")).toBeVisible();
  });

  test("Continue is disabled until a preset is selected", async ({ page }) => {
    await seedAtStep(page, 2);
    await goToOnboarding(page);

    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  test("selecting a preset enables Continue", async ({ page }) => {
    await seedAtStep(page, 2);
    await goToOnboarding(page);

    await page.getByText("Push / Pull / Legs").click();

    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  test("continuing with PPL saves a split and completes onboarding", async ({ page }) => {
    await seedAtStep(page, 2);
    await goToOnboarding(page);

    await page.getByText("Push / Pull / Legs").click();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.waitForURL(/^http:\/\/localhost:5173\/$/, { timeout: 8000 });
    expect(page.url()).toBe("http://localhost:5173/");

    const splits = await page.evaluate(() => {
      const raw = localStorage.getItem("logit:splits:v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(Array.isArray(splits)).toBe(true);
    expect(splits.length).toBeGreaterThan(0);
    expect(splits[0].name).toBe("Push / Pull / Legs");

    const state = await page.evaluate(() => {
      const raw = localStorage.getItem("logit:onboarding:v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(state?.completed).toBe(true);
  });

  test("'Skip for now' completes onboarding without saving a split", async ({ page }) => {
    await seedAtStep(page, 2);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Skip for now" }).click();

    await page.waitForURL(/^http:\/\/localhost:5173\/$/, { timeout: 8000 });

    const splits = await page.evaluate(() => localStorage.getItem("logit:splits:v1"));
    expect(splits).toBeNull();

    const state = await page.evaluate(() => {
      const raw = localStorage.getItem("logit:onboarding:v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(state?.completed).toBe(true);
  });

  test("Back button returns to name step with the name preserved", async ({ page }) => {
    await seedAtStep(page, 2, {
      "logit:profile:v1": JSON.stringify({ name: "Martin", bio: "", height: null, heightUnit: "cm", weight: null, weightUnit: "kg", blocksCollapsedByDefault: true, restDefaults: {} }),
    });
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
    await expect(page.locator('input[id="name"]')).toHaveValue("Martin");
  });
});

// ── Full first-run path (offline, no account) ────────────────────────────────

test.describe("full first-run path", () => {
  test("name → PPL split → lands at / with the split saved and no account prompt", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Get started" }).click();

    await page.locator('input[id="name"]').fill("Martin");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Choose a training split" })).toBeVisible();
    await page.getByText("Push / Pull / Legs").click();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.waitForURL(/^http:\/\/localhost:5173\/$/, { timeout: 8000 });

    const splits = await page.evaluate(() => {
      const raw = localStorage.getItem("logit:splits:v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(splits[0].name).toBe("Push / Pull / Legs");
    expect(splits[0].days).toHaveLength(3);
  });

  test("skipping everything still lands at / with onboarding marked complete", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByRole("button", { name: "Skip for now" }).click(); // name
    await expect(page.getByRole("heading", { name: "Choose a training split" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click(); // split

    await page.waitForURL(/^http:\/\/localhost:5173\/$/, { timeout: 8000 });

    const state = await page.evaluate(() => {
      const raw = localStorage.getItem("logit:onboarding:v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(state?.completed).toBe(true);
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
    await page.getByRole("link", { name: /Already have an account/i }).click();
    await page.waitForURL(/\/auth/);

    await page.locator('input[id="username"]').fill(username);
    await page.locator('input[id="password"]').fill("TestPass123!");
    await page.locator("form").getByRole("button", { name: "Log in" }).click();

    await page.waitForURL(/^http:\/\/localhost:5173\/$/, { timeout: 15_000 });
    expect(page.url()).toBe("http://localhost:5173/");
  });
});

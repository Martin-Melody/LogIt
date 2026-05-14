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
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
}

// ── Welcome screen (step 0) ──────────────────────────────────────────────────

test.describe("welcome screen", () => {
  test("shows branding and key selling points", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await expect(page.getByRole("heading", { name: "Logit" })).toBeVisible();
    await expect(page.getByText("Track your training. Own your data.")).toBeVisible();
    await expect(page.getByText("No account required")).toBeVisible();
    await expect(page.getByText("Everything stays on your device")).toBeVisible();
    await expect(page.getByText("Free and open source")).toBeVisible();
  });

  test("'Get started' advances to the profile step", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Get started" }).click();

    await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
  });

  test("'Already have an account?' link goes to /auth", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await page.getByRole("link", { name: /Already have an account/i }).click();

    await page.waitForURL(/\/auth/);
    expect(page.url()).toContain("/auth");
  });
});

// ── Profile step (step 1) ────────────────────────────────────────────────────

test.describe("profile step", () => {
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

  test("optional fields (bio, height, weight) save when filled", async ({ page }) => {
    await seedAtStep(page, 1);
    await goToOnboarding(page);

    await page.locator('input[id="name"]').fill("Martin");
    await page.locator('textarea[id="bio"]').fill("Powerlifter");
    await page.locator('input[id="height"]').fill("182");
    await page.locator('input[id="weight"]').fill("90");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Choose a training split" })).toBeVisible();

    const profile = await page.evaluate(() => {
      const raw = localStorage.getItem("logit:profile:v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(profile?.name).toBe("Martin");
    expect(profile?.bio).toBe("Powerlifter");
    expect(profile?.height).toBe(182);
    expect(profile?.weight).toBe(90);
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

  test("continuing with PPL saves a split and advances to notifications", async ({ page }) => {
    await seedAtStep(page, 2);
    await goToOnboarding(page);

    await page.getByText("Push / Pull / Legs").click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Stay on track" })).toBeVisible();

    const splits = await page.evaluate(() => {
      const raw = localStorage.getItem("logit:splits:v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(Array.isArray(splits)).toBe(true);
    expect(splits.length).toBeGreaterThan(0);
    expect(splits[0].name).toBe("Push / Pull / Legs");
  });

  test("'Skip for now' advances to notifications without saving a split", async ({ page }) => {
    await seedAtStep(page, 2);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Skip for now" }).click();

    await expect(page.getByRole("heading", { name: "Stay on track" })).toBeVisible();

    const splits = await page.evaluate(() => localStorage.getItem("logit:splits:v1"));
    expect(splits).toBeNull();
  });

  test("Back button returns to profile step with name preserved", async ({ page }) => {
    await seedAtStep(page, 2, {
      "logit:profile:v1": JSON.stringify({ name: "Martin", bio: "", height: null, heightUnit: "cm", weight: null, weightUnit: "kg", blocksCollapsedByDefault: true, restDefaults: {} }),
    });
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
    await expect(page.locator('input[id="name"]')).toHaveValue("Martin");
  });
});

// ── Notifications step (step 3) ──────────────────────────────────────────────

test.describe("notifications step", () => {
  test("shows the notification prompt", async ({ page }) => {
    await seedAtStep(page, 3);
    await goToOnboarding(page);

    await expect(page.getByRole("heading", { name: "Stay on track" })).toBeVisible();
    await expect(page.getByText(/rest period/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Enable notifications" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
  });

  test("'Skip for now' advances to server/account step when not authenticated", async ({ page }) => {
    await seedAtStep(page, 3);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Skip for now" }).click();

    await expect(page.getByRole("heading", { name: "Connect an account" })).toBeVisible();
  });

  test("'Skip for now' completes onboarding and goes to / when already authenticated", async ({ page }) => {
    await seedAtStep(page, 3, {
      "logit:server:mode": "cloud",
      "logit:auth:access": "fake-access-token",
      "logit:auth:refresh": "fake-refresh-token",
      "logit:auth:user": JSON.stringify({
        id: "test-user-id",
        username: "testuser",
        displayName: "Test User",
        avatarUrl: null,
        tier: "free",
        onboardingCompleted: false,
      }),
    });
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Skip for now" }).click();

    await page.waitForURL(/^\http:\/\/localhost:5173\/$/, { timeout: 8000 });
    expect(page.url()).toBe("http://localhost:5173/");
  });

  test("Back button returns to split step", async ({ page }) => {
    await seedAtStep(page, 3);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.getByRole("heading", { name: "Choose a training split" })).toBeVisible();
  });
});

// ── Server / account step (step 4) ───────────────────────────────────────────

test.describe("server / account step", () => {
  test("shows three connection options", async ({ page }) => {
    await seedAtStep(page, 4);
    await goToOnboarding(page);

    await expect(page.getByText("Stay offline")).toBeVisible();
    await expect(page.getByText("Logit cloud")).toBeVisible();
    await expect(page.getByText("Self-hosted")).toBeVisible();
  });

  test("'Stay offline' completes onboarding and goes to /", async ({ page }) => {
    await seedAtStep(page, 4);
    await goToOnboarding(page);

    await page.getByText("Stay offline").click();

    await page.waitForURL(/^\http:\/\/localhost:5173\/$/, { timeout: 8000 });
    expect(page.url()).toBe("http://localhost:5173/");

    const state = await page.evaluate(() => {
      const raw = localStorage.getItem("logit:onboarding:v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(state?.completed).toBe(true);
  });

  test("'Logit cloud' shows login / register form", async ({ page }) => {
    await seedAtStep(page, 4);
    await goToOnboarding(page);

    await page.getByText("Logit cloud").click();

    await expect(page.getByRole("heading", { name: /Log in|Create account/ })).toBeVisible();
    await expect(page.locator('input[id="auth-username"]')).toBeVisible();
    await expect(page.locator('input[id="auth-password"]')).toBeVisible();
  });

  test("'Self-hosted' shows URL input", async ({ page }) => {
    await seedAtStep(page, 4);
    await goToOnboarding(page);

    await page.getByText("Self-hosted").click();

    await expect(page.getByRole("heading", { name: "Your server URL" })).toBeVisible();
    await expect(page.locator('input[id="server-url"]')).toBeVisible();
  });

  test("entering a self-hosted URL and continuing shows the auth form", async ({ page }) => {
    await seedAtStep(page, 4);
    await goToOnboarding(page);

    await page.getByText("Self-hosted").click();
    await page.locator('input[id="server-url"]').fill("https://logit.example.com");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: /Log in|Create account/ })).toBeVisible();
    await expect(page.getByText("logit.example.com")).toBeVisible();
  });

  test("can switch between Log in and Sign up on the auth form", async ({ page }) => {
    await seedAtStep(page, 4);
    await goToOnboarding(page);

    await page.getByText("Logit cloud").click();

    // Default is Log in
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
    await expect(page.locator('input[id="auth-email"]')).toBeVisible();
  });

  test("'Skip for now' on auth form completes onboarding and goes to /", async ({ page }) => {
    await seedAtStep(page, 4);
    await goToOnboarding(page);

    await page.getByText("Logit cloud").click();
    await expect(page.getByRole("heading", { name: /Log in|Create account/ })).toBeVisible();

    await page.getByRole("button", { name: "Skip for now" }).click();

    await page.waitForURL(/^\http:\/\/localhost:5173\/$/, { timeout: 8000 });
    expect(page.url()).toBe("http://localhost:5173/");
  });

  test("Back from self-hosted URL step returns to pick step", async ({ page }) => {
    await seedAtStep(page, 4);
    await goToOnboarding(page);

    await page.getByText("Self-hosted").click();
    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.getByText("Stay offline")).toBeVisible();
    await expect(page.getByText("Logit cloud")).toBeVisible();
  });

  test("Back from cloud auth form returns to pick step", async ({ page }) => {
    await seedAtStep(page, 4);
    await goToOnboarding(page);

    await page.getByText("Logit cloud").click();
    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.getByText("Stay offline")).toBeVisible();
  });
});

// ── Full offline paths ────────────────────────────────────────────────────────

test.describe("full offline path", () => {
  test("name only → skip split → skip notifications → stay offline → lands at /", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Get started" }).click();
    await page.locator('input[id="name"]').fill("Martin");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Choose a training split" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();

    await expect(page.getByRole("heading", { name: "Stay on track" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();

    await expect(page.getByText("Stay offline")).toBeVisible();
    await page.getByText("Stay offline").click();

    await page.waitForURL(/^\http:\/\/localhost:5173\/$/, { timeout: 8000 });
    expect(page.url()).toBe("http://localhost:5173/");
  });

  test("name + PPL split → skip notifications → stay offline → split is saved", async ({ page }) => {
    await resetState(page);
    await goToOnboarding(page);

    await page.getByRole("button", { name: "Get started" }).click();
    await page.locator('input[id="name"]').fill("Martin");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByText("Push / Pull / Legs").click();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Skip for now" }).click();

    await page.getByText("Stay offline").click();

    await page.waitForURL(/^\http:\/\/localhost:5173\/$/, { timeout: 8000 });

    const splits = await page.evaluate(() => {
      const raw = localStorage.getItem("logit:splits:v1");
      return raw ? JSON.parse(raw) : null;
    });
    expect(Array.isArray(splits)).toBe(true);
    expect(splits[0].name).toBe("Push / Pull / Legs");
    expect(splits[0].days).toHaveLength(3);
  });
});

// ── Online account — requires live API ───────────────────────────────────────

test.describe("online account - requires API", () => {
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

  test("registering via Logit cloud completes onboarding and lands at /", async ({ page }) => {
    await seedAtStep(page, 4, {
      "logit:server:mode": "selfhosted",
      "logit:api:baseUrl": API_BASE,
    });
    await goToOnboarding(page);

    await page.getByText("Logit cloud").click();
    await page.getByRole("button", { name: "Sign up" }).click();

    const username = unique("onb");
    const email = `${username}@test.example`;

    await page.locator('input[id="auth-username"]').fill(username);
    await page.locator('input[id="auth-email"]').fill(email);
    await page.locator('input[id="auth-password"]').fill("TestPass123!");

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/auth/register") && r.status() === 200,
    );
    await page.getByRole("button", { name: "Create account" }).click();

    const res = await responsePromise.catch(() => null);
    if (res) {
      const body = await res.json().catch(() => null);
      cleanupToken = body?.accessToken ?? null;
    }

    await page.waitForURL(/^\http:\/\/localhost:5173\/$/, { timeout: 15_000 });
    expect(page.url()).toBe("http://localhost:5173/");
  });

  test("logging in via self-hosted completes onboarding and lands at /", async ({ page }) => {
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

    await seedAtStep(page, 4, {
      "logit:server:mode": "selfhosted",
      "logit:api:baseUrl": API_BASE,
    });
    await goToOnboarding(page);

    await page.getByText("Self-hosted").click();
    await page.locator('input[id="server-url"]').fill(API_BASE);
    await page.getByRole("button", { name: "Continue" }).click();

    await page.locator('input[id="auth-username"]').fill(username);
    await page.locator('input[id="auth-password"]').fill("TestPass123!");
    await page.getByRole("button", { name: "Log in" }).click();

    await page.waitForURL(/^\http:\/\/localhost:5173\/$/, { timeout: 15_000 });
    expect(page.url()).toBe("http://localhost:5173/");
  });
});

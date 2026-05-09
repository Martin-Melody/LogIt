import { test, expect, type Page } from "@playwright/test";

const API_BASE = "http://localhost:5118";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Clear all auth/onboarding state so every test starts from a clean slate. */
async function resetState(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
  });
}

/** Seed only the server mode (no onboarding completion) so the online tab is usable. */
async function setServerMode(page: Page, mode: "cloud" | "selfhosted", url?: string) {
  await page.addInitScript(
    ({ mode, url }) => {
      localStorage.setItem("logit:server:mode", mode);
      if (mode === "selfhosted" && url) {
        localStorage.setItem("logit:api:baseUrl", url);
      }
    },
    { mode, url },
  );
}

async function goToAuth(page: Page) {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
}

function unique(prefix: string) {
  return `${prefix}_${Date.now()}`;
}

/** Delete a test account via the API so tests stay clean. */
async function deleteTestAccount(accessToken: string) {
  await fetch(`${API_BASE}/auth/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// ── Server setup UI ──────────────────────────────────────────────────────────

test.describe("server setup", () => {
  test("shows 'no server configured' warning by default", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await expect(page.getByText("No server configured")).toBeVisible();
    await expect(page.getByText("Set up")).toBeVisible();
  });

  test("'Set up' opens the server picker panel", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await page.getByText("Set up").click();
    await expect(page.getByText("Where do you want to connect?")).toBeVisible();
    await expect(page.getByText("Logit cloud")).toBeVisible();
    await expect(page.getByText("Self-hosted")).toBeVisible();
  });

  test("Logit cloud card says no server setup needed", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await page.getByText("Set up").click();
    await expect(page.getByText("no server setup needed")).toBeVisible();
  });

  test("selecting Logit cloud saves mode and shows Change button", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await page.getByText("Set up").click();
    // Click the Logit cloud card (has both the heading and the description)
    await page.locator("button").filter({ hasText: "Logit cloud" }).first().click();

    await expect(page.getByText("Logit cloud")).toBeVisible();
    await expect(page.getByRole("button", { name: /Change/ })).toBeVisible();
    await expect(page.getByText("No server configured")).not.toBeVisible();
  });

  test("Change button re-opens picker (not URL step)", async ({ page }) => {
    await resetState(page);
    await setServerMode(page, "cloud");
    await goToAuth(page);

    // Should show cloud indicator + Change button
    await expect(page.getByRole("button", { name: /Change/ })).toBeVisible();
    await page.getByRole("button", { name: /Change/ }).click();

    // Should be back at the pick step, not the URL step
    await expect(page.getByText("Where do you want to connect?")).toBeVisible();
    await expect(page.locator('input[type="url"]')).not.toBeVisible();
  });

  test("selecting Self-hosted shows URL input step", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await page.getByText("Set up").click();
    await page.locator("button").filter({ hasText: "Self-hosted" }).first().click();

    await expect(page.locator('input[type="url"]')).toBeVisible();
    await expect(page.getByText("Your server URL")).toBeVisible();
  });

  test("saving a self-hosted URL shows URL in indicator with Change button", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await page.getByText("Set up").click();
    await page.locator("button").filter({ hasText: "Self-hosted" }).first().click();

    await page.locator('input[type="url"]').fill("https://logit.example.com");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("logit.example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: /Change/ })).toBeVisible();
  });

  test("Change button on selfhosted opens picker so you can switch to cloud", async ({ page }) => {
    await resetState(page);
    await setServerMode(page, "selfhosted", "https://logit.example.com");
    await goToAuth(page);

    await page.getByRole("button", { name: /Change/ }).click();
    await expect(page.getByText("Where do you want to connect?")).toBeVisible();

    // Can now pick cloud
    await page.locator("button").filter({ hasText: "Logit cloud" }).first().click();
    await expect(page.getByText("Logit cloud")).toBeVisible();
    await expect(page.getByRole("button", { name: /Change/ })).toBeVisible();
  });

  test("Cancel button closes setup panel without changing mode", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await page.getByText("Set up").click();
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByText("No server configured")).toBeVisible();
    await expect(page.getByText("Where do you want to connect?")).not.toBeVisible();
  });
});

// ── Local account creation ───────────────────────────────────────────────────

test.describe("local account creation", () => {
  test("creating a local account redirects to /onboarding", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    // Switch to local account tab
    await page.getByRole("button", { name: "Local account" }).click();
    await expect(page.getByText("Data stays on this device")).toBeVisible();

    // Fill in name and submit
    await page.locator('input[id="offline-name"]').fill("Test User");
    await page.getByRole("button", { name: /Continue|Create account/ }).click();

    await page.waitForURL(/\/onboarding/, { timeout: 8000 });
    expect(page.url()).toContain("/onboarding");
  });

  test("local account creation without a name still redirects to /onboarding", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await page.getByRole("button", { name: "Local account" }).click();
    await page.getByRole("button", { name: /Continue|Create account/ }).click();

    await page.waitForURL(/\/onboarding/, { timeout: 8000 });
    expect(page.url()).toContain("/onboarding");
  });

  test("local account creation with password mismatch shows inline error", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await page.getByRole("button", { name: "Local account" }).click();
    await page.locator('input[id="offline-name"]').fill("Test User");
    await page.locator('input[id="offline-password"]').fill("password123");
    await page.locator('input[id="offline-confirm"]').fill("different");

    // Error appears inline while typing — no need to click the (correctly disabled) submit button
    await expect(page.getByText("Passwords don't match")).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue|Create account/ })).toBeDisabled();
  });
});

// ── Online account (requires live API at localhost:5118) ─────────────────────

test.describe("online account - requires API", () => {
  let cleanupToken: string | null = null;

  test.afterEach(async () => {
    if (cleanupToken) {
      await deleteTestAccount(cleanupToken).catch(() => {});
      cleanupToken = null;
    }
  });

  test("API is reachable", async () => {
    const res = await fetch(`${API_BASE}/health`).catch(() => null);
    expect(res?.ok, `API not reachable at ${API_BASE} — is the server running?`).toBeTruthy();
  });

  test("registering a new online account redirects to /onboarding", async ({ page }) => {
    // Use selfhosted pointing to the local dev API — "cloud" would hit production
    await setServerMode(page, "selfhosted", API_BASE);

    await goToAuth(page);

    // Verify selfhosted mode is shown
    await expect(page.getByText(/localhost|5118/)).toBeVisible();

    // Switch to sign up
    await page.getByRole("button", { name: "Sign up" }).click();

    const username = unique("pwtest");
    const email = `${username}@test.example`;

    await page.locator('input[id="username"]').fill(username);
    await page.locator('input[id="email"]').fill(email);
    await page.locator('input[id="password"]').fill("TestPass123!");
    await page.locator('input[id="confirm-password"]').fill("TestPass123!");

    // Intercept the register response to grab the token for cleanup
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/auth/register") && r.status() === 200,
    );

    await page.locator('button[type="submit"]').click();

    const res = await responsePromise.catch(() => null);
    if (res) {
      const body = await res.json().catch(() => null);
      cleanupToken = body?.accessToken ?? null;
    }

    await page.waitForURL(/\/onboarding/, { timeout: 15_000 });
    expect(page.url()).toContain("/onboarding");
  });

  test("logging in as existing user with completed onboarding redirects to /", async ({ page }) => {
    // Register and complete onboarding via API directly
    const username = unique("pwlogin");
    const email = `${username}@test.example`;

    const registerRes = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email,
        password: "TestPass123!",
        displayName: username,
      }),
    });
    expect(registerRes.ok).toBeTruthy();
    const { accessToken } = await registerRes.json();
    cleanupToken = accessToken;

    await fetch(`${API_BASE}/users/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ onboardingCompleted: true }),
    });

    // On web, onboarding state comes from localStorage — set it to reflect the server state
    await page.addInitScript(() => {
      localStorage.setItem("logit:server:mode", "selfhosted");
      localStorage.setItem("logit:api:baseUrl", "http://localhost:5118");
      localStorage.setItem("logit:onboarding:v1", JSON.stringify({ completed: true, step: 0 }));
    });

    await goToAuth(page);

    await page.locator('input[id="username"]').fill(username);
    await page.locator('input[id="password"]').fill("TestPass123!");
    // Use the form submit button specifically to avoid matching the "Log in" tab toggle
    await page.locator('form').getByRole("button", { name: "Log in" }).click();

    await page.waitForURL(/^http:\/\/localhost:5173\/$/, { timeout: 15_000 });
    expect(page.url()).toBe("http://localhost:5173/");
  });

  test("login with wrong password shows error", async ({ page }) => {
    const username = unique("pwerr");
    const email = `${username}@test.example`;

    const registerRes = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email,
        password: "TestPass123!",
        displayName: username,
      }),
    });
    expect(registerRes.ok).toBeTruthy();
    const { accessToken } = await registerRes.json();
    cleanupToken = accessToken;

    await page.addInitScript(() => {
      localStorage.setItem("logit:server:mode", "selfhosted");
      localStorage.setItem("logit:api:baseUrl", "http://localhost:5118");
    });

    await goToAuth(page);

    await page.locator('input[id="username"]').fill(username);
    await page.locator('input[id="password"]').fill("WrongPassword!");
    await page.locator('form').getByRole("button", { name: "Log in" }).click();

    await expect(page.locator(".text-destructive")).toBeVisible({ timeout: 8000 });
  });
});

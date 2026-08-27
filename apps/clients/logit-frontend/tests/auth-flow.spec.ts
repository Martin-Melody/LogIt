import { test, expect, type Page } from "@playwright/test";

const API_BASE = "http://localhost:5118";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Clear all auth/onboarding state so every test starts from a clean slate. */
async function resetState(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
  });
}

/** Seed the server mode so login/register targets a specific server. */
async function setServerMode(page: Page, mode: "cloud" | "selfhosted", url?: string) {
  await page.addInitScript(
    ({ mode, url }) => {
      localStorage.clear();
      localStorage.setItem("logit:server:mode", mode);
      if (mode === "selfhosted" && url) {
        localStorage.setItem("logit:api:baseUrl", url);
      }
    },
    { mode, url },
  );
}

async function goToAuth(page: Page, query = "") {
  await page.goto(`/auth${query}`);
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

// ── Default surface ──────────────────────────────────────────────────────────

test.describe("auth surface", () => {
  test("defaults to the managed cloud (logit.ie) with no server-setup wall", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByText("logit.ie")).toBeVisible();
    await expect(page.getByText("No server configured")).not.toBeVisible();
  });

  test("?mode=register opens the sign-up view", async ({ page }) => {
    await resetState(page);
    await goToAuth(page, "?mode=register");

    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.locator('input[id="email"]')).toBeVisible();
    await expect(page.locator('input[id="confirm-password"]')).toBeVisible();
  });

  test("can toggle between Log in and Sign up", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.locator('input[id="email"]')).not.toBeVisible();

    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.locator('input[id="email"]')).toBeVisible();

    await page.getByRole("button", { name: "Log in" }).first().click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("register shows an inline error when passwords don't match", async ({ page }) => {
    await resetState(page);
    await goToAuth(page, "?mode=register");

    await page.locator('input[id="password"]').fill("password123");
    await page.locator('input[id="confirm-password"]').fill("different");

    await expect(page.getByText("Passwords don't match")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });
});

// ── Forgot password ──────────────────────────────────────────────────────────

test.describe("forgot password", () => {
  test("'Forgot password?' opens the reset view and can return to log in", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await page.getByRole("button", { name: "Forgot password?" }).click();

    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await expect(page.locator('input[id="forgot-email"]')).toBeVisible();

    await page.getByRole("button", { name: "Back to log in" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
});

// ── Self-hosted server setup ─────────────────────────────────────────────────

test.describe("self-hosted server setup", () => {
  test("'Connect to a different server' reveals the URL panel", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await page.getByRole("button", { name: /Connect to a different server/i }).click();

    await expect(page.getByText("Connect to a self-hosted server")).toBeVisible();
    await expect(page.locator('input[type="url"]')).toBeVisible();
  });

  test("saving a URL switches the indicator to the self-hosted server", async ({ page }) => {
    await resetState(page);
    await goToAuth(page);

    await page.getByRole("button", { name: /Connect to a different server/i }).click();
    await page.locator('input[type="url"]').fill("https://logit.example.com");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("logit.example.com")).toBeVisible();

    const mode = await page.evaluate(() => localStorage.getItem("logit:server:mode"));
    expect(mode).toBe("selfhosted");
  });

  test("'Use logit.ie instead' reverts a self-hosted selection", async ({ page }) => {
    await setServerMode(page, "selfhosted", "https://logit.example.com");
    await goToAuth(page);

    await page.getByRole("button", { name: /Connect to a different server/i }).click();
    await page.getByRole("button", { name: /Use logit\.ie instead/i }).click();

    await expect(page.getByText("logit.ie")).toBeVisible();

    const mode = await page.evaluate(() => localStorage.getItem("logit:server:mode"));
    expect(mode).toBe("cloud");
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

  test("registering a new account redirects to /onboarding", async ({ page }) => {
    // Point at the local dev API via self-hosted mode — "cloud" would hit production.
    await setServerMode(page, "selfhosted", API_BASE);
    await goToAuth(page, "?mode=register");

    await expect(page.getByText(/localhost|5118/)).toBeVisible();

    const username = unique("pwtest");
    const email = `${username}@test.example`;

    await page.locator('input[id="username"]').fill(username);
    await page.locator('input[id="email"]').fill(email);
    await page.locator('input[id="password"]').fill("TestPass123!");
    await page.locator('input[id="confirm-password"]').fill("TestPass123!");

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

  test("logging in as an existing user with completed onboarding redirects to /", async ({ page }) => {
    const username = unique("pwlogin");
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

    await goToAuth(page);

    await page.locator('input[id="username"]').fill(username);
    await page.locator('input[id="password"]').fill("TestPass123!");
    await page.locator("form").getByRole("button", { name: "Log in" }).click();

    await page.waitForURL(/^http:\/\/localhost:5173\/$/, { timeout: 15_000 });
    expect(page.url()).toBe("http://localhost:5173/");
  });

  test("login with the wrong password shows an error", async ({ page }) => {
    const username = unique("pwerr");
    const email = `${username}@test.example`;

    const registerRes = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password: "TestPass123!", displayName: username }),
    });
    expect(registerRes.ok).toBeTruthy();
    const { accessToken } = await registerRes.json();
    cleanupToken = accessToken;

    await setServerMode(page, "selfhosted", API_BASE);
    await goToAuth(page);

    await page.locator('input[id="username"]').fill(username);
    await page.locator('input[id="password"]').fill("WrongPassword!");
    await page.locator("form").getByRole("button", { name: "Log in" }).click();

    await expect(page.locator(".text-destructive")).toBeVisible({ timeout: 8000 });
  });
});

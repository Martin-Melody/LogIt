import { defineConfig, devices } from "@playwright/test";

// Plays every web walkthrough chapter against a real API (E2E_API_URL, default the CI API at
// :5118). With DOCS_SCREENSHOTS_DIR set it also saves a screenshot per step for the docs.
const isCI = !!process.env.CI;
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5118";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 240_000,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 2,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4180",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: isCI ? "on-first-retry" : "off",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4180 --strictPort",
    port: 4180,
    reuseExistingServer: !isCI,
    timeout: 240_000,
    env: { VITE_API_URL: API },
  },
});

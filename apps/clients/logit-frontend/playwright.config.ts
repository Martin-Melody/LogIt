import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  // tests/unit/**/*.test.ts belongs to vitest — Playwright only runs the .spec.ts E2E files.
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    ...devices["Pixel 5"],
    screenshot: "only-on-failure",
    video: "off",
    trace: isCI ? "on-first-retry" : "off",
  },
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: !isCI,
    // Cold `vite dev` in CI does a full svelte-kit sync + first compile.
    timeout: 120_000,
  },
});

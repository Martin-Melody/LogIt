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
    // Serve a production build, not `vite dev`. The dev server compiles each
    // route on first navigation, which under parallel workers pushed heavy
    // routes (/session, /progress) past the test timeout intermittently.
    // `vite preview` serves precompiled assets — consistent and fast.
    command: "npm run build && npm run preview -- --port 5173 --strictPort",
    port: 5173,
    reuseExistingServer: !isCI,
    // `npm run build` is the long pole here (~35s cold, more in CI).
    timeout: 180_000,
  },
});

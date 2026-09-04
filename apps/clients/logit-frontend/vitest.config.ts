import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

// Unit/integration tests only (tests/unit/**) — separate from the Playwright E2E specs in
// tests/*.spec.ts, which run against the web build via `npx playwright test`. See
// tests/unit/README.md for why these exist as a separate tier.
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./tests/unit/support/setup.ts"],
  },
});

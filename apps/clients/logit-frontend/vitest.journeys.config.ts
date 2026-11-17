import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

// Account journeys (tests/journeys): the real app code on a simulated phone, against two local
// APIs started by scripts/journey-apis.sh. See tests/journeys/README.md.
const cloud = process.env.JOURNEY_CLOUD_URL ?? "http://127.0.0.1:5219";
// The app's built-in server ("getlogit.app") is the local cloud API in these tests.
process.env.VITE_API_URL = cloud;

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["tests/journeys/**/*.journey.test.ts"],
    environment: "node",
    setupFiles: ["./tests/journeys/support/setup.ts"],
    // One phone at a time: each journey swaps globals (window, localStorage, fetch).
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

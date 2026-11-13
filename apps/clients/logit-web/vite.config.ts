import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The shared theme's font files live in packages/ui, outside this app. Let the dev server
// serve files from the whole monorepo (production builds bundle them either way).
const monorepoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: { fs: { allow: [monorepoRoot] } },
});

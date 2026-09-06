import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// This app ships its own package-lock.json, so Vite's workspace-root detection stops here
// and its dev server won't serve the linked `@logit/core` sources under ../../packages/core
// ("outside of Vite serving allow list" -> 404, which silently falls back to a stale module).
// Allow the monorepo root explicitly so workspace package sources load in dev.
const monorepoRoot = fileURLToPath(new URL('../../..', import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    fs: { allow: [monorepoRoot] },
  },
});

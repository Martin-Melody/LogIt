import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Shown in Settings → Diagnostics and in exported logs, so a report says which build it came
// from. The commit when building from a git checkout, otherwise just the build date.
function buildId(): string {
  const date = new Date().toISOString().slice(0, 10);
  try {
    const commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `${commit} (${date})`;
  } catch {
    return date;
  }
}

// This app ships its own package-lock.json, so Vite's workspace-root detection stops here
// and its dev server won't serve the linked `@logit/core` sources under ../../packages/core
// ("outside of Vite serving allow list" -> 404, which silently falls back to a stale module).
// Allow the monorepo root explicitly so workspace package sources load in dev.
const monorepoRoot = fileURLToPath(new URL('../../..', import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __LOGIT_BUILD__: JSON.stringify(buildId()),
  },
  server: {
    fs: { allow: [monorepoRoot] },
  },
});

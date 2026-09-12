Mobility Plus — a sample mobility-progression plugin.

Adds a fixed amount of hold time (or reps) each session you log a drill, tracked
per side. It's intentionally simpler than the built-in "Linear mobility" scheme —
it exists to demonstrate the `mobility-progression` plugin contract:

  suggest(input) => { sets, nextState, label?, notes? }

where each set may carry `side`, `durationSec`, `reps`, `loadKg`.

Build: this bundle is hand-written ES2020, no build step. For a real plugin, use
the create-logit-plugin template + esbuild (see docs/publishing-plugins.md).

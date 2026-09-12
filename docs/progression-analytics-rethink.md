# Progression & Analytics — rethink (Phase C)

Status: **v1 shipped** (PR #63, 2026-09-06/07). Part of the session overhaul
(`~/.claude/plans/declarative-percolating-shore.md`).

**The "Roadmap (not in v1)" section below is superseded by
`docs/architecture/adaptive-progression-engine.md`** (2026-09-12) — talking through what "Phase
C proper" should actually be surfaced a bigger, more specific design than the bullet list below:
a reasoning-trace contract so algorithms show their work, context-aware suggestions that don't
mistake session-order fatigue for regression, personalized per-muscle volume/frequency learning,
and a guided-program on-ramp for users who'd rather just follow a plan. Read that doc for the
actual plan; this section is kept for history.

## Why

The pieces exist and are individually fine:

- `getExerciseAnalytics` / `basicAnalytics` — max weight, **e1RM (Epley)**,
  volume, per-exercise-type handling (normal / assisted / bodyweight), a
  last-session trend label. Rendered algorithm-agnostically by
  `ExerciseProgressionPanel`.
- `getSuggestion` — the in-session engine. Produces the *decision*: next
  target, "Deload next", notes. Only shown during a workout.
- `getExerciseStats` — best set, session count, last performed.
- `/progress` — a flat exercise list + one chart for the selected exercise.

What's missing is **synthesis into decisions**. A lifter opening `/progress`
wants to answer, per exercise:

1. **Am I progressing, stalled, or going backwards?** — today: a naive
   first-point-vs-last-point arrow in `progress/+page.svelte`.
2. **When did I last PR?** — computable but not surfaced.
3. **What do I do next session?** — `getSuggestion` knows, but that answer
   never leaves the workout screen.
4. **Which exercises need attention?** — the list is sorted by recency, with
   no signal of which lifts are stuck.

## v1 — what ships now

### `getExerciseProgressStory` (core usecase)

Composes `getExerciseAnalytics` + `getSuggestion` + a real trend classifier
into one per-exercise object:

```ts
type ProgressStatus = "new" | "progressing" | "plateaued" | "regressing" | "detraining";

type ExerciseProgressStory = {
  exerciseName; exerciseId?;
  status: ProgressStatus;
  statusDetail: string;              // "≈ +1.8% / session" | "No PR in 4 sessions" | "Last trained 24 days ago"
  headline: { label: string; value: string };   // "Est. 1RM" / "142 kg"
  lastPr?: { value: string; whenMs: number };
  nextTarget?: string;              // getSuggestion().label — the actual decision
  nextNote?: string;                // getSuggestion().notes
  lastTrainedMs: number;
  spark: number[];                  // primary series, oldest→newest, for a sparkline
};
```

**Trend classifier** (`classifyTrend` in `domain/progression.ts`, unit-tested):
- `< 3` sessions → `new`.
- last trained `> 21 days` ago → `detraining`.
- else least-squares slope over the last ≤ 8 points of the primary series
  (prefer `estimated_1rm`, else `max_weight`, else first series), normalised
  by the series mean → % change per session:
  - a PR in the last 2 sessions, or slope `> +0.4%/session` → `progressing`
  - slope `< −1%/session` → `regressing`
  - otherwise → `plateaued` (detail names the PR drought)

### Reskin

- **`ExerciseProgressionPanel`** leads with a **status chip + next-step line**
  (`nextTarget` / `nextNote`) and **last PR**, then the existing
  metrics/series/chart/insights underneath (unchanged, still
  algorithm-agnostic).
- **`/progress` index** becomes scannable: one row per exercise with a
  meaningful status chip (colour-coded), the headline value, a sparkline, and
  "plateaued / regressing" lifts floated to the top so stuck work is visible.
  Tapping a row still opens the full panel.
- Both read the same `getExerciseProgressStory`, so the in-session "Target:"
  line and the `/progress` "next" line can never disagree.

## Roadmap (not in v1)

- **Weekly targets / "what should I lift this week"** — widen the
  `ProgressionAlgorithm` contract to optionally return a week view, not just
  the next session. Feeds a lightweight planner surface.
- **Plateau → deload prompt** as an explicit, dismissible nudge (the
  classifier already detects it; the algorithm should own the recommendation).
- **Recovery / fatigue check-in → autoregulation** — a progression-algorithm
  plugin (see roadmap in the main plan).
- **e1RM everywhere** — it's already computed; surface it in the recap and the
  exercise header, and expose the Epley helper from `@logit/core` so plugins
  share one formula.
- **Muscle-group / whole-programme view** — volume landmarks per muscle, not
  just per exercise.

## Extension points

- `classifyTrend` and `ExerciseProgressStory` are core contracts — a community
  analytics or coaching plugin can produce or consume the same story shape.
- The story deliberately carries the algorithm's own `label` / `notes`
  verbatim — a plugin progression algorithm's wording flows straight to
  `/progress` with no app-side rewording.

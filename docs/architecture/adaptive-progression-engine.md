# Adaptive progression & analytics engine — design doc

**Status:** Draft, not yet implemented. Written 2026-09-12, superseding the "Roadmap (not in
v1)" section of `docs/progression-analytics-rethink.md` (that doc's v1 — `getExerciseProgressStory`,
`classifyTrend`, the `/progress` reskin — already shipped in PR #63 and stands as-is; this doc
is what comes after it). Part of the session overhaul's parked Phase C
([[project_session_overhaul]]).

**Why this doc exists:** Phase C was left as "reskin the progression UI" in the original
roadmap. Talking it through surfaced that the real gap is bigger and more interesting than a
reskin — the existing engine is too superficial to trust for the decisions we want it to make,
and it has no way to show its work. Fixing that well touches the algorithm contract, not just
the UI, so it earns a design doc before code, same bar as the account-model rework.

## 1. The problems, named

1. **Superficiality.** `classifyTrend` (least-squares slope over ≤8 points, hardcoded
   thresholds) has never been checked against real trajectories. It's a plausible heuristic,
   not a validated one — and every new feature we hang off it (deload prompts, weekly targets)
   makes a wrong call more consequential, not less.
2. **No visibility into reasoning.** The engine produces verdicts (`"plateaued"`, `"Deload
   next"`, a suggested weight) but discards the *why*. Neither the developer nor the user can
   check whether a call is grounded in real data or just noise.
3. **Confounded signals.** A trend classifier that only looks at "did the number go up or down"
   can't tell a real regression from an artifact of context — e.g. bench press lands 4th in the
   session instead of 1st, and the lower number gets read as regressing when it's actually just
   expected fatigue carryover.
4. **Generic, not personalized, prescriptions.** Volume/frequency guidance (how many sets of
   what, how often) defaults to someone's general theory (RP-style MEV/MAV/MRV or otherwise)
   rather than learning what actually keeps *this* user progressing, which can differ a lot by
   muscle group even for the same person (e.g. chest tolerates 2×/week, biceps tolerates 3×/week).
5. **One-size-fits-all UX.** A power user wants transparency and control. Plenty of people just
   want to be handed a plan and go — closer to Ladder's "series" model (a coach or the app hands
   you day-by-day, week-by-week sessions, minimal decision-making exposed). Forcing engine #1-4
   on that second group at onboarding risks scaring them off entirely.

None of these are reasons to cut scope — they're the actual design constraints. The fix has to
be an opinionated default (per [[feedback_design_for_plugins]] — "have a real opinion, not
mush") that's transparent about its own confidence, personalizes from the user's own history,
and is entirely optional to engage with.

## 2. Three sources of "what should I do today", one resolution point

Every session already has to answer one question per exercise: *what's the target for this set
today?* Instead of that being "always the algorithm," it becomes a small precedence chain,
unifying the guided path and the algorithmic path instead of treating them as separate products:

1. **An active guided program day** — a coach-assigned `CoachProgram`, or a self-picked
   template from the program library (§6) — if one exists for today, its prescribed
   sets/reps/weight wins. This is the Ladder-style path: zero engine exposure, just "here's
   today."
2. **The user's chosen progression algorithm** — built-in default or an installed plugin
   (existing `ProgressionAlgorithm` contract), if no guided program applies.
3. Nothing configured → today's existing bare fallback behavior (last session's numbers).

This costs almost nothing architecturally — `startSessionFromProgramDay` already knows how to
prefill from a program day; `CoachProgram` already supports template mode
(`RecipientUserId` nullable). The new work is making template programs reachable by a solo user
who isn't in a coaching relationship, not a new resolution mechanism.

**Why this matters for the "scared off" worry:** a new user's first-run choice isn't "configure
an algorithm" — it's "pick a plan, or don't." The deep engine in §3-5 is something people
opt into or grow into, never a wall on day one.

## 3. Reasoning-trace contract (the foundation everything else sits on)

Every algorithm decision — built-in or plugin — must emit its reasoning as structured data
alongside its verdict, not just a rendered sentence. Today `ExerciseProgressStory.statusDetail`
is a string like `"≈ +1.8% / session"`; that becomes:

```ts
type Reasoning = {
  inputs: Record<string, number | string>;   // e.g. { seriesUsed: "estimated_1rm", pointsConsidered: 6, sessionsSinceLastPr: 4 }
  computed: Record<string, number>;          // e.g. { slopePerSession: 0.018, threshold: 0.004 }
  confidence: "low" | "medium" | "high";      // see §5.3 — data-sufficiency, not vibes
  verdict: string;                            // the label this reasoning produced
};
```

Paired with a generic **"Why?"** UI affordance on any status chip / suggested target — renders
this structure plainly (inputs looked at → number computed → threshold → label), the same
component regardless of which algorithm produced it. This is a hard requirement for any
algorithm entering the future progression-algorithm marketplace, not just the built-in one — an
algorithm that can't explain itself is a trust red flag in a fitness app.

This also directly fixes problem #1: once reasoning is inspectable, the built-in classifier's
behavior can actually be eyeballed against real sessions and backtested ("did last month's
'plateaued' calls hold up two weeks later?"), instead of trusted blindly.

**Sequencing note:** build this first. §4 and §5 are two more consumers of this contract, not
independent features — designing them before the contract exists risks two different
one-off "why" mechanisms.

## 4. Context-adjusted expectation (the order-effect problem)

**Status: shipped** (branch `feat/progression-reasoning-trace`, PR #66). Turned out to be a
smaller lift than expected: `linearProgression.ts` already tempered *suggested weight* by session
position (`computeFatigueScore`/`calibrateSensitivity`) before this doc was written — it just
never reported confidence or showed its work, which §3 fixed. What was actually missing was the
*trend classifier* side: `classifyTrend` now takes an optional `sessionPositions` array
(index-aligned with `values`) and, once both a "done first" and a "done later" group have enough
samples (mirroring the same `MIN_CALIBRATION_SAMPLES` threshold), credits later-in-session
readings back toward their fresh-equivalent before fitting the slope — so a lift that's reliably
logged last doesn't read as regressing purely because that's when it's always trained.
`sessionPosition` now flows end-to-end: `findExerciseIndexInSession` (new shared helper in
`domain/workout.ts`, deduping what `getSuggestion`/`getExerciseHistory` each computed separately)
→ `ExerciseHistoryEntry.sessionPosition` → `AnalyticsDataPoint.sessionPosition` (new field,
threaded through `basicAnalytics.ts`) → `classifyTrend`. Both the raw and fatigue-adjusted slope
are kept in `Reasoning.computed` (`rawSlopePctPerSession` vs `slopePctPerSession`) so the "Why?"
view can show the correction happened, not just its result.

Every session block already carries `orderIndex`; nothing new needs capturing. The model: learn,
per user per exercise, an expected performance discount as a function of session position —
e.g. "bench 4th-or-later in your session historically runs ~6% below bench 1st." Two
consequences, both routed through the reasoning-trace:

- **Suggested weight is tempered proactively** — before the set is logged, using the learned
  discount for today's actual position, with the adjustment stated in `Reasoning.computed` and
  `Reasoning.verdict` (so "why is it suggesting less today" has a real, inspectable answer, not
  a silent fudge).
- **The trend classifier subtracts the expected context effect before labeling** — a shortfall
  fully explained by "you did it last today, same as your historical pattern for exercises done
  last" is not regression signal. Only shortfall *beyond* the learned expectation counts.

Same principle generalizes past session order later (e.g. total prior volume that session, not
just position) — start with `orderIndex` since it's the simplest confound with data already on
hand, not because it's the only one worth modeling.

## 5. Personalized volume/frequency landmarks per muscle group

Exercises already carry `primaryMuscles`/`secondaryMuscles`; nothing new needs tagging. The
model: track, per user per muscle group, how historical sets×frequency correlates with the
trend outcome from `classifyTrend` (§4-adjusted), and converge on a personal sweet spot —
"4 sets × 2/week keeps chest progressing for you; 3× is under-stimulating; 6× tips into
stalling" — independently per muscle group, since the answer can genuinely differ per muscle for
the same person.

### 5.1 Explicitly not a fixed formula

This deliberately does **not** ship RP's MEV/MAV/MRV numbers (or anyone else's) as the built-in
opinion. The built-in opinion is *the learning process itself* — start from a conservative
generic prior, adjust from the user's own outcomes, converge over time. Someone who prefers a
named external framework's fixed numbers instead is exactly the "mix and match" case the plugin
contract should serve — a plugin can implement the same interface backed by static RP-style
tables instead of a learned model.

### 5.2 Where this shows up

Feeds the "what needs attention this week across my whole programme" view (the muscle-group /
whole-programme surface from the original roadmap) — this absorbs that item rather than sitting
alongside it as separate work.

### 5.3 Confidence and cold start, non-negotiable

Both this and §4 are learning systems built from one person's noisy data — a few weeks of
history can easily look like a pattern and not be one. Every output through the reasoning-trace
must carry an honest confidence level (`Reasoning.confidence`), and the UI must have a genuine
"not enough data yet" state rather than presenting an early guess with the same authority as a
converged one. This is a harder bar than the existing classifier meets today, and worth holding
to precisely because these two features are more consequential than a status chip — they adjust
what weight gets suggested and what training frequency gets recommended.

## 6. Program library (the guided on-ramp)

A small set of built-in "series" — day-by-day, week-by-week starter programs a solo user can
pick and follow with zero exposure to §3-5, reusing `CoachProgram`'s existing template mode
(currently only reachable via a coach relationship). Scope for v1: **built-in starter programs
only**, authored by us/trusted authors — not community-publishable yet. Opening it up to
community-published programs later follows the same distribution pattern already proven by the
plugin registry and mobility-pack, deferred deliberately rather than designed now.

## 7. Autoregulation — still plugin-first, still separate

Recovery/fatigue-driven target adjustment (RPE-based, readiness-based, or otherwise) stays a
progression-algorithm plugin, not a built-in opinion — of everything in this doc it's the most
contested/personal, and the best candidate to be the flagship "build your own to suit yourself"
example rather than something we bake in and ask people to override. Needs the algorithm
contract to accept an optional live input (today's readiness/RPE) alongside history, which §3's
reasoning-trace widening should account for even though the built-in engine won't use it.

## 8. e1RM everywhere

**Status: shipped.** New `domain/oneRepMax.ts` exports `estimated1RM` (the same Epley formula
`basicAnalytics.ts` used to compute privately); `getExerciseStats` gained `bestEstimated1RM`,
shown in the exercise detail header alongside best set/sessions/last performed; the workout
recap shows it next to each PR and the "best lift" card whenever reps > 1 (at 1 rep it equals
the raw weight already on screen, so a second figure would be redundant). Community plugins can
now import the same helper instead of reimplementing the formula.

## 9. Sequencing

1. ~~Reasoning-trace contract + generic "Why?" UI (§3)~~ — **shipped**, PR #66.
2. ~~Context-adjusted per-exercise suggestions (§4)~~ — **shipped**, PR #66.
3. Personalized volume/frequency landmarks (§5) — next up. Second consumer, larger
   (per-muscle-group, whole-programme view).
4. Program library (§6) — independent of 1-3, can build in parallel; it's the on-ramp, not the
   engine.
5. Autoregulation input widening (§7) — contract accommodation only; the actual plugin is
   someone's (possibly Martin's own) later work, not core-team-built.
6. ~~e1RM everywhere (§8)~~ — **shipped**, PR #66.

## 10. Extension points recap

- §3's `Reasoning` shape, §4's per-exercise contract, and §5's per-muscle-group contract are all
  core contracts, same status as the existing `ProgressionAlgorithm` interface — a plugin can
  implement any of them.
- A followed program day (§2) and an algorithm's suggestion are the same *kind* of thing from
  the resolution chain's point of view — "what do I lift today" — so a plugin author could in
  principle ship something that blends both (e.g. a program that adapts within its own bounds).
- Confidence/cold-start handling (§5.3) is itself part of the contract, not a UI nicety bolted on
  after — a plugin that can't state its confidence doesn't meet the bar.

See also: `docs/progression-analytics-rethink.md` (v1, shipped), [[project_session_overhaul]],
[[project_plugin_architecture]], [[feedback_design_for_plugins]], [[project_pt_studio_roadmap]]
(source of `CoachProgram`/template mode reused in §2/§6).

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

**Status: v1 (option A) shipped** (branch `feat/progression-reasoning-trace`, PR #66) — a "Muscle
groups" tab on `/progress` showing, per muscle group: current week's sets, average weekly
sets/frequency, a worst-of status aggregated from the group's primary-tagged exercises, and —
only once there's real statistical support — a volume correlation ("sessions tend to improve
more in weeks with ≥N sets"), derived from a median-split of the user's *own* weekly volume
history against session-over-session improvement. Gated on ≥8 weeks of data and ≥4 sessions per
side of the split; below that it honestly says "not enough data yet" rather than guessing. No new
plugin architecture — reuses `classifyTrend` + the reasoning contract, per the option-A scoping
decision below.

**Option B (a full pluggable family — a proper contract + registry + settings picker, mirroring
`mobility-progression`, so e.g. an RP-style fixed-table algorithm can be swapped in) is still
explicitly required before this ships to real users/launch** — A proved the learning logic works
on real data, but B is not an optional nice-to-have, it's a tracked launch blocker. Don't let A
quietly become the permanent implementation.

**§5.4's tag-coverage concern is addressed for v1**, but simply, not with the full weighting
scheme originally sketched: untagged exercises' sets are tracked and reported as one overall
`untaggedSetsShare`, surfaced as a caveat in the UI above ~10%, rather than folded per-group into
each group's own confidence score. Revisit if that proves too coarse in practice.

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

### 5.4 Depends on muscle-tag data quality (Martin's concern, 2026-09-12)

This whole feature is only as good as `primaryMuscles`/`secondaryMuscles` tagging — an untagged
or wrongly-tagged exercise doesn't corrupt a muscle group's numbers, it just silently excludes
that volume, which is arguably worse (looks confidently complete when it isn't). Built-in
exercises are app-authored and presumably fine; user-created custom exercises are the real risk —
plausibly untagged or sloppily tagged. Two concrete things to build alongside 5, not deferred:
- Fold tag *coverage* into the reasoning's confidence, not just sample size over time — e.g. a
  meaningful fraction of a muscle group's real weekly sets coming from untagged exercises should
  cap confidence, and the "Why?" view should say so explicitly ("12 sets from untagged exercises
  this week weren't counted").
- A lightweight nudge (settings or the exercise list) flagging custom exercises with empty
  `primaryMuscles` as needing attention, surfaced before this feature is trusted.

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

## 9. Nutrition × training correlation (raised, not started — 2026-09-12)

Martin's idea: since nutrition logging and workout logging already live in the same app, real
signal could plausibly be found correlating what someone ate around a session against how that
session went — the concrete example given was "your lifts were better when you ate carbs 30-60
minutes before training." Architecturally this is not a new paradigm — it's the same "learn from
the user's own history, show your work, be honest about confidence" machinery from §3-5 applied
to a second data source (the nutrition diary) correlated against the same outcome signal
(session performance / `classifyTrend`-style trend).

**Concrete blocker found checking feasibility:** `LoggedItem` (the nutrition diary's per-food
entry, `domain/nutrition.ts`) has no per-item timestamp — only a coarse `meal` slot
(breakfast/lunch/dinner/snack) and the day-level `dateIso`. That's nowhere near precise enough to
correlate against a workout's actual start time; "30-60 minutes before" needs real clock time.
Good news: `DiaryDay` is stored as a JSON blob (same pattern as `session_blocks`), so adding an
optional `loggedAtMs` to `LoggedItem` is additive — no migration, but existing historical entries
logged before this ships simply won't have it and can't be used for timing correlations.

Two tiers this splits into:
- **Day-level correlation** (buildable without any data model change): e.g. "sessions on days
  you hit your protein target trend better than days you don't." Coarser, but usable today.
- **Meal-timing correlation** (the actual "30-60 min before" example) — needs `LoggedItem.loggedAtMs`
  added first, then correlates logged time against `session.startedAtMs`.

**Extra caution warranted, more than §4/§5:** a single person's diet-vs-performance correlation is
noisier than the fatigue/position work — logging compliance varies session to session, and sleep/
stress/training-load confounds exist that nutrition data alone can't separate out. This is a good
candidate to be honest about in the UI as a *hypothesis being tested*, not a delivered fact — "you
tend to lift better when X" with a visible confidence and sample size, never "you lift better when
X" stated flatly. Not scoped/sequenced yet — logged here so it isn't lost, to be designed properly
(likely after §5 ships) rather than folded in now.

**Sleep — deliberately out of scope.** Martin's own read, agreed: self-reported sleep is
low-value signal on its own; doing this right needs wearable/platform integration (Apple
HealthKit, Google/Android Health Connect, etc.), which is a substantial *separate* integration
project, not an extension of this progression-engine work. Not tracked further in this doc.

## 10. Deliberate signal-generation UX

Two separate conversations converged on the same underlying gap: **some learning signal doesn't
occur naturally and has to be deliberately asked for.** They turned out to need genuinely
different treatments, not one shared UI:

- **Order-variation nudge — status: shipped** (branch `feat/progression-reasoning-trace`). Low
  stakes: it's a request about something already happening, not a change to any prescribed
  number. `ProgressionOutput` gained a `nudge?: ProgressionNudge` field (`{ id, message }`) —
  distinct from the old free-text `notes`, because it needs an *identity* to be dismissible.
  `linearProgression` emits it keyed off `!calibration.calibrated` directly (the same flag the
  reasoning already reports) rather than the old separate `shouldSuggestVariety` heuristic
  (">85% same slot in last 10 sessions"), which could disagree with what `calibrateSensitivity`
  actually needed — same bug shape as the `/progress`-list drift found earlier, avoided by
  construction this time. Dismissal is generic, not algorithm-specific: `getSuggestion.ts` filters
  a `nudge` against `ExerciseProgressionState.dismissedNudges` (new field, additive — rides the
  existing JSON blob storage, no migration) before returning, so a plugin algorithm gets dismissal
  handling for free rather than implementing its own. New `dismissProgressionNudge` usecase writes
  the dismissal immediately (not gated on finishing a workout, unlike the algorithm's own `state`).
  Surfaced in both places Martin asked for: the in-session suggestion (`ExerciseCard.svelte`) and
  the `/progress` exercise detail panel (`ExerciseProgressionPanel.svelte`), each with a "Got it"
  dismiss control. Auto-stops asking the moment `calibrated` flips true — nothing to track for
  that path, it falls out of the same data the reasoning already reports.
- **Personalized rep-range prescription per exercise — designed 2026-09-12, not built.**
  Genuinely higher stakes than the order-variation nudge: the in-session "Target: 3×5-8" is a
  fixed global preference today (`LinearPreferences`, stored in the single `algorithm_preferences`
  row keyed by algorithm id only — verified against the actual query path, not assumed), and
  there's no organic variation to learn from at all, unlike session position. Generating signal
  means proactively changing what's prescribed, on purpose, for a while — a real change to the
  number the user follows.

  **Variable chosen: rep range, not set count.** Set count is deliberately left out — §5 already
  owns "how many sets per week for this muscle" at the aggregate level; learning set-count
  *per exercise* on top of that would fight with or duplicate what §5's option B will eventually
  answer. Rep range isn't covered anywhere else in this doc, is a smaller behavioural ask (reps
  you're already doing, not an added/removed set), and is the axis training approaches genuinely
  disagree on (compounds vs. isolation, etc.). Set-count experimentation can come later, informed
  by §5 rather than run as a separate parallel trial.

  **Granularity: per-exercise ground truth, muscle-group-informed cold start — not a permanent
  compromise between the two.** Once an exercise has enough of its own trial history, its own
  result wins outright — this is what actually captures a real difference between, say, biceps
  and quads, or between a stretch-emphasis exercise (Incline Curl) and an easier-to-cheat one
  (Standing Curl) sharing the same muscle. Until an exercise has its own data, the *value it's
  first trialed at* is informed by what's already worked across other exercises sharing its
  primary muscle — a warm start, not a ceiling. Deliberately **not** attempting to hand-classify
  exercises by mechanical property (stretch-emphasis, cheat-resistance, stability demand, etc.) —
  that nuance is expected to emerge on its own from each exercise's own accumulated data once
  there's enough of it, the same way every other learned piece in this doc works from the user's
  own history rather than an encoded theory.

  **Consent, opt-in twice:** a settings toggle turns the *feature* on (off by default — "Let LogIt
  experiment with your rep ranges to personalize them"); a specific exercise still gets asked
  individually before a trial starts on it, reusing the exact `ProgressionNudge`/dismissal UI
  built for the order-variation nudge (§10 above) rather than new UI. No exercise is ever
  experimented on without an explicit per-exercise yes.

  **Pacing:** one trial actively running at a time, globally — not because the *result* should be
  global (it isn't, see granularity above), but to keep what's changing legible; running several
  concurrent rep-range changes across different exercises would be confusing to track and explain.

  **Mechanics — block design:** N sessions at the trial rep range, compared against the N
  sessions immediately before it at the baseline range — same before/after "did this improve"
  comparison shape as §5's volume correlation (reuse the pattern, not necessarily the code).

  **Transparency, in and out:** starting a trial states what's changing and why through the same
  reasoning-trace UI (§3), not new UI; finishing one reports the real result — "progressed faster
  at 8-12 (+X%) than your usual 5-8 (+Y%) — switch permanently?" or "no real difference — keeping
  your usual range" — never silently keeps or discards the change.

  **Scope for v1: bespoke to `linearProgression`, not a generic mechanism yet** — same phased
  approach as §5 (insight first, generalize once proven). **Tracked, not a hard blocker on
  shipping v1 itself, but should happen before the progression-algorithm marketplace becomes
  real** — a third-party algorithm can't compete on this axis if experimentation only exists
  baked into the built-in one, same reasoning as §5's option B.

## 11. Sequencing

1. ~~Reasoning-trace contract + generic "Why?" UI (§3)~~ — **shipped**, PR #66.
2. ~~Context-adjusted per-exercise suggestions (§4)~~ — **shipped**, PR #66.
3. ~~Personalized volume/frequency landmarks (§5), v1~~ — **shipped**, PR #66. The full
   pluggable family (§5's "option B") remains a tracked launch blocker, not done yet.
4. Program library (§6) — independent of 1-3, can build in parallel; it's the on-ramp, not the
   engine.
5. Autoregulation input widening (§7) — contract accommodation only; the actual plugin is
   someone's (possibly Martin's own) later work, not core-team-built.
6. ~~e1RM everywhere (§8)~~ — **shipped**, PR #66.
7. Nutrition × training correlation (§9) — raised, not scoped/sequenced yet; likely after §5.
8. ~~Deliberate signal-generation UX — order-variation nudge (§10)~~ — **shipped**. The rep-range
   experimentation half of §10 is **designed, not built** — next up to actually implement.

## 12. Extension points recap

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

## 13. Marketing/docs debt (track, don't update piecemeal)

Martin's call (2026-09-12): note every shipped item here as it lands, but **don't chase
marketing copy or docs-site per slice** — batch the update once the engine's shape has settled
enough that it isn't described three different ways in three commits. Update this list as things
ship; do the actual external-facing pass later, deliberately, not reactively.

**Not yet reflected anywhere external, as of PR #66 (§1-3, 6, 10-order-nudge shipped):**
- `apps/clients/docs-site/src/routes/docs/plugins/reference/+page.svx` — still describes
  `ProgressionInput`/`ProgressionOutput` generically (line ~61); doesn't mention `reasoning`,
  `Reasoning`/`ReasoningConfidence` (domain/reasoning.ts), the widened `sessionPositions`
  parameter on `classifyTrend`, or the new `nudge`/`ProgressionNudge`/dismissal contract (§10). A
  plugin author reading this today wouldn't know any of this exists, let alone that reasoning is
  expected of a marketplace-quality algorithm.
- No docs-site page for the muscle-group insight (`getMuscleGroupInsights`) — comparable pages
  exist for mobility (`docs/plugins/mobility-progression`, `mobility-packs`); this doesn't have
  one yet, and shouldn't until §5's option B (the pluggable version) exists — document the real
  contract, not the v1 insight-only shape that's meant to be superseded.
- Marketing site (`apps/clients/logit-marketing`) makes no claims about progression
  intelligence specifically yet, so nothing there is actively *wrong* — but "shows its reasoning,
  not just a verdict" and "e1RM everywhere" are both genuine differentiators worth copy once the
  bigger pieces (§5 option B, §10) land and the story is more complete.

**Update this list, in this section, every time something in §11's sequencing ships** — that's
the trigger for eventually queuing the actual marketing/docs-site pass, not a reason to do it now.

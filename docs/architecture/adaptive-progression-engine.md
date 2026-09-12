# Adaptive progression & analytics engine — design doc

**Status:** All of §1-10 shipped as of 2026-09-12 (round 2) — see §11's sequencing for what
landed when and in PR #66 vs. round 2. Written 2026-09-12, superseding the "Roadmap (not in
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

**Status: shipped, options A and B both** (round 2, 2026-09-12 — see the "Decision" note under
option B below for what B actually shipped as). Option A first (branch
`feat/progression-reasoning-trace`, PR #66) — a "Muscle
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

**Decision (2026-09-12): scoped, mirror `mobility-progression` exactly.** New plugin family
(`muscle-group-insight` or similar registry name — final id decided at implementation time to
match existing naming conventions). One **global** setting, same shape as the existing
progression-algorithm picker (`getProgressionConfig`/`setProgressionAlgorithm` in
`packages/core/src/usecases/progression/getProgressionConfig.ts`, backed by
`AlgorithmRegistry.list()`/`.get(id)`) — not a per-muscle-group choice. The v1 insight logic
already shipped (median-split volume correlation, confidence/cold-start handling) becomes the
**built-in implementation of the new contract**, not a separate thing that gets superseded —
same migration shape as `linearProgression` being the built-in `ProgressionAlgorithm`. A plugin
implementing the new interface can swap in a static RP-style table instead, per §5.1.

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

**Status: shipped** (round 2, 2026-09-12 — see the "Decision" note below).

A small set of built-in "series" — day-by-day, week-by-week starter programs a solo user can
pick and follow with zero exposure to §3-5, reusing `CoachProgram`'s existing template mode
(currently only reachable via a coach relationship). Scope for v1: **built-in starter programs
only**, authored by us/trusted authors — not community-publishable yet. Opening it up to
community-published programs later follows the same distribution pattern already proven by the
plugin registry and mobility-pack, deferred deliberately rather than designed now.

**Decision (2026-09-12): four starter programs, both entry points.**
- **Content (v1 built-in set):** full-body 3x/week beginner (linear progression), upper/lower
  4x/week, push/pull/legs 6x/week, and a 5x5-style strength program (StrongLifts pattern — 3x/week,
  5x5 on main lifts, simple weekly load increase). Authored as `CoachProgram` template records
  (`recipientUsername`/`RecipientUserId: null`, same shape coaches already produce) — seed data,
  not a new content model.
- **Entry points:** both onboarding *and* a permanent browse surface, matching §2's "pick a plan,
  or don't" framing — offered as a first-run choice, and reachable afterward from a dedicated
  browse/programs page so someone can start, switch, or drop a program later without redoing
  onboarding. Starting one uses the existing `startSessionFromProgramDay` prefill path; a solo user
  "starting" a template is new plumbing (a self-service equivalent of a coach assignment), not a
  new resolution mechanism — §2 already covers the precedence chain once a program is active.
- Switching back to algorithm-mode (or a different program) later must stay possible — a program
  choice is never a one-way door.

## 7. Autoregulation — still plugin-first, still separate

**Status: shipped** (round 2, 2026-09-12) — contract accommodation only, as scoped below.

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

## 9. Nutrition × training correlation

**Status: shipped, full build** (round 2, 2026-09-12 — see the "Decision" note below).

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

**Decision (2026-09-12): full build, both tiers, this round.** Add optional `loggedAtMs` to
`LoggedItem` (additive, no migration — existing entries simply lack it and are excluded from
timing correlations). Build both: day-level correlation (protein-target-day vs. not, reusing the
median-split + confidence pattern from §5) and meal-timing correlation (logged time vs.
`session.startedAtMs`, gated on having enough `loggedAtMs`-bearing entries — cold-start honesty
applies here even more than §5/§4, per the caution above). Surfaced as an explicit *hypothesis
being tested* (visible confidence + sample size), never a flat claim — same reasoning-trace/"Why?"
machinery as everywhere else in this doc, not new UI.

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
- **Personalized rep-range prescription per exercise — shipped** (same branch/PR as the
  order-variation nudge). Genuinely higher stakes than that nudge: the in-session "Target: 3×5-8" is a
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

  **Implementation notes (2026-09-12):**
  - `ProgressionNudge` gained `actionLabel`/`actionData`/`exclusive` — a nudge can now propose a
    real action (not just dismiss), carry the data needed to act on it, and mark itself as
    needing exclusivity across exercises. `ExerciseProgressionState` gained `activeExperiment`
    (generic — any algorithm's experiment can set it, `getSuggestion.ts` enforces "only one
    exercise at a time" off it without knowing what the experiment is) and reuses
    `dismissedNudges` for the "not now"/"keep usual" paths.
  - `linearProgression`'s trial-conclusion math reuses `classifyTrend` directly (via a small
    `blockTrend` helper) rather than a bespoke calculator — a trial's "did this help" reads on
    the exact same slope scale as every status chip elsewhere. Reuses `estimated1RM` for the
    per-session value, same as §5/§8.
  - The muscle-group warm-start and the cross-exercise exclusivity check both live in
    `getSuggestion.ts`, not the algorithm — `ProgressionInput` gained a bespoke
    `suggestedTrialRepRange` field for this, clearly commented as a known v1 compromise
    (`suggest()` only ever sees one exercise at a time; only the generic layer can look across
    exercises to compute either of these).
  - New `acceptRepRangeExperiment` usecase (bespoke, alongside the generic `dismissProgressionNudge`)
    handles both "start the trial" and "switch permanently" — re-fetches the live suggestion
    rather than trusting whatever the UI last rendered, so accepting a stale nudge is a no-op
    instead of acting on outdated data.
  - Real bug caught building this: `applySessionProgression` was replacing the whole
    `ExerciseProgressionState` row on every completed session, silently dropping
    `dismissedNudges` (and would have dropped `activeExperiment` too) since neither is part of
    what `suggest()` returns. Fixed to carry `dismissedNudges` forward explicitly and re-derive
    `activeExperiment` from `nextState` on every save.
  - v1 doesn't correct for the fatigue-calibration confound this creates when both features are
    active on the same exercise at once (a rep-range trial changes the rep ceiling
    `calibrateSensitivity` scores history against) — noted as an accepted limitation in code,
    expected to be rare in practice.

  **Second real bug found while device-testing this (2026-09-12):** the "trial finished — switch
  permanently?" nudge only fired in the exact `suggest()` call where a trial transitioned from
  `active` to `concluded` — any later view (state already saved as `concluded`) hit no matching
  branch and silently fell through to the order-variety nudge instead, so the result was only ever
  visible for one instant. Found by seeding a pre-concluded trial and observing the wrong nudge
  render live on-device. Fixed by extracting the nudge-building logic into a `resultNudge()`
  helper and adding a `concluded` branch that re-derives the same message from the stored
  `result` on every view, with an `alreadySwitched` check (current `repRange` already matches
  `trialRepRange`) so it stops re-asking once the switch has actually been taken.

  **Real, pre-existing bug found and fixed while device-testing this (2026-09-12):**
  `getSuggestion.ts` fetched "the most recent `HISTORY_WINDOW` (20) sessions **across every
  exercise**, then filtered to this one" — not new code, but every threshold this doc's features
  introduced (6 sessions for the order-variety nudge, 8 for a rep-range offer) assumes it's
  looking at a meaningful chunk of *that exercise's own* history. Anyone training more than a
  handful of different exercises regularly would have that single exercise's history diluted
  down by everyone else's more-recent sessions, silently starving these features (and the
  existing fatigue calibration) well before 20 of *its own* sessions had actually accumulated.
  Verified live against the device via its own DevTools connection (not guessed) before fixing.
  Fixed by reusing `getExerciseHistory` (already fetches uncapped, per-exercise, oldest-first —
  the same logic `getSuggestion.ts` was duplicating and getting wrong) and capping *that* result
  to the window size, instead of capping the shared session list first. Covered by a regression
  test building 25 other exercises' more-recent sessions against 10 of the target exercise's own,
  asserting all 10 remain visible.

### 10.1 Confound: a rep-range switch reads as false regression/progression — status: fixed (2026-09-12)

Raised by Martin: if the trial switches an exercise's rep range for good, the achievable load (and
so its e1RM, since Epley's multiplier itself depends on reps) genuinely level-shifts at the switch
point — that's not the same thing as the exercise actually getting harder or easier, but the
overall trend classifier (§4's `classifyTrend`, used for the exercise's headline status everywhere
it's shown — session screen, `/progress`, exercise detail) had no way to tell the difference. This
is distinct from the trial's own internal comparison (`blockTrend` in §10 above), which was always
correct — it only ever compares trial-block-vs-baseline-block on their own terms. The bug was in
the *outer* trend, which read straight through a switch as one continuous series.

**Fix, same shape as §4's fatigue adjustment, deliberately not the same mechanism:** `classifyTrend`
gained a `comparableToCurrent?: (boolean | undefined)[]` parameter, index-aligned with `values`
exactly like §4's `sessionPositions`. Unlike the fatigue adjustment, which *credits back* a
fatigued reading toward its fresh-equivalent value, a point marked `false` here is dropped
entirely before anything else runs (slope fit, PR tracking, everything) — there's no honest way to
convert an e1RM reading from one rep-range regime into another's terms, so exclusion is the right
move, not a discount.

What counts as "not comparable to current" is computed bespoke in `getExerciseProgressStory.ts`
(same known v1 scope boundary as the warm-start/exclusivity logic above — only linear-progression's
`repRangeTrial` shape is understood), read straight off `suggestion.nextState` with no extra repo
fetch, by a four-case rule:

- **No trial ever run:** nothing excluded.
- **Trial active, not yet concluded:** only pre-trial points count as "current" — the trial's own
  readings haven't proven anything yet and might get abandoned, so they shouldn't drive the
  headline trend before the trial itself has a verdict.
- **Concluded, reverted (didn't switch):** pre-trial points AND everything after the trial ended
  count as "current" (both are the same baseline regime) — only the abandoned trial window itself
  is excluded.
- **Concluded, switched for good:** only points from the switch onward count as "current" — the
  old baseline history is the regime that's no longer active.

Surfaced in `Reasoning.inputs.excludedForRegimeChange` (a count) on every `classifyTrend` result,
same transparency bar as §4's `fatigueCalibrated`/`fatigueCalibrationSamples` — the "Why?" dialog
shows when and how many points the classifier chose to ignore, not just the final slope. Covered by
unit tests on `classifyTrend` directly (`domain/progression.trend.test.ts`) and integration tests
through `getExerciseProgressStory` for all three trial states (switched, reverted, still-active).

This is also the first concrete case of a more general need — see §10.3's "tag training blocks"
item below, which this fix's shape was deliberately built to generalize toward rather than being a
one-off patch.

### 10.2 Y-axis added to the exercise progression chart (2026-09-12)

Small, unrelated polish item raised in passing: `ExerciseProgressionPanel.svelte`'s chart
(`layerchart` `AreaChart`) was rendering with `axis="x"` — date labels only, no way to read actual
values off the chart itself, only the tooltip. Removed the override (layerchart's default `axis`
renders both) and added a `yAxis` label (metric name + unit, e.g. "Estimated 1RM (kg)") and a
whole/1-decimal value formatter. No contract change, no new data — purely a chart-config fix.

### 10.3 Raised but not built (2026-09-12)

Three follow-on ideas came out of the same conversation as the confound fix above — real, worth
designing properly, but none are launch blockers for v1 rep-range experimentation. Noted here so
they aren't lost, not scoped or sequenced yet.

**1. Sequential rep-range search, not a single one-shot trial.** v1 tries exactly one alternative
range per exercise (the muscle-group warm start, or `+7` reps above the current ceiling as a
fallback) and then permanently stops offering more — the mere presence of a `repRangeTrial` record
blocks a second trial on that exercise (§10 above, "known v1 compromise"). Martin's question: if
10-15 shows no real difference over a 5-8 baseline, should the next offer be 15-30? And should
exploration ever try *lower* than the baseline, not just higher — v1's fallback direction
(`+7`) is an arbitrary first guess, not a principled one. A real ladder needs to decide: how many
rungs before giving up, whether the ladder itself can be muscle-group-informed the same way the
first trial's warm start is, and how to avoid re-litigating a range that's already been ruled out
for a sibling exercise. Tracked for after v1's single-trial version has proven out in practice.

**Decision (2026-09-12): bounded ladder, upward only, muscle-group-aware.** Up to **two more
rungs** after the first trial (three attempts total per exercise) before permanently giving up and
falling back to "usual range" — e.g. 5-8 → 8-12 → 15-30, stop. Upward only; not exploring below
the original baseline in v1 (keeps the ladder simple and matches the existing `+7` fallback
direction rather than doubling the design surface). The ladder must stay muscle-group-informed the
same way the first trial's warm start already is: a rung already ruled out (no real difference) for
one exercise sharing a primary muscle should demote, not repeat, as the next suggested rung for a
sibling exercise's ladder — reuses the existing warm-start read path in `getSuggestion.ts`, extended
to also read prior *sibling* ladder outcomes, not just their starting values. `repRangeTrial`
becomes an array/history (one entry per rung attempted) instead of the single-record shape from
v1 — the "does a trial already exist" gate becomes "has the ladder reached its cap," not "has any
trial ever run."

**2. A plateau-diagnosis ladder across the three existing hypothesis-testing mechanisms.** This
doc already has three independent ways of testing "why has this stalled" — rep-range (§10),
muscle-group volume/frequency (§5), and nutrition (§9) — and none of them currently talk to each
other. Martin's question: if rep-range experimentation (once #1 above exists) exhausts its ladder
with no real difference, should the system suggest a volume change next (§5) — and if that also
doesn't move the needle, prompt a nutrition check (§9)? This is a genuinely separate feature from
any one of the three: an orchestration layer sitting *above* them deciding "what to try next", not
another way of testing one variable. Depends on §5's option B and §9 actually landing first — not
scoped.

**Decision (2026-09-12): present options, don't impose an order.** No fixed
rep-range→volume→nutrition sequence — once an exercise's rep-range ladder (§10.3.1) is exhausted
with no real difference, surface *all* applicable next hypotheses (a §5 volume/frequency change on
that exercise's primary muscle, a §9 nutrition check if enough diary data exists) as parallel
options through the same reasoning/nudge UI, and let the user pick which to try next — consistent
with this doc's standing bar that these are decisions the user is walked through, not decisions
made silently for them (§3, §5.3, §10). The orchestration layer's job is narrower than originally
framed: detect "this exercise's plateau has exhausted its cheapest test" and enumerate what's left
to try, not decide for the user which to run. Depends on §5 option B, §9, and §10.3.1 all landing
first — build this last of the three.

**3. Tag training blocks (Martin's idea).** A general, user-facing mechanism to mark a period of
training with a reason — injured, deliberately changing tempo, or "just different, no particular
reason" — so that period doesn't leave an undifferentiated mark on the exercise's trend history.
This is the *same underlying need* as the §10.1 confound fix, generalized: that fix already
established the pattern (a per-point "is this comparable to the current regime" flag feeding
`classifyTrend`'s new `comparableToCurrent` parameter) — but it's derived automatically, and only
for the one case an algorithm already tracks (a linear-progression rep-range trial). A real tagging
feature would let the user say so explicitly, for any reason, on any exercise, not just that one
case. `WorkoutSession.excludeFromProgression` is the existing, coarser precedent — a plain
whole-session boolean, no reason recorded, nothing finer-grained than "this whole session doesn't
count." A proper version would want: a reason/tag (so the exercise detail view can show *why* a
gap exists — "recovering from shoulder strain, Aug-Sept" — rather than silently omitting sessions),
scoping finer than a whole session where only one exercise was actually affected, and feeding into
`comparableToCurrent`-style exclusion generically rather than every feature growing its own bespoke
version of the same idea. Not scoped or estimated — a real connected idea worth designing properly,
likely after the current launch-blocking items in §11.

**Decision (2026-09-12): fixed categories + free text, both creation surfaces.** A new
per-exercise, per-date-range tag: `reason: "injury" | "tempo-technique-change" |
"deliberate-variation" | "other"` plus an optional free-text note (the `"other"` category always
requires the note; the rest may carry one too — "recovering from shoulder strain" reads as a note
on `"injury"`, not a fifth category). Creatable from **both** surfaces: the exercise detail page
(pick a date range + reason, for annotating history after the fact) and session edit (mark this
exercise, in this session, with a reason, in the moment). Both write the same underlying record —
one data model, two entry points, not two features. Feeds `comparableToCurrent`-style exclusion
generically, generalizing the §10.1 pattern: any point falling inside a tagged range is excluded
from the outer trend the same way a rep-range regime-change point is, surfaced in
`Reasoning.inputs` the same way (`excludedForTaggedBlock` alongside the existing
`excludedForRegimeChange`). Coexists with `WorkoutSession.excludeFromProgression` rather than
replacing it — that stays the coarse whole-session/all-exercises escape hatch; this is the
finer-grained, reasoned, per-exercise version.

## 11. Sequencing

1. ~~Reasoning-trace contract + generic "Why?" UI (§3)~~ — **shipped**, PR #66.
2. ~~Context-adjusted per-exercise suggestions (§4)~~ — **shipped**, PR #66.
3. ~~Personalized volume/frequency landmarks (§5), v1~~ — **shipped**, PR #66. The full
   pluggable family (§5's "option B") remains a tracked launch blocker, not done yet.
6. ~~e1RM everywhere (§8)~~ — **shipped**, PR #66.
8. ~~Deliberate signal-generation UX — order-variation nudge + rep-range experimentation (§10)~~
   — **both shipped**, including the rep-range/e1RM confound fix (§10.1).

**Round 2 (2026-09-12): every remaining item above is now scoped** (decisions recorded inline in
§5, §6, §9, §10.3.1-3 above) and queued for implementation on `feat/progression-engine-round2`,
build order chosen to respect real dependencies and to front-load the smallest/most
self-contained pieces:

1. ~~§7 Autoregulation input widening~~ — **shipped** (2026-09-12). Contract accommodation only:
   `ProgressionInput.liveInput?: { rpe?; readiness? }`, threaded through `getSuggestion.ts`. No
   built-in algorithm reads it; no capture UI exists yet either — that's the eventual plugin
   author's problem, per §7's own framing.
2. ~~§10.3.1 Sequential rep-range search~~ — **shipped** (2026-09-12). `repRangeTrial` (single
   record) → `repRangeLadder` (array); up to 2 more rungs after the first (3 attempts total),
   upward only, then permanently gives up. Muscle-group-aware across the whole ladder, not just
   the first rung — `siblingRuledOutRepRanges` (new `ProgressionInput` field) lets one exercise's
   ladder climb past a range a sibling's ladder already ruled out.
3. ~~§10.3.3 Tag training blocks~~ — **shipped** (2026-09-12). New `TrainingBlockTag` domain type +
   repo (sqlite/local, logit-frontend only — not exposed via the coach remote API, same precedent
   as rep-range experimentation); fixed reason taxonomy (injury / tempo-technique-change /
   deliberate-variation / other) + free text; creatable from both the exercise detail page and
   session edit. Generalizes §10.1's `comparableToCurrent` exclusion — surfaced as
   `excludedForTaggedBlock` alongside `excludedForRegimeChange`.
4. ~~§5 option B~~ — **shipped** (2026-09-12). Full pluggable `muscle-group-insight` family,
   mirroring `mobility-progression`'s contract + registry + settings-picker shape exactly: global
   single picker, v1's learned median-split logic becomes the built-in algorithm
   (`learnedMuscleGroupInsight`), `getMuscleGroupInsights.ts` keeps the generic plumbing and
   delegates the correlation itself. Every plugin-system file that knew about
   `mobility-progression` was checked and updated for parity.
5. ~~§6 Program library~~ — **shipped** (2026-09-12). Four built-in starter programs (full-body
   3x, upper/lower 4x, PPL 6x, 5x5 strength) as `CoachProgram` template records, one representative
   week each (manual start, no auto-dated arc — these are repeating routines). Both entry points:
   onboarding step 2 offers a guided program alongside the existing split presets; a permanent
   `/programs/browse` page (linked from Splits) plus `/programs/builtin/[id]` mirror the existing
   coach-program detail/start flow, with a "Stop following" action.
6. ~~§9 Nutrition × training correlation~~ — **shipped** (2026-09-12), full build as decided (not
   deferred). `LoggedItem.loggedAtMs` (additive, stamped only when logging to *today's* diary —
   backfilled days deliberately get none). Day-level: median-split on daily protein vs. session
   volume improving on the one before. Meal-timing: a qualifying carb item (≥20g) logged 30-60min
   pre-session vs. not. Stricter gates than §5's (20 sessions minimum, 6/bucket, 20-point rate-diff
   threshold) and confidence capped at "medium" — never "high" — per the extra-caution call.
7. ~~§10.3.2 Plateau-diagnosis ladder~~ — **shipped** (2026-09-12), last, once 2/4/6 above landed.
   Scope narrowed per Martin's decision to "detect exhausted + enumerate, don't decide for the
   user": once an exercise's rep-range ladder (§10.3.1) exhausts all 3 rungs with no win,
   `ExerciseProgressStory.plateauNextSteps` surfaces the remaining hypotheses (this muscle's
   volume/frequency, §5; nutrition timing, §9) as plain links into the existing `/progress` tabs —
   no new orchestration engine, no imposed order.

**All items in this round are now shipped.** Docs/marketing debt (§13) update is the next and
last item — batching per Martin's standing "don't chase it per-slice" call, not before.

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

**External-facing pass done (2026-09-12), branch `docs/progression-engine-round2-debt`:**
- ~~`apps/clients/docs-site/src/routes/docs/plugins/reference/+page.svx`~~ — fixed. Also caught
  and fixed a bigger pre-existing gap while there: the `family` union and capability-id-field line
  had never listed `mobility-progression`, `mobility-pack`, or `muscle-group-insight` at all (not
  just missing this round's additions) — the whole family list was stale, not just this round's
  delta. Added a `Reasoning`/`ReasoningConfidence` entry to the input/output types list.
- ~~`docs/plugins/progression/+page.svx`~~ — added a "Reasoning and nudges" section documenting
  `reasoning`/`ProgressionNudge` on the output, and `liveInput`/`suggestedTrialRepRange`/
  `siblingRuledOutRepRanges` on the input.
- ~~New `docs/plugins/muscle-group-insight/+page.svx`~~ — written to the same shape as the
  `mobility-progression` page (contract, input/output tables, built-in algorithm description).
- ~~`docs/plugins/+page.svx` family index~~ — was already missing `mobility-progression` and
  `mobility-pack` (pre-existing, not just this round's gap); added those plus `muscle-group-insight`
  together, "six things" → "nine things".
- **`TrainingBlockTag` (§10.3.3) and the program-library content model (§6) deliberately did NOT
  get docs-site pages** — checked first: docs-site only has two sections ever, self-hosting and
  plugin authoring (`docs/+page.svx`), and neither feature is a plugin extension point (no
  algorithm reads a `TrainingBlockTag`; a program is authored the same way a coach's `CoachProgram`
  already is, nothing new for a plugin author to hook into). Adding a page for either would be a
  new, unprecedented "user-facing feature docs" section on a site that has never had one — bigger
  scope than this debt pass warrants. Covered via marketing copy instead (below), same as every
  other user-facing feature (habits, social, etc.) that also has no docs-site page.
- Marketing site (`apps/clients/logit-marketing/src/routes/+page.svelte`) — "What you get" grid
  updated: `Algorithms` card now says "shows its reasoning, not just a verdict" + per-muscle-group
  volume/rep-range learning + e1RM; `Nutrition` card gained the training-correlation hypothesis
  line; new `Programs` card covers the built-in program library as the explicit alternative for
  people who don't want the engine at all. Grid widened to 4 columns (`lg:grid-cols-4`) to fit it.

**This round's sequencing (§11) and its docs/marketing debt (§13) are both fully shipped.**

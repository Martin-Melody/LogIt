# Profile redesign: an Instagram-style progress page, with "copy to mine"

Design doc, not yet built. Written 2026-09-05 after Martin reframed the last remaining item of
the social redesign (see [[project_social_redesign]] / `docs/bugs/social-smoke-test-findings.md`)
mid-session: `/routes/profile` shouldn't just be dedup'd onto `ProfileView.svelte`, it should
become a real "make it your own, share your progress" page — for others to view, comment on (via
existing posts, no new capability), or **copy** into their own account.

## 1. Scope, confirmed with Martin

1. Customization focus is **progress content**, not visual/curation — new widget types, not a
   cover-photo/highlights system.
2. Comments stay post-scoped (today's `CommentSheet` model). No profile-wall/guestbook feature.
3. Covers **both** `/routes/profile` (self) and `ProfileView.svelte` (visiting anyone) as one
   experience — self becomes "my own `ProfileView` + edit controls," not a separate
   implementation.
4. Progress photos: **one current photo for V1**, reusing the exact avatar pattern (client
   resize → base64 data-URL → inline DB column). No object storage exists in the API today — a
   real timeline/gallery is a later, separate infra project once real file storage exists.
5. New widgets for V1: weight trend, streak/heatmap, and milestone badges — **all three**, plus
   the photo widget. All computable from data already stored (`WeightEntry`, `WorkoutSession`,
   `HabitEntry`) — no new backend.
6. "Copy to mine": splits, exercises, progression/analytics/**nutrition** algorithms, and habits.
   ("Download the algorithm from your favourite influencer" — content can come from anyone
   visible via feed/profile/search, not just people you follow; no new discovery mechanism
   needed.)

## 2. Two findings that shape the plan

### 2a. Existing post payloads are lossy display summaries, not copyable objects

`CreatePostSheet.svelte`'s `buildPayload()` (`~line 154-206`) was built only to render an
attachment card (`PostAttachment.svelte`): Split payloads keep day names + exercise *names* only
(no sets/reps/rest/exercise ids); Exercise payloads keep name+notes only (no type/muscle groups/
tracking fields). Neither can reconstruct the real domain object today.

**Algorithm and Widget are the exception** — their payloads already carry just an `id` into a
fixed registry (progression/analytics algorithms; bundled widgets), which is all "copy" needs.
So the five copy targets split into two buckets:

- **Cheap — id-reference copy, no payload changes beyond widening `family`:** Algorithm
  (progression/analytics already work; add `"nutrition"` as a third `family`, backed by
  `packages/core/src/nutrition/algorithmRegistry.ts`, same shape as the other two) and Widget
  (already works — "copy" = enable that widget id in your own `profileConfig`/`homeConfig`, both
  keyed to the same fixed local registries).
- **Needs real payload work — full fidelity, not a summary:** Split (full day/block/set/rep/rest
  structure, plus a plan for exercises the copier doesn't have), Exercise (full `Exercise`
  domain shape), and a **new** `Habit` post type (cheapest of the three — `Habit` is already
  small and self-contained: name/cadence/target/icon/tone, no id-resolution problem).

### 2b. The self-page widgets and `ProfileView`'s stats are two unrelated systems today

- Self page (`/routes/profile`): `localProfileWidgetRegistry`
  (`src/lib/features/profileWidgets/`) — live components (`BodyStatsWidget`, `ActiveSplitWidget`,
  `PersonalRecordsWidget`) reading local stores/repos directly. Instant, no sync lag.
- `ProfileView.svelte` (`~line 216-264`): a hand-written "Training stats" block reading a plain
  JSON snapshot (`publicProfileJson`, built by `buildRemoteProfile()` in `syncService.ts`).
  Works for visiting anyone (including yourself), but only as fresh as the last sync push.

Making "one experience" real rather than cosmetic means defining each progress stat as **one
typed data shape + one presentational component** — e.g.
`WeightTrendData = { points: { dateIso, kg }[] }` + `WeightTrendWidget.svelte(data)`. The self
page computes that shape live from local repos and renders it immediately; the exact same shape
serializes into `publicProfileJson` (extending `buildRemoteProfile()`) so `ProfileView` renders
the *same* component for anyone — including a near-real-time view of yourself, since
`syncPublicProfile()` already pushes after every local edit and a `ProfileView` refetch can
follow it. This also gives a plugin author the same {compute, component} contract for a future
custom progress widget, per `feedback_design_for_plugins`.

## 3. Phased build plan

**P1 — Progress widgets (photo, weight trend, streak, badges)**
Four new `WidgetDefinition`s. `CurrentPhotoWidget` clones the avatar upload pattern exactly
(`ProfileAvatar.svelte`'s `resizeImage`/`pickImageFile` + a new `progressPhotoDataUrl` column
alongside `avatarDataUrl`). `WeightTrendWidget` reads `WeightEntry` via `NutritionRepo` (check for
an existing chart primitive in `src/routes/nutrition/**` before adding a dependency).
`StreakHeatmapWidget` reads `WorkoutSession`/`HabitEntry` history — grid vs. count decided during
implementation based on what's legible at profile-card size. `MilestoneBadgesWidget`: a small,
explicitly bounded v1 set (workout streak thresholds, PR-count, monthly consistency) — not an
open achievement system, pure client computation, no server verification (not competitive-
facing). Extend `buildRemoteProfile()`/`pullAndApplyProfile()` to carry all four shapes, extend
`ProfileView`'s stats block to render them via the shared components.

**P2 — Self page ↔ `ProfileView` unification**
With the widget layer genuinely shared, do the mechanical swap: delete `/routes/profile`'s
duplicated avatar/name/bio/follower-counts/posts-list code, render
`<ProfileView username={authStore.user.username} headerActions={...}>`, fold the avatar picker +
name/bio edit form into `headerActions`, force a refetch via a `refreshKey` bump after save. Keep
bespoke: settings gear, unauthenticated path, account status bar, bottom nav links — no
`ProfileView` equivalent, don't need one.

**P3 — Copy to mine: cheap tier (Algorithm, Widget)**
Widen `Algorithm`'s `family` union to include `"nutrition"`. Add a "Copy to mine" action on
Algorithm/Widget posts (`PostCard.svelte`/`PostAttachment.svelte`): Algorithm → the matching
`set*Algorithm`-style setter for that family; Widget → enable that widget id in the viewer's own
config slots. Both same-account local writes, no new API endpoint. Nice-to-have: lightweight
local provenance (`copiedFromPostId`/`copiedFromUsername`) for a "via @username" label.

**P4 — Copy to mine: full-fidelity tier (Split, Exercise, new Habit post type)**
Widen Split/Exercise payloads to full fidelity — check payload-size limits `POST /posts` already
enforces. Split copy's hard problem: a copied split may reference exercises the copier doesn't
have — resolve by embedding enough per-exercise data to create a local copy of any *custom*
exercise it uses (core/bundled exercises match by id, no embedding needed; reuses the Exercise
payload widening). New `PostType = "Habit"`, mirroring Split/Exercise end to end. All four copy
actions regenerate fresh local ids on save — never reuse the source's id.

## 4. Explicitly out of scope / deferred

- Progress-photo timeline/gallery — needs real object storage, a separate infra project.
- Comment-on-profile / guestbook — confirmed staying post-scoped.
- Copying `WorkoutSession`/`PersonalRecord` posts — not in Martin's list; plausible P5 later
  (session-as-template).
- Copying a widget sourced from an installed *plugin* the copier doesn't have — plugin
  distribution is a different problem than the fixed local registries this plan covers.
- Server-side anti-cheat/verification for badges — not competitive-facing, not needed.

## 5. Verification (once slices are implemented)

- `npm run check` — same pre-existing baseline (38 errors as of 2026-09-05), 0 new.
- `tests/social.spec.ts` needs new coverage per slice (new post type, copy actions).
- Manual pass: confirm a self-edit shows up on your own `ProfileView` render without a full app
  restart (the `refreshKey` remount), and that a copied split/exercise/habit is fully usable
  afterward, not just visually present — start a session from a copied split, check off a copied
  habit.

# TODOs

## Open

- [ ] Leave a single exercise (or set) out of progression. Whole sessions can already be
      excluded (session details › Edit › "Exclude from progression"), e.g. a weekend at
      another gym, but not one exercise on its own, e.g. one machine that felt different.
- [ ] Let the user bias how the progression algorithm plans sets, with the algorithm allowed to
      override when it thinks something else would work better:
  - fewer sets with more reps, or more sets with fewer reps
  - heaviest set first and back off (a top set and back-offs), or build up
- [ ] Let algorithms suggest set types (drop sets, myo-rep match…), not only reps and weight.
      `SuggestedSet` already has a `setType`; linear progression doesn't use it yet.
- [ ] A time budget for a workout ("I have 1 hour"): plan sets to fit, using how long each
      exercise usually takes. `ProgressionInput` already carries `timeBudgetMs`; nothing sets or
      uses it yet.
- [ ] Swipe between the bottom-nav pages, Instagram style, in bar order (Start in the middle).
      With the default bar that's Home ↔ Social ↔ Start ↔ Profile. Show the bottom nav on the
      workout screen too (it's hidden on `/session/current` and `/session/plan` today).
      On/off toggle in Settings › Navigation bar (`/settings/navbar`); the order is the bar order.
  - Opening `/session/current` starts a workout (`currentSession.start()` on load), so swiping
    past it would start one by accident. It needs an idle "Start workout" state first.
  - Only on the tab pages themselves, not detail pages like `/exercises/[id]` (those keep
    swipe-to-go-back).
  - Clashes with things that already swipe sideways: swipe-to-edit/delete set rows, the Today's
    Plan carousel, drag grips, charts. They need to claim the gesture first.
  - Start with "swipe, then slide to the next page" (the layout already uses view transitions).
    A page that follows the finger means rendering neighbouring pages at the same time; only
    do that if the simple version feels wrong.
- [ ] One shared top header (like the bottom nav) with a notifications bell on every main page.
      Exceptions to decide; probably onboarding/auth and maybe the workout screen.
  - The bell opens one inbox: social (likes, comments, follows, from the server) plus local
    ones: PRs, progression (target raised, deload suggested), nutrition, habits/check-ins.
  - Local notifications need storing on the device (they work offline and signed out); social
    ones stay on the server. Merge them in the inbox, with filter chips and per-type on/off.
  - Pages currently draw their own headers (`page-header`), so each page needs to hand its
    title and buttons to the shared header.
- [ ] Mobility (maybe any exercise) as a circuit or one after another, with a countdown and
      no tapping "add set" + "start timer" for every drill. **Needs a design conversation
      first.** What's there now: hold timer counts up and doesn't stop at the target; supersets
      exist for strength only (`StrengthBlock` `canSuperset`/`linkWithNext`).
  - Real example (2026-11-11 mobility day): hamstring, butterfly, pancake, pigeon (per side),
    middle split, 4 × ~30 s each, rest off, one drill at a time. Target said 20 s, holds
    were 30–36 s (stopped by hand, so a few seconds of lag in each). 5 drills take about 3
    screens of scrolling. Leaning towards: a set count + hold time per drill, a 3-2-1
    lead-in, countdown that stops on its own, short switch-sides gap, auto-advance.
  - Martin's direction: set up circuits like supersets, from an exercise's menu, picking the
    exercises to put in it. Plan: one grouping, not two. Grouped = circuit (A1 B1 C1, A2…),
    not grouped = one after another, so no separate mode switch. "Superset with next exercise"
    becomes "Superset / circuit with…" with a picker of the workout's other exercises.
    `groupIntoSuperset` already takes N blocks of any type and merges groups; missing are the
    picker, mobility in `SupersetGroup` (round count and + Round only count strength) and
    the menu item on `MobilityBlock`. Label: 2 → "Superset", 3+ → "Circuit" (renamable).
  - Keep the link icon as the one entry point for supersets and circuits.
  - Each member of a circuit has its own goal: time (pull-ups 30 s), reps (10 push-ups) or
    distance (10 m sprints). Mobility has hold/reps and cardio has distance/time already;
    strength sets have no duration (`SetEntry` is reps × weight), so timed strength sets need
    a `durationSec` and a decision on what progression does with them.
  - Mixing types is allowed, but the picker shows the same kind first (mobility next to
    mobility) and other exercises lower down, so bench + hamstring stretch isn't the default.
  - The picker lists the workout's exercises, plus an "Add another exercise" row at the end
    that opens the normal exercise search; the pick is added to the workout already ticked.
  - Overlay while running: "3, 2, 1 — Hamstring stretch", big countdown (or the rep/distance
    goal with a Done button), round and side, small "Up next: Middle split", pause / skip /
    +10 s, and it can be shrunk to see the list.
  - Agreed with Martin 2026-11-11. Build order: (1) link icon + picker for any block type,
    (2) rounds / + Round for mobility in groups, (3) the overlay with hold countdowns,
    (4) supersets and circuits in splits, (5) timed strength sets (data model change).
    1–3 cover the mobility-day case; 4 means it doesn't have to be set up by hand each week.
  - Step 1 built 2026-11-11 (branch `feat/circuits`): "Superset / circuit with…" in the ⋯
    menu of strength, mobility and cardio; shared `GroupPickerSheet` fed by
    `features/session/grouping.ts`; "Add another exercise" comes back ticked; members drag
    within their group; drags can no longer drop a block inside a group (that used to split
    it). Not yet: renaming a group, a way to take one exercise out of a group.
  - Step 2 built 2026-11-11: the group's round count includes mobility (an L/R pair is one
    round; `supersetRoundCount`), "Add round" adds a set or L/R pair to each drill with the
    last set's hold target and load, and drills follow the group's rest rule (only the last
    exercise of a round rests). Cardio still has no rounds; that waits for per-member goals.
  - Step 3 built 2026-11-11: "Start" on a group with drills opens the full-screen countdown
    (`features/session/circuit/`, pure state in `@logit/core/domain/circuit`). Round by round,
    drills in workout order, leading side first; 3-2-1 lead-in, a hold that stops and saves
    itself (goal = set target, else the drill's last hold, else 30 s), 5 s to switch sides,
    rep drills get a goal with −/+ and Done. Pause / +10 s / Skip (a hold skipped part-way
    keeps the time held; a skipped lead-in leaves the set unlogged), "Rest between rounds"
    chip on the group (off by default, stored as `roundRestMs` on the group), shrink to a bar
    above the finish bar, End. Beeps on 3-2-1 and at the end, haptics, screen kept on.
    Starts at the first set not done, so it can be resumed. Limits: strength and cardio
    members are skipped by the countdown (step 5); a reload stops a running countdown (what
    was saved stays); no phone notification when a hold ends with the app in the background
    (it catches up on return).
  - After Martin's first phone test (2026-11-11): the ring follows every frame; a group can be
    set to Superset or Circuit (`SupersetInfo.kind`, in the picker and the group's ⋯ menu;
    unset = by count), a circuit can be one exercise (one drill for N rounds); the ⋯ menu also
    has Ungroup and "Remove … and its exercises"; history and the recap name groups with
    `groupLabel` (they said "Superset" for every group); the add button no longer sticks to
    the bottom after the finish bar is re-mounted.
  - Step 4, plan groups in a split day (added 2026-11-11):
    - Split days can't hold mobility at all yet (`PlannedBlock` = strength | cardio), so add
      a planned mobility block first: drill, sets, hold or reps, target, per side.
    - A group field on planned blocks plus the group's own settings (label, rest between
      rounds). The server keeps splits as one JSON blob (`SyncedSplit.DataJson`), so no API
      change; the local `planned_blocks` table needs a migration.
    - Split day editor: the same link icon and picker as the workout (build the picker as a
      shared component in step 1). In a group the round count is set on the group, not per
      member.
    - Agreed with Martin: in step 4 the split builder also gets the session screen's look,
      by sharing pieces rather than reusing the session blocks (`StrengthBlock` reads
      `$currentSession` and does ticking/rest timers): the ⋯ menu per row (Swap,
      Superset / circuit with…, Remove) instead of the bare ✕; the same group band as
      `SupersetGroup`; the session's `BlockPickerSheet` instead of the inline Strength /
      Cardio bar; session-style summaries ("4 × 30 s hold", "3 × 8 · BW"). Split targets
      stay their own fields. Editing a split day on the workout screen itself (an edit mode)
      is a possible later, separate project.
    - `planSplitDay` recreates the groups with `groupIntoSuperset` after adding the blocks;
      progression still plans each block on its own.
    - Coach programs already have `supersetGroup` on `ProgramStrength`/`ProgramCardio`, but
      nothing reads it, so a coach's supersets are lost when the client starts the day. Wire
      it up the same way.
  - Decided with Martin 2026-11-11: circuit order = workout order, members can be dragged
    within the group. Between exercises only the 3-2-1 lead-in (with "Up next"); a separate
    rest between rounds, off by default, set per circuit (e.g. 60 s). After a timed strength
    set, a skippable reps prompt (time always saved). Timed sets go to the algorithm
    (`durationSec` on the interface); the built-in algorithm ignores them for now.
  - Edit circuit / superset sheet (Martin's idea 2026-11-12, mock:
    https://claude.ai/artifact/JimQ9yGM5435p3xi8uzjCJ): tap a group's name to open it, like
    tapping an exercise name. Name, type, rounds stepper, get-ready length, rest between
    exercises, rest between rounds, a time estimate, Ungroup / Remove. Replaces the
    round-rest chip under the group header. Decided with Martin 2026-11-12:
    - In a strength superset the group's rest replaces each exercise's own rest timer while
      it's in the group (its own rest comes back when ungrouped).
    - Rest between exercises is ON by default for circuits only (supersets: off by
      default, still settable), settable in the sheet; its default length
      is app-wide in Settings next to get-ready (15 s proposed, not agreed). This replaces
      the 2026-11-11 "only the 3-2-1 between exercises". The get-ready countdown also gets
      a +10 s button (today +10 s only works on holds and rests).
    - One rest-between-rounds value per group; no different rest per round.
    - Get-ready length: an app-wide default in Settings (like rest defaults), overridable
      per circuit / during the workout the way rest timers are.
  - Collapsing circuit blocks on the session screen (a long circuit takes a lot of the
    screen). Picked 2026-11-12 from the mock's options: collapsed, the whole group is one
    line (option A: name, "round 2 of 3", sets done, a progress line, Start, ⋯); expanded,
    it shows rounds (option C) and each round opens and closes on its own (the current
    round open, done rounds one line each). Finished groups don't collapse by themselves.
  - Built 2026-11-12: the edit sheet (`GroupEditSheet.svelte`, group fields `memberRestMs`,
    `leadInMs`, `roundRestMs` 0 = off), Settings › Circuits defaults (stored in
    `restDefaults` under `circuit.*` keys, so no migration), the countdown's rest between
    exercises and +10 s on the get-ready, and the collapsed one-line group (A). An unset
    round rest still means each exercise's own rest timer when ticking by hand (none in the
    countdown); the first side of an L/R pair in a group goes straight on to the other
    side.
  - Built 2026-11-12, the expanded rounds view (C): "By round" (default) shows each round
    with its own open/close; the round being worked on and any round with a rest running
    are open unless the user chose otherwise. Each exercise in a round shows its name, ⋯
    menu and that round's set (`round` prop on the blocks). "By exercise" is the old
    layout, kept for dragging, warm-up ramps, drop sets and the rep bars; the choice is
    remembered per group while the app runs (`groupViews.ts`). Cardio members show
    under the rounds.
- [ ] Edit the planned workout on the pre-workout screen (`/session/plan`) before pressing
      Start: swap an exercise for another, remove or add one, drag to reorder. Today the
      screen only shows the plan (`planSplitDay` → `SessionPlan`) and Start. (Martin,
      2026-11-12, a note, not designed yet.)
  - Reordering should take fatigue into account: an exercise moved later in the workout
    should get targets for a tired lifter, and moved first, for a fresh one. The pieces
    exist: progression already calibrates a per-exercise drop by position in the session
    (`calibrateFatigueDiscount` in `packages/core/src/domain/progression.ts`, fed
    `sessionPositions`), and `linearProgression` has a fatigue score. So a reorder should
    replan with the new positions rather than keep the old targets. Per the Principle
    below, this belongs in the algorithm, which gets the planned position as input.
  - Decided with Martin 2026-11-12: a change is for today by default, with an option to
    make it permanent (save it back to the split day). The app can suggest an order (e.g.
    big compound lifts before isolation work on the same muscles). Suggestions are under
    the user's control (can be turned off) and can always be overridden, never applied on
    their own. The "make permanent" choice is asked once, when Start is pressed, and covers
    swaps as well as reorders (Martin, 2026-11-12).
  - Also decided 2026-11-12:
    - Swapping shows suggestions first (same muscles / movement, same equipment), then the
      full list: replacing bench press shouldn't offer adductors first.
    - The order suggestion comes from the progression algorithm (it can grow an interface
      for it), so users customise it through the algorithm's preferences. Its on/off
      setting lives in Settings › Progression.
    - Dragging exercises during a workout re-plans the sets not yet logged, the same way.
    - Coach programs, for now (Martin: pick a sensible default, decide better later): a
      client can change a coach's day for today (swap, reorder, remove, add), but "save
      to the day" isn't offered; the coach owns the program. Later ideas: the coach
      decides whether clients may save changes, or gives suitable replacements per
      exercise.
- [ ] Switching machines mid-workout (your usual one is taken). Today the machine is picked
      per set in `EditSetDialog`: it snaps that one set's weight to the new machine's weights,
      but the other sets keep their planned targets, and progression treats every machine of
      an exercise as one history (machines are only used to round weights, in
      `getSuggestion`). Also `resolveExerciseMachine` picks the machine of the most recent
      set, so one forced switch makes the next workout plan for the backup machine.
      Martin asked 2026-11-12 whether targets update; they don't. Agreed first version:
  - Change the machine once for the exercise; it applies to every set not yet logged, for
    today only (no "make default?" prompt; the default is already easy to set).
  - Round the remaining planned weights to the new machine; a session on a non-default
    machine doesn't count as a regression on the usual one.
  - Plan with the default machine, not the last one used.
  - Still to do later (Martin: "remember that has to be done"): per the Principle, the
    algorithm gets the machine of each history set and the machine chosen today and
    decides itself, e.g. learns a ratio between two machines once both have history.

## Principle

Anything touching progression or analytics belongs in the algorithm itself, not hard-coded in
the app. If an interface has to grow to make that possible, grow it, so other authors can use
the same features in their own algorithms.

## Done

- [x] Today's Plan card is a carousel (today, tomorrow, …).
- [x] Search on the Sessions page.
- [x] Light / dark mode.
- [x] A workout with nothing logged can't be finished, and any workout can be discarded.
- [x] Edit a past session's date and time.
- [x] Leave a whole session out of progression.
- [x] Targets below 20 kg (e.g. a 17.5 kg dumbbell curl).
- [x] Assisted and bodyweight exercises: 0 = BW, +25 = BW + 25 kg, −25 = assisted, with
      progression and analytics that understand it, and volume counted from your bodyweight.
- [x] Exercise types (normal / assisted / bodyweight) on the exercise screen.
- [x] Progression plans each set separately (its own reps and weight) and can show the full block.

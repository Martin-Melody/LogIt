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
  - Overlay while running: "3, 2, 1 — Hamstring stretch", big countdown (or the rep/distance
    goal with a Done button), round and side, small "Up next: Middle split", pause / skip /
    +10 s, and it can be shrunk to see the list.
  - Agreed with Martin 2026-11-11. Build order: (1) link icon + picker for any block type,
    (2) rounds / + Round for mobility in groups, (3) the overlay with hold countdowns,
    (4) timed strength sets (data model change). 1–3 cover the mobility-day case.
  - Still open: one gap setting between exercises (e.g. 5 s or just the 3-2-1) plus a
    separate rest between rounds (e.g. 60 s)? After a timed strength set, ask for reps or
    only record the time? Circuit order = order ticked in the picker, or workout order?
    Ignore timed sets in progression, or pass them to the algorithm?

## Principle

Anything touching progression or analytics belongs in the algorithm itself, not hard-coded in
the app. If an interface has to grow to make that possible, grow it, so other authors can use
the same features in their own algorithms.

## Done

- [x] Logging in on a fresh install no longer loops back to the welcome screen: logging in
      to an existing account marks onboarding done (here and on the server) and goes home;
      signing up still goes through name and starter split, and the welcome step hides
      "Log in" once you're signed in. Found 2026-11-11 on a fresh dev install.
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

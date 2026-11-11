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

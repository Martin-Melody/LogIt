# Bug-hunt findings

Running log of what the persona bug hunts found (see `docs/testing-personas.md`), how each was fixed
and how the fix was checked. Every round drives the real app in a phone-sized browser against a
local API, with a faked clock where days need to pass. Each fix gets a test that failed before it.

Status: **fixed** (merged or committed), **open** (known, not fixed), **needs a decision** (a visible
or product change waiting on Martin; mock-up first).

## Round 1 — P1 newcomer, first week (2026-11-21, PR #104, merged 2026-11-22)

| # | Found | What it did to the user | Fix | Status |
|---|---|---|---|---|
| 1.1 | Web app never set the default progression algorithm | Beginners and under-2-year lifters got blank sets; onboarding best lifts ignored | Web seeds the default algorithm like a new phone profile | fixed (005691e) |
| 1.2 | "82,5" typed in the weight box | Logged 825 kg | Comma decimals accepted; weight ≥3× plan/other sets/last time warns with **Make it X** | fixed (139ea52) |
| 1.3 | Correcting a new exercise's first set | Later sets kept the plan made from the typo | Correcting it re-plans the sets it planned | fixed (139ea52) |
| 1.4 | App reloaded mid-workout | Lost which exercise you were on | The in-progress exercise opens again | fixed |
| 1.5 | Discard dialog | Said "14 logged sets" with none ticked | Counts ticked sets only | fixed |
| 1.6 | Recap line | "56m ·5" | "56m · 5 exercises" | fixed |
| 1.7 | Best lift with a weight and no reps | Dropped | Counts as a 1-rep max | fixed (ebb6857) |
| 1.8 | Signing in on a second browser | Sent through onboarding again | Web reads/writes the server's onboarding flag | fixed (ebb6857) |
| 1.9 | Quick Start while a workout runs | "Start new" only reopened the workout | Shows only Continue | fixed (61fb823) |
| 1.10 | Today's plan during that day's workout | Said "Done" | Says "In progress" | fixed (61fb823) |
| 1.11 | Saturday sign-up, 3 a week | Asked for "all 3" in 2 days | "0 of 2 done. Your first full week starts Monday." | fixed (61fb823) |
| 1.12 | Device without the saved plan start | "Monday's workout moved" to someone who joined today | Falls back to the split's creation date | fixed (61fb823) |
| 1.13 | Second device during a workout | Shows the day as "Done" | — the running workout doesn't sync | open |
| 1.14 | Typo in the very first set of a never-done exercise | No warning | — nothing to compare with | open |
| 1.15 | Home showed "Start Upper" and "Start Day 4 — Lower" at once; plan preview −0.5 kg vs workout +2 kg for the same sets | Confusing | — left for later on Martin's say | needs a decision |

## Round 2 — P1 28 days, P3/P4 imports (2026-11-21, PR #105, merged 2026-11-22)

| # | Found | What it did to the user | Fix | Status |
|---|---|---|---|---|
| 2.1 | Beginner doing every planned set with "2 left" for 4 weeks | Same weights for 28 days | "Reps left" count toward the strength estimate (max 3) | fixed (cc0697e) |
| 2.2 | Light dumbbells (10 → 12.5 kg is +25%) | Plan stuck until the next dumbbell fit | Reps go past the range until the next weight fits | fixed (cc0697e) |
| 2.3 | Lift reaching the estimate's rep cap | Sat at 12.5 × 15 for good | Steps up instead | fixed (7a66a11) |
| 2.4 | Back-off sets after a step up | 15 / 12.5 / 10 | From the estimate: 15 / 12.5 / 12.5 | fixed (7a66a11) |
| 2.5 | Off-grid dumbbell (4 kg) | Next weight 6.5 kg | Keeps 4 kg; next is 5 kg | fixed (cc0697e) |
| 2.6 | Hevy-style export | Refused ("needs a date column") | Reads `start_time`, month names, end time | fixed (8df3726) |
| 2.7 | Strong export, unused columns written as 0 | 60 s plank imported as 0 reps | Zero-filled columns ignored | fixed (a196806) |
| 2.8 | History screen | Listed most-logged lifts above a squat+bench+deadlift total | Lists the big three | fixed (a196806) |
| 2.9 | Week-1 summary | Opened before the last workout saved ("2 of 2" after three) | Waits for that workout | fixed (993cdbc) |

After 2.1–2.5, the same 28 days: goblet squat 12.5 → 17.5 kg, DB bench and shoulder press 10 → 12.5 kg,
row 12.5 → 15 kg, isolation lifts add reps then weight. Imports were tested with files in the
documented layouts, not real exports (waiting on Martin's).

## Crash reporting (2026-11-22, branch feat/crash-reports, 2940e04)

Not a bug hunt, but the thing that lets testers' crashes reach us. Test builds (every Play track but
production) send each crash automatically, also without an account; production builds don't.
See the commit for details.

## Round 3 — P0 app-store shopper, days 1–2 (2026-11-22, branch feat/crash-reports, b8ce02e)

Fresh install, beginner, "Stay fit", "Just starting", 3 days, full gym; empty bar for the barbell
lifts, light dumbbells; no "reps left" answers (as a hurried beginner would).

| # | Found | What it did to the user | Fix | Status |
|---|---|---|---|---|
| 3.1 | Day-2 plan after 3 × 8 × 20 kg | 8 × 20, then **8 × 17.5, 8 × 17.5** under a "Same weight" badge; lateral raise 10 × 4 then **10 × 1.5 kg**, curl 10 × 6 then **10 × 3.5 kg** | A later set is never planned lighter than the same set last time when that set made the range's fewest reps | fixed (b8ce02e) |
| 3.2 | Home Progression card | "Lateral Raise 3×10" for a 2-set exercise (every lift showed the default 3 sets) | Outside a workout, plan as many working sets as last time | fixed (b8ce02e) |
| 3.3 | First-workout screen on a Sunday | "Workout 1 of 3 this week" with no days left | Counts only what fits: "1 of 1 this week. Your first full week starts Monday" | fixed (b8ce02e) |
| 3.4 | Typing the first weight | A "+ Warm-up ramp" row appeared above the sets and moved the tick from under the finger (mis-tap) | Row always there, greyed until a weight; the tick moves 0 px | fixed (b8ce02e) |
| 3.5 | Workout 2 | Opened with every exercise collapsed | A new workout's first exercise opens | fixed (b8ce02e) |
| 3.6 | App name | "Logit" in 19 places, "LogIt" elsewhere | All visible text says LogIt | fixed (b8ce02e) |
| 3.7 | Goal choices | No option for someone just starting; "Stay fit — keep what you've built" assumes they've built something | — | needs a decision |
| 3.8 | Days a week | "4 days — The sweet spot" above "Not sure? Start with 3" for a beginner | — | needs a decision |
| 3.9 | Starting weight | "Pick a weight you could lift about 12 times" means nothing to someone who never squatted; no "start with the empty bar (20 kg)" | — (beginner day-one mockups) | needs a decision |
| 3.10 | How to | Three text cues, no picture | — (beginner day-one mockups) | needs a decision |
| 3.11 | Tours | Workout tour covers the first-time hint; step 1 packs four instructions; Home tour is 7 steps with "split" jargon | — | needs a decision |
| 3.12 | Empty reps box | Logs the bottom of the range (8) silently; a beginner who did 12 never learns to change it | — | needs a decision |
| 3.13 | Workout summary | "Squat 3 sets · 480 kg" and "Volume (kg) 1,640" after an empty-bar workout | — | needs a decision |
| 3.14 | Home after workout 1 | "0-week streak"; "Start Day 1 — Full Body A" right after doing it, and A again tomorrow | — (related to 1.15) | needs a decision |
| 3.15 | Plan card | "A set goes up at 8 reps" beside a plan that didn't go up after 8 | — | needs a decision |
| 3.16 | "Other plans", "Why?" | Text links, not buttons | — | needs a decision |

Good for P0: clear welcome with one main action, a workout in under a minute, a gentle "Save to a
free account / Not now" after workout 1, and no paywall or price anywhere.

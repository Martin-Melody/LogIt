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

## Round 4 — P8 coach, P9 coach who stops, P10 client with a free invite (2026-11-22, ef7a132)

Coach "dana_coach" (phone: "I coach people", "I train too", Studio given by the admin console) and
client "sam_client" (phone: "I have a coach", the coach's link code), side by side; hosted-mode API.

| # | Found | What it did to the user | Fix | Status |
|---|---|---|---|---|
| 4.1 | Coach on the phone never sees requests from her link or code | Client stuck on "Waiting for them to accept", coach's page still "Invite your first client"; nobody could finish connecting without the web dashboard | Phone Coaching page lists "Wants you as their coach" with Accept / Decline | fixed (ef7a132) |
| 4.2 | No way to Clients from the app's menus | A Studio coach landed on the lifter's Home; Clients only under Settings › Coaching | "Clients" in More for coaches (Studio or self-hosted), first in the list | fixed (ef7a132) |
| 4.3 | "See the Studio plan" during onboarding | Sent the coach back to "What do you want from training?" | The plans page is let through during onboarding | fixed (ef7a132) |
| 4.4 | Client's Coaching page | Showed "Coach your own clients — Studio is bought in the LogIt Android app" to someone who just said they have a coach | Hidden for clients (coached, asking, or invited) | fixed (ef7a132) |
| 4.5 | Invite card wording | "…and you're connected", but the coach has to accept | "They open your link and choose what you can see. You accept them here." | fixed (ef7a132) |
| 4.6 | Share message, algorithm authors, diagnostics header | "Train with me on Logit", "logit" | LogIt | fixed (ef7a132) |
| 4.7 | Coach intro | Studio is only mentioned after the account is made ("Coaching clients is the Studio plan") | — | needs a decision |
| 4.8 | Sign-up screen for a coach | "Back up your training, train with friends, get coached." | — | needs a decision |
| 4.9 | Free account in a browser | 18 refused sync requests on every sync (web backup is Pro); nothing on screen | — (Android sends the device id, so not on phones) | open |
| 4.10 | Buying Studio | Only in the Android app through Play; after buying, nothing brings the coach back to coaching setup | — test on the emulator with Play test cards | open |
| 4.11 | Home Progression card for a new user | "Finish a session and pick an algorithm in Settings to see targets here" though the default algorithm is set | — | needs a decision |
| 4.12 | Coach's program with no load, client types set 1 and ticks the rest | Sets 2–3 saved as **0 kg** (10×12, 8×0, 8×0); volume and next plans built on it | A set ticked with no weight and none planned carries the set before it (added/assisted weight too) | fixed (ef7a132) |
| 4.13 | Web dashboard "Me" for a Studio coach | "Welcome to Pro, dana_coach" | "Welcome to the dashboard" | fixed (ef7a132) |
| 4.14 | Web dashboard text | "Open Logit", "Get Logit on your phone", … | LogIt | fixed (ef7a132) |
| 4.15 | Coach's program on the client's Home | Even after Start program, Home says "No exercises planned"; Quick start only offers a blank workout; the program lives in More › Splits | — (Home doesn't know coach programs; design) | needs a decision |
| 4.16 | Splits tour for a coached client | "Tap New to build a training split" next to the coach's program | — | needs a decision |
| 4.17 | Bodyweight push-ups after 10/8/8 | Next plan "3 × 5 @ 2.5 kg" (big-lift range 5–8, so extra reps become added weight) | — (progression design: reps first, then a harder variation?) | needs a decision |
| 4.18 | Program day with no name | "Day 1 — Day 1" | — | needs a decision |
| 4.19 | Coach edits an assigned program | Reaches the client's phone only on its next sync (by design: "It reaches their phone on its next sync") | — | ok |
| 4.20 | Client stops coaching | "Their program, check-ins and habits leave your app" — but they stayed, even after sync and reload (the phone only pulled changes, and nothing is sent when coaching ends) | Coach program / check-in / habit / nutrition pulls fetch the whole small list and drop what's no longer assigned; also covers the coach removing a client | fixed (ef7a132) |
| 4.21 | Coach's web Today with no clients | "Sample clients are already in" when there are none | Said only when samples exist | fixed (ef7a132) |
| 4.22 | Coach drops from Studio with a client (P9) | Decision 2026-11-11 was "relationships stay, read-only"; in fact the server locks every coaching screen: web shows the raw "This feature requires a Studio-tier account or higher.", the phone hides the client and shows the Studio offer | — needs the server's coaching reads opened for a coach with real clients, and editing turned off in the dashboard (sizeable) | open (important) |
| 4.23 | Client's coach content | Check-ins are only reachable through More › Splits › From your coach (like the program, 4.15) | — | needs a decision |
| 4.24 | Messages, check-in answers, coach seeing the client's workout, program edits with "Also update" | Worked both ways (messages ~3 s; edits on the next sync) | — | ok |

## Round 5 — P12 social and notifications (2026-11-22, 3d4716f; plan: docs/testing-social.md)

Ava (Pro), Ben, Cara (private) and Dev side by side on phones; hosted-mode API.

| # | Found | What it did to the user | Fix | Status |
|---|---|---|---|---|
| 5.1 | Notifications page left open (Martin: "notifications not coming through") | New likes and comments never appeared until you left and came back (the list loaded once) | The page reloads its list when the unread count goes up, and marks them read | fixed (3d4716f) |
| 5.2 | Unread badge | Took up to a minute to show a like | Checks every 20 s (and still when the app comes back to the front) | fixed (3d4716f) |
| 5.3 | Follow status (Martin) | Nothing ever said someone follows you: their profile and your suggestions showed a plain "Follow" | "Follows you" and "Follow back" on profiles (phone and web) and in search | fixed (3d4716f) |
| 5.4 | Followers / following lists | Every person came back as "not followed" by you (the server never looked) | Lists carry your real status and whether they follow you | fixed (3d4716f) |
| 5.5 | Search for a private account you already asked | Showed "Follow" again | Shows "Requested" | fixed (3d4716f) |
| 5.6 | Sign-up through the API (and the app's form, which doesn't check) | Accepted "ava ava" (a space) and an empty display name; spaces break @mentions and profile links | Server: usernames 3–30 letters, digits or underscores; an empty display name becomes the username | fixed (3d4716f) |
| 5.7 | Suggestions | The admin account shows in "People you might know" | — | needs a decision |
| 5.8 | Push notifications | None: a like is only seen after opening LogIt | — (Martin wants push; FCM) | open |
| 5.9 | Follow, request, accept, like, comment, mention | Each notified the right person once, opened the right place | — | ok |
| 5.10 | Comment menu (press and hold) and every sheet or dialog opened from a page | Drawn under the bottom bar: "Delete comment" hidden, "Edit comment" half covered (the page was its own layer all the time, for the page-change animation) | The page is named for the animation only while it runs | fixed (3d4716f) |
| 5.11 | Blocking | The blocked person could still comment and like; their earlier comments, likes and notifications stayed (blocks only hid profiles and posts) | A block counts both ways wherever "can see" is checked; blocking removes their likes and comments on your posts and the notifications between you (as on Instagram) | fixed (3d4716f) |
| 5.12 | Your own post | You can only report a comment on it, not remove it | — | needs a decision |
| 5.13 | Reported post deleted by the admin | Others see "This post isn't available" with a "Try again" button that can't help; the admin's Delete has no confirmation | — | needs a decision |
| 5.14 | Photo posts | Don't exist (text plus an attached workout, PR, split, …), but the Play data-safety notes say "photos in posts" | — | needs a decision |
| 5.15 | Session ends while the app is open | Every request is refused (401) every minute and nothing on screen changes until a restart | — | open |
| 5.16 | Replies, editing, reposts, quotes, report → admin delete, account deletion, Discover | Worked: right notifications, counts after reload, everything of a deleted account gone | — | ok |
| 5.17 | The 2026-09-04 phone findings | Pull to refresh wired, badge now live (5.1/5.2), Sync now hidden where it can't work, the misleading dot gone, Coaching label clear | — | ok |
| 5.18 | "People you might know" | Someone who follows you showed a plain "Follow" there too | "Follow back" (requested accounts are left out of suggestions, as they should be) | fixed (3d4716f) |

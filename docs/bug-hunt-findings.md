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
| 1.15 | Home showed "Start Upper" and "Start Day 4 — Lower" at once; plan preview −0.5 kg vs workout +2 kg for the same sets | Confusing | — left for later on Martin's say | fixed (38e5ec7) |

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
| 3.7 | Goal choices | No option for someone just starting; "Stay fit — keep what you've built" assumes they've built something | — | fixed (a435928) |
| 3.8 | Days a week | "4 days — The sweet spot" above "Not sure? Start with 3" for a beginner | — | fixed (a435928) |
| 3.9 | Starting weight | "Pick a weight you could lift about 12 times" means nothing to someone who never squatted; no "start with the empty bar (20 kg)" | — (beginner day-one mockups) | fixed (a435928) |
| 3.10 | How to | Three text cues, no picture | — (beginner day-one mockups) | needs a decision |
| 3.11 | Tours | Workout tour covers the first-time hint; step 1 packs four instructions; Home tour is 7 steps with "split" jargon | — | fixed (a435928) |
| 3.12 | Empty reps box | Logs the bottom of the range (8) silently; a beginner who did 12 never learns to change it | — | fixed (a435928) |
| 3.13 | Workout summary | "Squat 3 sets · 480 kg" and "Volume (kg) 1,640" after an empty-bar workout | — | fixed (a435928) |
| 3.14 | Home after workout 1 | "0-week streak"; "Start Day 1 — Full Body A" right after doing it, and A again tomorrow | — (related to 1.15) | fixed (38e5ec7) |
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
| 4.7 | Coach intro | Studio is only mentioned after the account is made ("Coaching clients is the Studio plan") | — | fixed (ab4e654) |
| 4.8 | Sign-up screen for a coach | "Back up your training, train with friends, get coached." | — | fixed (ab4e654) |
| 4.9 | Free account in a browser | 18 refused sync requests on every sync (web backup is Pro); nothing on screen | — (Android sends the device id, so not on phones) | fixed (8082c54) |
| 4.10 | Buying Studio | Only in the Android app through Play; after buying, nothing brings the coach back to coaching setup | — test on the emulator with Play test cards | open |
| 4.11 | Home Progression card for a new user | "Finish a session and pick an algorithm in Settings to see targets here" though the default algorithm is set | — | fixed (e145971) |
| 4.12 | Coach's program with no load, client types set 1 and ticks the rest | Sets 2–3 saved as **0 kg** (10×12, 8×0, 8×0); volume and next plans built on it | A set ticked with no weight and none planned carries the set before it (added/assisted weight too) | fixed (ef7a132) |
| 4.13 | Web dashboard "Me" for a Studio coach | "Welcome to Pro, dana_coach" | "Welcome to the dashboard" | fixed (ef7a132) |
| 4.14 | Web dashboard text | "Open Logit", "Get Logit on your phone", … | LogIt | fixed (ef7a132) |
| 4.15 | Coach's program on the client's Home | Even after Start program, Home says "No exercises planned"; Quick start only offers a blank workout; the program lives in More › Splits | — (Home doesn't know coach programs; design) | fixed (4927772) |
| 4.16 | Splits tour for a coached client | "Tap New to build a training split" next to the coach's program | — | needs a decision |
| 4.17 | Bodyweight push-ups after 10/8/8 | Next plan "3 × 5 @ 2.5 kg" (big-lift range 5–8, so extra reps become added weight) | — (progression design: reps first, then a harder variation?) | fixed (e145971) |
| 4.18 | Program day with no name | "Day 1 — Day 1" | — | fixed (ab4e654) |
| 4.19 | Coach edits an assigned program | Reaches the client's phone only on its next sync (by design: "It reaches their phone on its next sync") | — | ok |
| 4.20 | Client stops coaching | "Their program, check-ins and habits leave your app" — but they stayed, even after sync and reload (the phone only pulled changes, and nothing is sent when coaching ends) | Coach program / check-in / habit / nutrition pulls fetch the whole small list and drop what's no longer assigned; also covers the coach removing a client | fixed (ef7a132) |
| 4.21 | Coach's web Today with no clients | "Sample clients are already in" when there are none | Said only when samples exist | fixed (ef7a132) |
| 4.22 | Coach drops from Studio with a client (P9) | Decision 2026-11-11 was "relationships stay, read-only"; in fact the server locks every coaching screen: web shows the raw "This feature requires a Studio-tier account or higher.", the phone hides the client and shows the Studio offer | — needs the server's coaching reads opened for a coach with real clients, and editing turned off in the dashboard (sizeable) | open (important) |
| 4.23 | Client's coach content | Check-ins are only reachable through More › Splits › From your coach (like the program, 4.15) | — | fixed (4927772) |
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
| 5.7 | Suggestions | The admin account shows in "People you might know" | — | fixed (7da5378) |
| 5.8 | Push notifications | None: a like is only seen after opening LogIt | — (Martin wants push; FCM) | open |
| 5.9 | Follow, request, accept, like, comment, mention | Each notified the right person once, opened the right place | — | ok |
| 5.10 | Comment menu (press and hold) and every sheet or dialog opened from a page | Drawn under the bottom bar: "Delete comment" hidden, "Edit comment" half covered (the page was its own layer all the time, for the page-change animation) | The page is named for the animation only while it runs | fixed (3d4716f) |
| 5.11 | Blocking | The blocked person could still comment and like; their earlier comments, likes and notifications stayed (blocks only hid profiles and posts) | A block counts both ways wherever "can see" is checked; blocking removes their likes and comments on your posts and the notifications between you (as on Instagram) | fixed (3d4716f) |
| 5.12 | Your own post | You can only report a comment on it, not remove it | — | fixed (7da5378) |
| 5.13 | Reported post deleted by the admin | Others see "This post isn't available" with a "Try again" button that can't help; the admin's Delete has no confirmation | — | fixed (7da5378) |
| 5.14 | Photo posts | Don't exist (text plus an attached workout, PR, split, …), but the Play data-safety notes say "photos in posts" | — | on hold: photos may come to posts and messages (Martin, 2026-11-23) |
| 5.15 | Session ends while the app is open | Every request is refused (401) every minute and nothing on screen changes until a restart | — | open |
| 5.16 | Replies, editing, reposts, quotes, report → admin delete, account deletion, Discover | Worked: right notifications, counts after reload, everything of a deleted account gone | — | ok |
| 5.17 | The 2026-09-04 phone findings | Pull to refresh wired, badge now live (5.1/5.2), Sync now hidden where it can't work, the misleading dot gone, Coaching label clear | — | ok |
| 5.18 | "People you might know" | Someone who follows you showed a plain "Follow" there too | "Follow back" (requested accounts are left out of suggestions, as they should be) | fixed (3d4716f) |

## Round 6 — P11 coach payments with Stripe (test mode), T7 package change (2026-11-22, 9c26b01)

Stripe sandbox ("LogIt sandbox"), the Stripe CLI forwarding Connect events to a local hosted API,
coach Dana (web dashboard) and client Sam (web pay page + phone). Stripe's own onboarding asks for
an hCaptcha, which isn't solved by automation: Dana was linked to a sandbox account that finished
onboarding on 2026-11-16.

| # | Found | What it did to the user | Fix | Status |
|---|---|---|---|---|
| 6.1 | Stripe sends invoice.paid and checkout.session.completed within a second, and the client's return to the link page confirms the same checkout | Two of the three requests failed on a unique key (the relationship, the receipt) and answered 500; Stripe retried, so it came right, but it's a crash on the money path | The paying and invoice-paid handlers run once more after a duplicate-key clash and take the "already done" path | fixed (9c26b01) |
| 6.2 | Coach's Today page | "Needs you: Nothing waiting" while Payments says "Sam's payment didn't go through… Needs you" | — | fixed (533903f) |
| 6.3 | Client after a failed card | Only My coach says so (and the email); Home and notifications say nothing | — | fixed (5ec0028) |
| 6.4 | Subscription cancelled before its paid-up date (coach cancels in Stripe) | Coaching pauses 7 days from now although the client paid to 22 Dec | — (should it count from the paid-up date? depends on refunds) | fixed (5ec0028) |
| 6.5 | Package, invite link with a price, pay page, Stripe Checkout (4242), webhooks, receipts, declined card (both sides told, rule date shown), the fix link → Stripe's card page, paying again, "Stop paying at the end of the month" (Stripe agrees), the plan ending, switching to paid elsewhere | Worked | — | ok |

## Round 7 — P2/P6 one account on two phones and the web (2026-11-22, fc13828)

Pro account "Kai" signed in on phone A, phone B and the web dashboard; hosted-mode API; "Sync now"
between steps.

| # | Found | What it did to the user | Fix | Status |
|---|---|---|---|---|
| 7.1 | A set corrected on phone B (4 → 6 reps) | Never reached phone A or the web, and was then overwritten on the server: "Sync now" on A re-sends every session and the server kept the latest push, and a pull skipped any session the phone already had. Edits to past workouts were lost between devices | Sessions carry when they last changed (finishing, editing, merging stamp it); the server keeps the newer copy (a push with no time, from an older app, still wins); a pull takes a newer copy of a session it already has | fixed (fc13828) |
| 7.2 | Session name | Both phones call it "Push" (from the muscles), the web "Bench Press" (from the exercises) | — | fixed (533903f) |
| 7.3 | New workout, habit created and ticked on the other phone, kg → lb, deleting a workout | Reached the other phone and the web | — | ok |

## Round 8 — P7 life happens (2026-11-22, e23faf8)

"Lee" onboards on Monday 2 Nov (fake clock, Dublin), trains Mon and Wed, then: a 3-week break, new
training days, a late workout in Dublin opened in Tokyo, an account, a new phone, deleting the
account with a second phone still signed in.

| # | Found | What it did to the user | Fix | Status |
|---|---|---|---|---|
| 8.1 | Delete account: the password box | Placeholder only, no label: a screen reader announces an unnamed field | Labelled | fixed (e23faf8) |
| 8.2 | Second phone still signed in to a deleted account | Says "Backed up · synced just now" after a sync that can't have worked, until a restart; then "Not signed in", local copy kept | — (same gap as 5.15: the app doesn't notice a session ending while open) | open |
| 8.3 | Week strip chips | "Fu A", "Fu B", "Fu C" for Full Body A/B/C | — | fixed (ab4e654) |
| 8.4 | Move to another server | Only in the Android app; not testable in a browser | — test in the emulator round | open |
| 8.5 | 3 weeks off; new days (Mon/Wed/Fri → Tue/Thu/Sat); a 23:30 Dublin workout opened in Tokyo; making an account keeps offline training; a new phone gets plan, workouts and progression back; deleting the account removes it and its data from the server and that phone | Worked: no guilt after the break, the estimate 5% lower after 3+ weeks so the plan holds rather than rises, the week strip follows the new days, the Tokyo week counts the workout once ("today, done"), the app shows the server's username rule | — | ok |

## Round 9 — P5 just tracks, offline; backup and restore; T3 (2026-11-22, d454de3)

"Tom", 2+ years, no account and no network (every request off the phone refused), suggestions
off, unplanned workouts, a custom exercise, then a backup file restored on a new phone.

| # | Found | What it did to the user | Fix | Status |
|---|---|---|---|---|
| 9.1 | New phone, no account: onboarding's "Import my history" with a LogIt backup file | "This file doesn't look like a workout log": the only import on the way in refused LogIt's own backup | A LogIt backup chosen there is restored whole (workouts, plan, settings, own exercises) and onboarding ends on Home | fixed (d454de3) |
| 9.2 | Right after a restore | Home showed no plan and old data until the app restarted; Settings said "You may need to reload the app" (the Android app has no reload) | Both restore paths start the app again on the restored data | fixed (d454de3) |
| 9.3 | Workout tour | "Tap a set's number for its options" — a set's number only moves it now; options are behind a swipe | "Swipe a set left to edit or delete it, and hold its number to move it." | fixed (d454de3) |
| 9.4 | Import screen | "Strong and Hevy are next", though both import already | "Export files from Strong and Hevy go straight in, and so does a LogIt backup file." | fixed (d454de3) |
| 9.5 | Welcome screen | No "restore a backup" for someone without an account (only "Get started" / "I already have an account"); 9.1 covers it for experienced lifters only | — | fixed (ab4e654) |
| 9.6 | Exercise card | Header "Last time 20 × 12" (kg × reps), set rows "12 × 20" (reps × kg) | — | fixed (fae2566) |
| 9.7 | Workout summary for bodyweight PR | "Pull-Up · 10 reps @ 0 kg · ≈0 kg 1RM" | — | fixed (fae2566) |
| 9.8 | Home after unplanned workouts | "Monday's workout moved to today · Start Full Body A", Quick start "Start Day 3 — Full Body C" and Today "Rest day" at once | — (same family as 1.15) | fixed (38e5ec7) |
| 9.9 | Offline onboarding and logging, a new exercise, suggestions off (kept through the restore), the backup's contents, T3: suggestions on after unplanned weeks plan from that history (+2.5 kg, "aim 7, 6, 5") | Worked | — | ok |

## Round 10 — T1, T2, T4, T6: users who change over time (2026-11-22)

T2 as a simulation of LogIt Adaptive over 26 weeks (a lifter whose real strength grows fast, then
slowly, then stops; three kinds of lifter: ticks the plan and never answers "reps left", answers,
goes to failure). T1 in the app: a P0 shopper (Stay fit, just starting, full gym) signs up on a
Thursday and trains Mon/Wed/Fri for three weeks without ever answering "reps left". T4: "Lou"
(Pro) trains on her own plan, is invited by coach "Dana", trains Dana's program, stops coaching.
T6: "Ray" (Pro) trains, gets Studio, coaches Lou, on the phone and the web dashboard.

| # | Found | What it did to the user | Fix | Status |
|---|---|---|---|---|
| 10.1 | T2: someone who ticks every set as planned and never answers "How many more could you have done?" | The same weight for good: squat 20 kg × 8 for 26 weeks while their real 1-rep max went 40 → 57 kg (the plan assumed every set was to failure) | A set ticked just as planned last time, with no answer, counts as 1 rep left (last time only, so a missed session plans from what was done). "Why?" says "20 × 8 as planned (counted as 1 more in the tank)" | fixed |
| 10.2 | T2: once strength stops growing | The plan keeps asking for about a rep more than they make (it plans from the best of the last 4 sessions), with no deload and nothing saying they've stalled; rep ranges stay the beginner defaults for good | — (deloads / "you've stalled" are a product feature) | fixed (e145971) |
| 10.3 | T1: sign-up on a Thursday, plan Mon/Wed/Fri | Home: "1 of 3 done. Finish all 3 for your first week on the streak" (Thu, Fri and Sat in a row); first-workout screen "Workout 1 of 3"; on Saturday "Wednesday's workout moved to today", a day before they joined. A Tuesday start on Mon/Tue/Thu/Fri was asked for 4 days in a row | The first week asks only for workouts that land today or on the plan's own days ("1 of 2 done. Your first full week starts Monday"); a workout whose day came before the plan started is never called moved | fixed |
| 10.4 | T4: an account that never finished setup signs in from the welcome screen | Lands back on the same welcome screen ("Get started / I already have an account") | Signing in from there carries on at "What do you want from training?" | fixed |
| 10.5 | T4: coach invites someone by username | Nothing tells them: no notification, the invite only shows on Settings › Coaching | Notification "Dana wants to coach you", opening the Coaching page (web: My coach) | fixed |
| 10.6 | T4: coach assigns a program | Nothing tells the client it came; it's only in More › Splits | Notification "Dana sent you a program", opening Splits (web: My coach); once per assignment, not per edit | fixed |
| 10.7 | T4: a client who had her own plan | Home keeps her own plan (first-week card, "Start Day 3 — Full Body C"); the coach's program is never offered there (4.15 from a solo lifter's side) | — | fixed (4927772) |
| 10.8 | T4: right after stopping coaching | The Coaching page shows only "Coach your own clients — Studio is bought in the LogIt Android app"; no way to find or join another coach there | — | fixed (533903f) |
| 10.9 | T1: three weeks after the fix, account prompts, food card, streak, PRs | Plans move (squat 20 × 8 → 20 × 12 → 22.5 × 8, pulldown 25 → 27.5 kg); two gentle "Save to a free account" prompts (after workouts 1 and 2); the food card can be dismissed; streak counts whole weeks only; PR notifications right | — | ok |
| 10.10 | T4: Dana's program day, stopping, the server | Program workout planned and logged (Squat 4 × 5 @ 50); Lou's own plan follows it (shared lift history); stopping removes the program, keeps her plan active and all three workouts (the program one named "Heavy · Dana's 4-week strength"); Dana gets 404 for her data and an empty roster | — | ok |
| 10.11 | T6: a lifter given Studio | More gets Clients, Messages, Library; Coaching says "Invite your first client"; web "Welcome to Studio"; his own plan, sessions and progress stay apart from the coaching space; Lou listed with "Own plan" | — | ok |

Not checked this round: how the app performs with months of real history on screen (Progress,
Insights) — T2 was simulated in the progression engine only.

From round 11 on (Martin, 2026-11-22): test first, fix later. Findings are logged with a size —
**easy** (small, clear fix), **bigger** (real work), **decision** (needs Martin) — and fixed after
all rounds, once the decisions are made.

## Round 11 — P14 operator, P13 self-hoster (2026-11-22)

Admin "r10admin" (a Free account) on the hosted API with a reported post, a crash and a sent log;
then a fresh self-hosted, invite-only server: "Sam" sets it up from the dashboard with the admin
key and invites "Kim", who joins from a fresh phone.

| # | Found | What it did to the user | Size | Status |
|---|---|---|---|---|
| 11.1 | Admin with a Free account signs in to the dashboard | Lands on "Your training starts on your phone / What Pro adds"; nothing links to the admin console (only typing /admin) | easy | fixed (533903f) |
| 11.2 | Dashboard sign-up opened while the server is still starting (right after `docker compose up`) | The page asks the server once; when that fails it never asks again: no admin-key field on a fresh server, and after a try it says "invite-only, enter the invite code" — the admin key is refused there. A reload fixes it | easy | fixed (533903f) |
| 11.3 | Dashboard sign-up hint | "Letters, numbers, dots and underscores", but dots are refused ("3–30 letters, numbers or underscores", 5.6); the phone's hint is right | easy | fixed (533903f) |
| 11.4 | Admin's invite message | "Go to Settings › Account, tap 'Connect to a different server'": a fresh install can't reach Settings and no such button exists; the way is "I already have an account" › Server › My own server | easy | fixed (533903f) |
| 11.5 | Self-hosted wording | Dashboard sidebar says "Free · Account" for everyone on a self-hosted server; phone Settings "manage clients on a Studio plan" and "Scan the code on app.getlogit.app" (should be this server's dashboard) | easy | fixed (533903f) |
| 11.6 | Self-hosted dashboard login | "Compare plans" links to getlogit.app pricing, which don't apply there | easy | fixed (533903f) |
| 11.7 | Admin: people, temporary password (old one refused, new one works), sign-out, plan given by hand, reports, diagnostics, subscriptions, growth, server page, invites (made, sent, used, shown as used); self-hosted setup with the admin key, server picker ("Invite-only" shown), invite sign-up, "Own server · Everything included", sync and dashboard without Pro | Worked | — | ok |
| 11.8 | Two people on one phone (Accounts on this phone) | Android only (the web build sends you to Settings) | — | to the emulator round |

## Round 12 — T5 Free → Pro → Free (2026-11-22)

"Fay" on two phones (browsers sending a phone id like the Android app) and the web dashboard;
plans given and taken away by the admin.

| # | Found | What it did to the user | Size | Status |
|---|---|---|---|---|
| 12.1 | Free, signs in on a second phone | The free backup moves to that phone. The first phone says so in Settings only ("Your free backup is on another phone…"); Home says nothing, and workouts logged there from then on are on that phone only | decision (where to tell them) | fixed (850aa5f) |
| 12.2 | The phone that lost the free backup | Sends all 18 sync requests on every sync and every one is refused (36 per "Sync now") | easy (stop after "backup on another phone" until sign-in or Pro) | fixed (8082c54) |
| 12.3 | Second phone signs in on the day the plan was made (a Sunday) | "Full Body B and Full Body C won't fit this week. Next week starts fresh." about days before she joined (the plan's start date isn't on that phone) | easy (leave out pre-start workouts) | fixed (8082c54) |
| 12.4 | Pro → Free with two phones | The phone that signed in last keeps the backup, not the one she trains on | decision | fixed (850aa5f) |
| 12.5 | Pro given: both phones sync, a workout on A reaches B and the web; Pro taken away: data kept on the server and both phones, web dashboard drops to the upgrade page honestly | Worked | — | ok |

## Round 13 — P6 uses everything (2026-11-22)

"Kim" on the self-hosted server (everything included): every feature screen walked for errors and
accessibility, then nutrition (goal, search, log, weight), a habit, a lift goal, a plugin pack,
an unplanned workout with a run and push-ups, all checked again on the web dashboard.

| # | Found | What it did to the user | Size | Status |
|---|---|---|---|---|
| 13.1 | Run distance "3" (box says "km / m") | Saved as **3 m**; only "3.0" means km, and "5,2" becomes 5 m | easy | fixed (c8a069a) |
| 13.2 | Run duration | The box opens the number keypad, which on Android has no ":"; a plain number counts as seconds, so "20" is 20 seconds and "2000" is 33:20 | easy (plain number = minutes, 4 digits = mm:ss) | fixed (c8a069a) |
| 13.3 | Adding an exercise or a cardio block during a workout | It arrives collapsed ("Push-Up 0 of 3"; "Running" with nothing to fill in): one more tap before anything can be logged, and a cardio block also needs "+ Add first interval" | easy | fixed (fae2566) |
| 13.4 | Bodyweight exercise, first time | "First time? Pick a weight you could lift about 8 times" for push-ups | easy | fixed (fae2566) |
| 13.5 | Home › Recent sessions | "Top: Push-Up 15×0" (bodyweight shown as 0; same family as 9.7) | easy | fixed (fae2566) |
| 13.6 | Nutrition with height saved but no birth date | "Add height & birth date" | easy | fixed (a579c56) |
| 13.7 | Fields with no label for screen readers | Nutrition goal (trend window, max adjustment), Settings (rest timer seconds ×3), New goal (exercise), Browse plugins (search), Clients (username), run Duration/Distance (placeholder only) | easy | fixed (a579c56) |
| 13.8 | Profile | An icon button (chevron) with no name; "Sign out" 28 px tall | easy | fixed (a579c56) |
| 13.9 | Browse plugins | "turn them on" and "import page" are 16 px text inside a sentence, not buttons (against "actions are buttons") | easy | fixed (a579c56) |
| 13.10 | Chips and segment buttons on most screens (Insights ranges, Exercises tabs, Settings units/theme, Social tabs, nutrition goal, Home "Edit split" 28 px) | 28–37 px tall, under the 44 px touch size | decision (design system) | fixed (1f35733) |
| 13.11 | Sample plugins | "by Logit Samples" (should be LogIt) | easy | fixed (a579c56) |
| 13.13 | Mobility drill, first time | "Last → next: 20s L · 20s R" when there is no last time; its two "±kg" boxes have no labels; the drill also arrives collapsed (13.3) | easy | fixed (fae2566) |
| 13.12 | Every feature screen (31) loads with no errors; nutrition goal → 2,070 kcal, food search (through the server, nothing sent elsewhere from the phone), 50 g oats logged, weight, habit, lift goal with projection, plugin pack install asks first; food, weight, habit and goal all on the web dashboard | Worked | — | ok |

Supersets: round 14. Not covered: music bar (Android, needs a music app), sounds.

## Round 14 — P3 experienced lifter (2026-11-22)

"Pat", 2+ years, self-hosted server: best lifts, Train your way, warm-up ramp, a superset, a
rotation split.

| # | Found | What it did to the user | Size | Status |
|---|---|---|---|---|
| 14.1 | Warm-up ramp added | Working sets are numbered 5, 6, 7 after four warm-ups (W W W W 5 6 7), while the plan above says sets 1–3 | easy | fixed (fae2566) |
| 14.2 | Superset of Bench (with warm-ups) and Barbell Row | Warm-ups count as superset rounds: round 1 pairs the 20 kg × 10 warm-up with the row's first working set; "Round 1 of 7", "0 of 10" | bigger | open |
| 14.3 | Day one from best lifts (bench 100 × 5) | Plans 100 × 5, 100 × 4, 100 × 3: the best recent 5-rep set as set one, every set to failure in the first workout | decision | fixed (e145971) |
| 14.4 | Home for a rotation split | "Day 1 — Upper A · Scheduled" (nothing is scheduled in a rotation) | easy | fixed (fae2566) |
| 14.5 | Home Progression card after best lifts | "Finish a session and pick an algorithm in Settings" (same as 4.11) | decision (with 4.11) | fixed (e145971) |
| 14.6 | Best lifts (live max estimate), Train your way (Adaptive / 5/3/1 / Linear / Build my own), warm-up ramp weights (20 × 10, 40 × 5, 60 × 3, 80 × 2 before 100), superset/circuit sheet, switching a split to "In order" | Worked | — | ok |

## Round 15 — conditions: dark mode, large text, server unreachable (2026-11-22)

| # | Found | What it did to the user | Size | Status |
|---|---|---|---|---|
| 15.1 | Server unreachable, a weight just logged | Settings says "Backed up · synced just now" and there's no Sync now; the change reached the server only once it was back (it did) — same gap as 5.15/8.2: the status shows the last good sync, not that changes are waiting | easy (say "1 change waiting" / "Can't reach the server") | fixed (8082c54) |
| 15.2 | Dark mode (Home, Nutrition, Sessions, Settings), text at 130 % (Home, Nutrition), food search with the server unreachable (results still come), weight logged offline reaching the server later | Worked: readable, nothing cut off or overflowing | — | ok |

## Round 16 — T2 in the app: two years of history (2026-11-22)

A phone with no account restores a generated backup of 312 workouts (2 years, 5 exercises × 4
sets) from onboarding's Import my history, offline. Timed on a desktop browser (a phone is slower).

| # | Found | What it did to the user | Size | Status |
|---|---|---|---|---|
| 16.1 | Web app storage | Everything lives in localStorage: 312 workouts take 1 MB of the ~5 MB browsers allow, so a web-only lifter fills it after roughly 1,500 workouts (fewer with notes or more sets) and saving would start failing. The Android app uses SQLite and isn't affected | bigger (IndexedDB for the web) / decision (is the web app a real place to train?) | fixed (91d0cda) |
| 16.2 | Progress screen with 2 years | Longest main-thread block 0.3 s on a desktop CPU (could be ~1 s on a mid phone); other screens 0.05–0.23 s | — (watch on the emulator) | open |
| 16.3 | Restore (≈6 s), Home, Sessions ("104-week streak"), Progress, Insights ("1 moving, 6 stuck"), weekly sets, an exercise ("Plateaued: no new best in 55 sessions"), Profile: each 1.2–2.2 s to content | Worked | — | ok |

## Round 17 — Android emulator (2026-11-22)

A test build (crash reports on) on the lab emulator (Android 16), against a local hosted server and
a local self-hosted one; driven over the WebView's DevTools connection and real screen taps.

| # | Found | What it did to the user | Size | Status |
|---|---|---|---|---|
| 17.1 | Rest alerts with the app in the background | No "Rest complete" notification after 100 s: notification permission was never asked (Lou signed in instead of going through the reminders step), and the app only asks when it schedules the alert, which happens as it goes to the background, where Android can't show the question. Anyone who didn't allow notifications earlier never gets rest alerts | easy (ask at the first rest, in the foreground, like the exact-alarm question) | fixed (c8a069a) |
| 17.2 | Accounts on this phone | Every account shows "No name yet @lou_r10", though the server has her name (Lou) | easy | fixed (533903f) |
| 17.3 | After moving to her own server | "Your Pro plan is still running… Cancel it in Google Play" for a Pro plan the admin gave her (nothing to cancel there) | easy | fixed (533903f) |
| 17.4 | Lou's first sign-in on the phone | Home showed only Quick start and Goals (no plan, no workouts, no "Getting your training…" note) until the app was reloaded; Fay's sign-in later showed the loading note and filled in by itself. Seen once | — (watch) | open |
| 17.5 | Share a Strong CSV into LogIt | "LogIt couldn't read that file", but the test shared it from the shell, which can't grant file access the way a Files app does | — (check on a real phone) | not tested |
| 17.6 | Signing in pulls plan and workouts into the phone's database; a second account added and switched to (no password, data kept apart); Move to another server (checks the address, sees "Invite only", asks for the code, copies 4 workouts, the split, nutrition, habits, settings; the server has them); crash reports from a test build arrive anonymously within a second with the log before them, and stay off on a self-hosted server | Worked | — | ok |

Not testable here: Play Billing purchases (no Play on the emulator image), push notifications (not
built), the music bar (needs a music app), sounds.

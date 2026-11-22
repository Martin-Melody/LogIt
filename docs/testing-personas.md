# Testing by persona

Bug hunts drive the real apps the way one kind of user would, through a faked stretch of time
(Playwright `page.clock`, a phone-sized window, throwaway local APIs). Every bug becomes a test, then
a fix; one PR per round.

Setup: API on 127.0.0.1:5118 (SQLite, self-hosted mode: everything unlocked), app built with
`VITE_API_URL=http://127.0.0.1:5118`. Anything plan-gated (Free / Pro / Studio, trials, coached) runs on
the journey APIs (`scripts/journey-apis.sh`, tiers set through the admin API). Stripe packages need a
Stripe test-mode key. Android-only behaviour gets a pass on the emulator (see the emulator notes).

## 1. What makes users different

Every persona below takes a value from each row; together they cover every value at least once.
P0 adds the decision before any of this: someone deciding whether to keep the app at all.

| Dimension | Values |
|---|---|
| Role | lifter · coach who trains · coach who doesn't · client of a coach · admin/operator |
| Account | none (offline) · Free · Pro (trial / paid / expired) · Studio · coached (Free but synced by coaching) · self-hosted server |
| Where | Android app · web app · web dashboard · two devices · several accounts on one phone |
| Experience | just starting · under 2 years · 2+ years · competes |
| Goal | stronger · muscle · both · stay fit · lose fat |
| Starting point | fresh · best lifts · Strong import · Hevy import · coach program · built-in program |
| What sets the weights | Adaptive · 5/3/1 · Linear · built-my-own · none (suggestions off) |
| Schedule | weekday plan from onboarding · rotation split · coach program · no plan |
| Setup | kg / lb · full gym / home / dumbbells · places and machines |
| Features used | workouts only · nutrition · habits · goals · insights · social · plugins (use / build) · music · mobility / cardio |
| Client package | free invite (code / link) · paid elsewhere · Stripe: paid, failed (keep / pause / end), fixed, stopped |
| Life events | missed days · a break (pause) · changes days or split · new phone · moves server · signs out · deletes account · switches coach |
| Conditions | offline / flaky network · dark mode · large text · travel (time zone) |

## 2. Personas

| | Persona | Account · where | Key journey | Status |
|---|---|---|---|---|
| P0 | App-store shopper | none · Android, fresh install | beginner comparing a few free apps; judges in the first 5–10 minutes: is it clear what to do, a workout fast, never too much at once, no paywall surprise; most likely to uninstall | day 1–2 done (round 3): back-off sets, set counts, first-week count, warm-up tap fixed; wording/tours to mock up |
| P1 | Newcomer losing fat | none → Free · Android | just starting, home dumbbells, 4 weeks, nutrition prompt after workout 2, habits after week 1, makes an account | 28 days done (round 2) |
| P2 | Steady lifter | Free → Pro trial · web app + phone | under 2 yrs, best lifts in **lb**, Free account (what does it keep?), trial, sync two devices | best lifts done (round 1) |
| P3 | Experienced lifter | Pro · Android | 2+ yrs, Strong import, 5/3/1, rotation split, places/machines, warm-ups, supersets, RPE, PRs, insights, weekly sets | Strong import done (round 2) |
| P4 | Competitor | Pro · Android + dashboard | competes, Hevy import, built-my-own algorithm, DOTS, total goal, plan edited on the computer | Hevy import done (round 2) |
| P5 | Just tracks | none · Android, offline | no plan, suggestions off, unplanned workouts, custom exercises, edit history, export / backup / restore | started (round 2) |
| P6 | Uses everything | Pro · two phones + dashboard | nutrition (search, custom, recipes, plan, weight), habits, goals, social, plugins (install + build), music, mobility, cardio, circuits, home/nav customising, sounds | |
| P7 | Life happens | Pro → paused · Android | a 3-week break, changes days, switches to a built-in program, travels across time zones, new phone, moves to a self-hosted server, deletes the account | |
| P8 | Coach who trains | Studio · phone + dashboard | "I coach people", sample clients, library, programs, check-in templates, habits, nutrition plans, links (free / paid elsewhere / Stripe), payments setup, roster, messages, own training | |
| P9 | Coach who stops | Studio → Pro · dashboard | doesn't train; downgrades with clients attached (read-only), comes back | |
| P10 | Client, free invite | Free (coached) · phone + web | "I have a coach", code and link, program on the phone, check-ins, messages, nutrition plan, assigned habits, leaves the coach (what stays?) | |
| P11 | Client, paid package | Free (coached) · phone + pay page | paid elsewhere; Stripe paid → failed → coach's rule → /pay/fix → stops paying; switches coach; client who had their own split first | |
| P12 | Social regular | Pro · phone + web | follows, posts, comments, replies, discover, privacy settings, followers lists, reports a post | plan: `docs/testing-social.md` (cast, every notification, S1–S9) |
| P13 | Shared phone / self-hoster | several accounts · own server | two people on one phone, offline profile + account, own server with everything on | covered by account journeys; light pass |
| P14 | Operator | admin · dashboard | admin console: people, subscriptions, invites, reports, plugins review, diagnostics | |

Later, not catered for yet: **P15 group-class PT**, one coach running about 10 clients through the same
workout for an hour, in person at their studio. Needs something like a class mode (one live workout,
many people); kept here so it isn't forgotten.

## Transitions

Users change type over time; these are tested as journeys of their own (not every pairing, only the
ones that happen):

| | From → to | What could break |
|---|---|---|
| T1 | P0 shopper → P1 sticks with it | first-week promises vs what the app does in week 2 |
| T2 | P1 beginner → experienced after months | does the plan grow with them (rep ranges, style, deloads) |
| T3 | P5 tracker → wants guidance | turning suggestions on with months of unplanned history |
| T4 | solo lifter → client → leaves the coach | whose plan wins, what stays on the phone and the server |
| T5 | Free → Pro → Free | what syncs, what's kept, honest prompts |
| T6 | lifter → starts coaching (Studio) | own training and clients side by side |
| T7 | coach changes a client's package | free ↔ paid elsewhere ↔ Stripe, mid-cycle |

## 3. Every screen and who covers it

Home `/` in both apps: every persona.

Phone app
- Onboarding `/onboarding` `/first-workout` `/week-done`: P1, P2, P3, P4, P5 · `/onboarding/coach`: P8 · `/onboarding/coaching`: P10
- Training `/session/plan` `/session/current` `/sessions` `/sessions/[id]` `/splits/**` `/plans` `/programs/**`: P1, P3, P4, P5, P7
- Exercises `/exercises/**`, places `/settings/places/**`: P3, P5
- Progress `/progress/**` `/insights/**`: P3, P4, P6
- Progression settings `/settings/progression/**` `/settings/mobility-progression/**` `/settings/muscle-group-insight/**`: P4, P5, P6
- Nutrition `/nutrition/**`: P1, P6, P10
- Habits `/habits/**`: P1, P6, P10
- Social `/social/**`, `/inbox`: P12, P6
- Plugins `/plugins/**`: P6
- Coaching on the phone `/clients/**`: P8 · `/checkins/**` `/messages/**`: P10, P11
- Account `/auth` `/accounts` `/settings/move-server`: P2, P7, P13 · `/settings/import`: P3, P4
- Settings `/settings` `/settings/music` `/settings/sounds` `/settings/navbar` `/settings/walkthroughs` `/settings/computer` `/settings/diagnostics`, `/home/customize` `/profile/**`: P6, P7

Web dashboard
- `/welcome` `/login` `/forgot-password` `/reset-password` `/upgrade` `/account`: P2, P9, P4
- Own training `/plan/**` `/sessions` `/progress` `/insights/**` `/exercises/[id]` `/library`: P4, P6
- `/nutrition/**` `/habits`: P6 · `/social/**`: P12 · `/plugins/**` (builder, link): P6
- Coach `/coaching/**` `/clients/**` `/roster` `/messages`: P8, P9
- Client `/c/[code]` `/my-coach/**` `/pay/fix/[token]`: P10, P11
- Admin `/admin/**`: P14

## 4. Each round checks

- the journey works end to end, on the faked days it would happen
- what one device does shows up right on the other (P2, P6, P10)
- nothing blank, scary, untrue or impossible on screen (wording counts)
- gated things say why and offer the honest next step; nothing is deleted on a downgrade
- console errors and failed requests

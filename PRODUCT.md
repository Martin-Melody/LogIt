# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Ships as an Android app first via Capacitor (iOS later), plus a web dashboard at app.getlogit.app and a marketing site at getlogit.app. Every surface renders LogIt's own web look (DESIGN.md), not Material or iOS controls; phone conventions still apply (Android back, bottom sheets, 44px targets).

## Users

- **Lifters** logging workouts in the gym on their phone: beginners through experienced lifters and powerlifters. In the gym, between sets, one hand, often with music playing.
- **Coaches** (Studio plan) who build programs on a computer and follow clients from the phone or the web dashboard.
- **Clients** invited by a coach.
- **Self-hosters** who run their own Logit server (Docker: API + web dashboard): someone hosting for themselves and friends or family, a gym or coach hosting their members, and homelabbers who care about server health.
- **The operator of getlogit.app** (Martin): runs the hosted service for paying users on one shared server.

## Product Purpose

A workout app that works out your next weight, makes logging fast and shows your progress, with nutrition, habits, coaching, social and plugins around it. Success: people keep training with it week after week (habit, not just activation).

## Positioning

A great workout app first. Privacy and making it your own come second: you can self-host the whole thing for free (Bitwarden-style: self-host free, or pay Logit to host it), and extend it with plugins. Not pitched at developers.

## Operating Context

- Hosted: one multi-tenant deployment (Hetzner VPS, Caddy, API, Postgres, web dashboard). Paid plans Free / Pro / Studio, bought in the Android app through Google Play Billing; website checkout is off.
- Self-hosted: same Docker images, SQLite by default, `ADMIN_KEY` and `JWT_SECRET` in `.env`. Every feature is unlocked; no plans or billing.
- Registration is open or invite-only per server; invites carry a note, uses and an expiry.
- Users can send diagnostics reports to the hosted service only; self-hosted logs never leave the device.
- Social feed has reports and blocks; public plugins go through a review queue before listing.

## Capabilities and Constraints

- Offline-first phone app that syncs to whichever server the account lives on; accounts can move between servers.
- Plugins run sandboxed; publishing needs Pro.
- No product analytics yet; any funnel measurement must be privacy-first (anonymous counts, opt-in, own server).
- Undecided: whether Free users get a cloud backup.

## Brand Commitments

- Name: Logit (written LogIt in some marketing copy). Domain getlogit.app; Android app id `ie.logit.app`.
- One shared look for the app, web dashboard and website: `packages/ui/src/theme.css` (dark-first, Inter, 10px radius). Surfaces use these tokens rather than their own colours.
- Serious and private in tone: no mascot, no XP/leagues, no guilt. Copy never states the obvious and makes no claims without data.

## Evidence on Hand

- Real app screens can be captured from the dev server with seeded sample data; no real user testimonials, customer counts or benchmarks exist. Do not invent them.

## Product Principles

1. Fast path to value: the next useful thing is one tap away.
2. Progressive disclosure: features appear when they become useful, not up front.
3. It's yours: self-hostable, exportable, extensible, nothing leaves the device unless the user sends it.
4. Habit over activation: design for week two, not day one.
5. Every action is a real button, everything that changes animates, every sheet swipes down, back goes to the previous screen.
6. LogIt only taps you on the shoulder when a person did something for you, or when your own plan says it's time. Notifications (push or in the app) are for a message, a coach's program or check-in, a payment problem, a comment, like or follow, a reminder you set, or a rest ending. Never "you haven't trained in 3 days", streak warnings, "come back", offers, or anything sent only to get the app opened. A push says who and what, never the message itself.
7. Our own components over the browser's or Android's: on/off is `Switch`, pick one is `RadioGroup`, segments or chips (`choice.ts`), a list to choose from is `Select`, times are `TimeField`, dates `DateField` (all in `components/ui`). Never a native `<select>` (Android draws it as a radio-button dialog), `<input type="time">`, `<input type="date">`, checkbox or radio. If a needed control is missing, add it to `components/ui` (bits-ui, shadcn-svelte style) rather than using the native one. Native is only for what has no stand-in (text and number fields, file pickers).

## Design Lessons

What earlier rounds taught us, so new designs start closer to LogIt. The visual rules themselves live in DESIGN.md.

- **The test for any mockup: could this screen belong to another workout app?** If yes, it isn't done. The 2026-11-21 Home + Workout mockups were rejected on exactly this ("looked like another app"), even though their structure ideas were approved.
- **Mock up from the real app, not from memory.** Start from screenshots of the current screens (seeded sample data) and the real components, then change only what the brief asks. Hand-drawn HTML with approximate colours drifts into generic fitness-app styling.
- **Show "now" next to "proposed"** so the change is visible, and say which parts are structure and which are look.
- **Cover the whole flow.** A workout mockup shows every block kind (strength, superset, circuit, cardio, mobility, plugin blocks) and every sheet reachable from it, not just the happy path for one barbell lift.
- **What makes LogIt look like LogIt** (details in DESIGN.md): the workout is a log, with full-width sections and a column grid, not a stack of cards; last time sits beside this time; planned numbers are blue until you type over them; the primary is pale grey with no brand accent; colour only means plan, done, record or delete.
- **Reuse the app's own patterns before inventing one.** The 2026-11-21 mockups felt foreign because they brought in patterns used nowhere else in LogIt (exercises as separate cards, a progress-bar header, a docked action bar, "Up next" badges, hint boxes) instead of the app's full-width sections, tags with a one-line reason, ⋯ menus and bottom sheets. If a redesign really needs a new pattern, change it app-wide (theme or shared component) so every screen gets it, not just the one being redesigned.
- **No new game mechanics.** The existing flame streak and tags are fine; XP, levels, leagues and confetti rewards are not.

## Accessibility & Inclusion

Status colours meet 4.5:1 on their tints in both themes (see theme.css). Motion respects reduced-motion.

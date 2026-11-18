# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The phone app is a SvelteKit app wrapped with Capacitor, launching on Android first (iOS later). Its design language is the app's own, not Material or iOS native. The web app (app.getlogit.app) and the marketing site (getlogit.app) share the same tokens from `packages/ui`.

## Users

- **Lifters in the gym**, phone in hand between sets: often sweaty, often in a hurry, sometimes with music playing. They're looking for their next weight and want to log a set in a tap or two. The audience runs from beginners to experienced lifters and powerlifters, and both should feel the app is for them.
- **People training at home or in more than one place**: a home rack, a hotel, a friend's gym. Their equipment changes from day to day.
- **Coaches** who program for clients, mostly from the web app, plus their **clients**, who train from the phone.

## Product Purpose

LogIt is a workout app that tells you what to lift next and makes logging it fast. It works out progression from your own history, using the machines and weights you actually have, so the suggested number is one you can select. Success means people come back each week because the app knows their training better than a notebook does.

## Positioning

A great workout app first. Privacy (your data, your server if you want one) and customising (plugins, packs, self-hosting) come second and are never the lead. LogIt is not aimed at developers.

## Operating Context

- Mid-workout use is the core scene: one hand, short glances, interrupted constantly. Nothing may block starting or logging a workout; optional features help and can always be skipped.
- Places (My gym, Home, others) hold the equipment: machines with their real weight stacks, the bar and plates, dumbbells. A workout can be tied to a place.
- Progression suggests the next weight and reps per exercise from history, rounded to what the equipment allows.

## Capabilities and Constraints

- Tiers: Free, Pro, Studio (coaching). Sync to the LogIt server or a self-hosted one; the app works offline.
- Terminology in use: workout, exercise, set, place, machine, plan/split, progression.
- Plain words over gym jargon in the UI ("reps left" is clearer than "RPE" for most people; the number can still be shown).

## Brand Commitments

- Name: LogIt. Domain: getlogit.app.
- Serious and private in tone. No mascot, no XP or leagues, no guilt-trip notifications.
- Copy shouldn't state the obvious or make claims without data behind them.
- The website uses the app's exact colours and Inter.

## Evidence on Hand

- Design canvas with approved mockups:
- Plan doc:
- No user testimonials, usage numbers or reviews yet. Don't invent any.

## Product Principles

1. The app helps and never blocks: every prompt can be skipped, and every extra feature can be turned off.
2. Show real numbers from the user's own equipment and history, never placeholders like "0".
3. One door per thing: each control opens one obvious place, and a task started mid-workout is finished without leaving the workout.
4. Read first, change second: what you need right now comes first, and settings and destructive actions come last.
5. Experienced lifters keep their speed: shortcuts stay, and they never get in a beginner's way.

## Accessibility & Inclusion

Touch targets of at least 44 px, used one-handed. Light and dark themes. Motion under 300 ms that respects reduced motion.

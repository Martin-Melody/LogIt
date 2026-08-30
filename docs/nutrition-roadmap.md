# Logit Nutrition Roadmap

Nutrition tracking for Logit — food logging, recipes, calorie/macro targets and bodyweight
goals — built for **personal use first** (a MyFitnessPal / MacroFactor style experience) and
extended into a **PT coaching tool** (coach assigns targets/plans, monitors adherence),
consistent with how programs and check-ins already flow coach→client in PT Studio.

## Why

- Nutrition is the weakest area of every major PT platform (Trainerize, Everfit, TrueCoach,
  PT Distinction) and the one they're investing in hardest — room to differentiate rather
  than catch up.
- The current UX battleground is **AI photo logging** and **adaptive (trend-based) macro
  targets** (MacroFactor). Adaptive targets are the natural nutrition analogue of Logit's
  progression algorithms.
- The personal and coached experiences share one data model: same logging engine, same food
  database, same recipe box. The coach layer only adds *assignment* and *monitoring*.

## Design constraints

- **Offline-first.** All logging, targets and adaptive recalculation work with no network.
- **Self-hostable.** No hard dependency on a paid third-party food API. The food database
  ships bundled (USDA FoodData Central — public domain; curated Open Food Facts subset —
  ODbL). An online Open Food Facts lookup is an optional fallback for barcode misses only.
- **Same architecture as the rest of the app.** `@logit/core` domain + pure functions, the
  repo-interface pattern, local SQLite / localStorage, optional cloud sync gated at Pro.

---

## Phase 1 — Personal nutrition core (mobile)

The first shippable milestone. Mobile (`logit-frontend`) only. **Implemented on
`feat/nutrition-tracking`.**

- [x] `@logit/core` nutrition domain: diary day, logged item, custom food, recipe, weight
      entry, nutrition goal
- [x] `@logit/core` pure calculations: Mifflin–St Jeor BMR → TDEE → goal-adjusted calorie
      target → macro split; weight-trend EMA smoothing + goal ETA
- [x] `@logit/core` adaptive expenditure estimate (energy-balance method over a rolling
      window; graceful fallback to the calculated TDEE when data is thin)
- [x] Bundled food database build pipeline (`scripts/build-food-db/`): USDA + curated Open
      Food Facts → single SQLite file with FTS5 search + barcode index
- [x] Local + SQLite repos; read-only food-DB repo; bundled `food.db` opened from app assets
- [x] Cloud sync: new synced entities + dual migrations + `/sync/nutrition/*` endpoints,
      Pro-gated (diary/weight/goal also allowed for actively-coached Free clients)
- [x] Mobile UI: Today (macro bars + meals), food search / manual barcode / quick-add,
      recipe editor, weight log + trend chart, goal-setup wizard
- [x] `nutrition` as a customizable nav destination (More drawer by default)

**Remaining before ship:**

- [ ] Run `scripts/build-food-db` and drop the real `food.db` into the release build
- [ ] On-device smoke test: bundled `food.db` opens + FTS works on Android;
      `/sync/nutrition/*` round-trips with a Pro token
- [ ] Camera barcode scanning (needs a native plugin — `@capacitor-mlkit/barcode-scanning`)
- [ ] Drop the `chore(api): pull in orActivelyCoached` commit when the web branch lands on main

**Goal:** a person can set a weight goal, get calorie/macro targets that adapt to their
real trend, and log food quickly — entirely offline, syncing across devices on Pro.

---

## Phase 2 — Web parity + polish

- [ ] `logit-web` personal nutrition views (read + edit)
- [ ] Weekly summary, streaks, richer trend analytics
- [ ] Favourites / recent / meal templates for fast logging
- [ ] Copy-previous-day, quick-add from history
- [ ] Nutrition home widget

---

## Phase 3 — PT / coach layer

- [ ] `NutritionPlan` domain: targets + optional structured meals, authored by a coach
- [ ] Assign coach→client (read-only client mirror — same shape as `CoachProgram` /
      `CheckinSchedule`)
- [ ] Coach dashboard: client diary, adherence %, macro-trend charts
- [ ] Meal-photo journal with coach comments (may fold into check-ins / messages)
- [ ] Client view of assigned targets + meal plan with swappable meals + grocery list
- [ ] Tier gating consistent with Studio

---

## Phase 4 — AI photo logging

- [ ] Cloud endpoint: meal photo → vision model → calorie/macro + ingredient estimate
- [ ] Bring-your-own-key or cloud-tier feature (inherently online)
- [ ] Client capture UI; coach-side review
- [ ] Confidence display + one-tap correction

---

## Phase 5 — Ecosystem & federation

- [ ] Nutrition analytics as a plugin family (see `plugin-roadmap.md`)
- [ ] Shareable recipe packs
- [ ] Export / import
- [ ] Optional contribution of user-created foods back to Open Food Facts

---

## Data & licensing notes

| Source | License | Use |
|---|---|---|
| USDA FoodData Central (Foundation + SR Legacy) | Public domain | Bundled — whole/generic foods, lab-verified |
| Open Food Facts (curated subset) | ODbL (attribution + share-alike) | Bundled — packaged products + barcodes |
| Open Food Facts API | ODbL | Optional online fallback for barcode misses |

Branded USDA data (~1.5M rows, US-centric) is deliberately excluded from the bundle. If a
self-hoster or user wants deeper coverage, an optional downloadable pack or an API key slot
can be added later without changing the core.

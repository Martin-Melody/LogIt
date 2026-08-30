# Logit Nutrition Roadmap

Nutrition tracking for Logit — food logging, recipes, calorie/macro targets and bodyweight
goals — built for **personal use first** (a MyFitnessPal / MacroFactor style experience) and
extended into a **PT coaching tool** (coach assigns targets/plans, monitors adherence),
consistent with how programs and check-ins already flow coach→client in PT Studio.

## Why

- Nutrition is the weakest area of every major PT platform (Trainerize, Everfit, TrueCoach,
  PT Distinction) and the one they're investing in hardest — room to differentiate rather
  than catch up.
- **Adaptive (trend-based) macro targets** (MacroFactor) are the natural nutrition analogue
  of Logit's progression algorithms — and, like them, pluggable.
- The personal and coached experiences share one data model: same logging engine, same food
  database, same recipe box. The coach layer only adds *assignment* and *monitoring*.

**Not doing: AI photo logging.** The other platforms lean on meal-photo → macro estimation,
but the accuracy is unproven and it needs an always-online vision model. Out of scope.

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

**Stage A — coach assigns nutrition targets (in progress, `feat/nutrition-coach-layer`):**
- [ ] `CoachNutritionPlan` domain: kcal + macro targets + a note, authored by a coach.
      Same coach→client assignment shape as `CoachProgram` (authored/template + assigned,
      read-only client mirror, tombstones, Active-relationship-gated pull).
- [ ] API: `CoachNutritionPlan` entity + dual migrations + `/coach/nutrition-plans`
      (upsert, list, assigned-pull), `RequireTier(Studio)` on the authoring side.
- [ ] core: `coachNutritionPlanApi.ts`, `data/coachNutritionPlanRepo.ts`.
- [ ] Mobile: local/sqlite mirror + `pullAndMergeCoachNutritionPlans`; an assigned plan's
      targets supersede the algorithm on `/nutrition` (badge "From your coach").
- [ ] Studio (`logit-web`): author + assign a plan from the client page.

**Stage B — coach monitors the client (in progress):**
- [ ] `createRemoteNutritionRepo(clientId)` in core (API-backed `NutritionRepo`).
- [ ] `logit-web` `/clients/[id]/nutrition`: recent diary, weight trend, adherence % and
      macro averages (reuse `getNutritionInsights` against the remote repo), current targets.

**Stage C — structured meal plans (later):** meal-by-meal foods, swaps, grocery list.

**Stage D — meal-photo journal + coach comments (later):** likely folds into check-ins /
messages rather than a new surface.

---

## Phase 4 — Ecosystem & federation

- [x] Pluggable calorie/macro target algorithm (`nutrition-algorithm` family) —
      built-in "Standard adaptive" + community plugins, schema-driven preferences,
      config on the synced goal blob
- [x] Nutrition analytics as a plugin family (`nutrition-analytics`) — built-in
      "Basic insights" + `/nutrition/insights` screen
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

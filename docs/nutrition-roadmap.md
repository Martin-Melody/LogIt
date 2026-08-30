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
      `/sync/nutrition/*` round-trips with a Pro token; the barcode scanner gets camera
      access in the Capacitor webview (zxing via `getUserMedia` — no native plugin)
- [x] Barcode scanning — `@zxing/browser` live scanner + typed/pasted barcode fallback
      (verified in the build; on-device camera unverified)
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

Built on `feat/nutrition-coach-layer` → `feat/nutrition-meal-plans`.

**Stage A — coach assigns nutrition targets** ✅
- [x] `CoachNutritionPlan` domain (kcal + macro targets + note), same coach→client
      assignment shape as `CoachProgram` (authored/template + assigned, read-only client
      mirror, tombstones, Active-relationship-gated pull).
- [x] API: entity + dual migrations + `/coach/nutrition-plans` (upsert/list/assigned-pull),
      `RequireTier(Studio)` on authoring.
- [x] core `coachNutritionPlanApi.ts` + `data/coachNutritionPlanRepo.ts`.
- [x] Mobile: sqlite/local mirror + `pullAndMergeCoachNutritionPlan`; an assigned plan's
      targets supersede the algorithm AND the manual override (`source: "coach"`, badge
      "From your coach", note shown).
- [x] Studio: set kcal/P/C/F + a note from the client page.

**Stage B — coach monitors the client** ✅
- [x] `createRemoteNutritionRepo(clientId)` — read-only `NutritionRepo` over a client's
      synced data.
- [x] `logit-web` client page: 30-day readout (avg kcal, adherence %, weight Δ, insights)
      via `getNutritionInsights` against the remote repo.

**Stage C — structured meal plans** ✅
- [x] `CoachNutritionPlan.meals[]` — meals → foods, each with coach-approved swaps.
      `groceryList`, `plannedFoodToLoggedItem`, `slotForMeal` helpers.
- [x] Client `/nutrition/plan`: per-food Log / Swap, "Log meal", grocery list.
- [x] Studio `/clients/[id]/nutrition`: meal editor with Open Food Facts search, swaps,
      grocery preview.

**Stage D — meal-photo journal + coach comments (next):**
- [ ] Client attaches a photo when logging (`@capacitor/camera`, small jpeg → data URL on
      the diary item).
- [ ] Studio client-diary view shows the photos.
- [ ] Coach comments: **can't** live on the client-owned diary row (one-directional
      isolation) — needs a coach→client feedback channel (extend `CoachMessage`, or a new
      `CoachFeedback` entity keyed to a diary date). Design call needed.

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

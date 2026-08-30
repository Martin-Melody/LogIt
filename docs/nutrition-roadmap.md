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
  ships bundled (USDA — public domain; CIQUAL — Etalab; curated Open Food Facts subset —
  ODbL). An online Open Food Facts lookup is an optional fallback for the long tail.
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
- [x] Bundled food database build pipeline (`scripts/build-food-db/`): USDA + **CIQUAL**
      (EU generic foods) + Open Food Facts → SQLite + FTS5 + barcode index. Two tiers:
      **core** (~250k EU+NA products, ships zipped in the app, ~20 MB) and **full**
      (~1M, optional download). Streams the OFF **CSV** export (~1 GB, not the 9 GB dump);
      4/4/9 energy-consistency filter; `popularity` search-rank column; dependency-free
      ZIP writer. `npm test` covers the pipeline.
- [x] Local + SQLite repos; read-only food-DB repo; bundled `food.zip` opened from app
      assets (`static/assets/databases/`, unpacked by `copyFromAssets`)
- [x] Cloud sync: new synced entities + dual migrations + `/sync/nutrition/*` endpoints,
      Pro-gated (diary/weight/goal also allowed for actively-coached Free clients)
- [x] Mobile UI: Today (macro bars + meals), food search / manual barcode / quick-add,
      recipe editor, weight log + trend chart, goal-setup wizard
- [x] `nutrition` as a customizable nav destination (More drawer by default)

**Remaining before ship:**

- [ ] Run `scripts/build-food-db` (`npm run download && npm run build` + save the CIQUAL
      CSV) and drop `dist/food.zip` into `static/assets/databases/` before the release build
- [ ] On-device smoke test: bundled `food.zip` unpacks + FTS works on Android;
      `/sync/nutrition/*` round-trips with a Pro token; the barcode scanner gets camera
      access in the Capacitor webview (zxing via `getUserMedia` — no native plugin)
- [ ] Optional "download full food database" flow (fetch `food-full.zip`, prompt + size +
      WiFi-only, manage in Settings → Nutrition) — deferred, not needed for first ship
- [x] Cache online OFF lookups into the local DB so the offline set grows with use
      (`createCachingFoodDbRepo` in core: bundled → local cache → online, writes every
      online hit back; `food_cache` table native / localStorage web). Also gives a
      bundled-DB build its first online fallback for barcode misses.
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

**Stage D — meal-photo journal + coach comments:**
- [x] `LoggedItem.photoDataUrl` — client attaches a photo per diary item
      (`@capacitor/camera`, small jpeg), thumbnail on `/nutrition`.
- [x] Studio "Recent diary" card — last 7 days of the client's items + photo thumbnails.
- [x] **Coach comments** — a comment on a diary day rides on the existing coach↔client
      message thread: `CoachMessage.contextDateIso` (YYYY-MM-DD). The message still lives in
      the thread; when set, the client surfaces it inline on `/nutrition` for that day and
      the Studio "Recent diary" card shows it + a per-day comment box. Chosen over a new
      `CoachFeedback` entity — reuses the only bidirectional sync entity, zero new surface.

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
| USDA FoodData Central (Foundation + SR Legacy) | Public domain | Bundled — US/generic whole foods, lab-verified |
| ANSES CIQUAL | Etalab Open Licence 2.0 (attribution) | Bundled — EU/generic whole foods, lab-verified |
| Open Food Facts (curated subset) | ODbL (attribution + share-alike) | Bundled — packaged products + barcodes |
| Open Food Facts API | ODbL | Optional online fallback for the long tail / barcode misses |

The `meta.attribution` string baked into `food.db` must be shown in the app's About /
licences screen (ODbL requires it; so does the Etalab licence).

Branded USDA data (~1.5M rows, US-centric) is deliberately excluded from the bundle. If a
self-hoster or user wants deeper coverage, an optional downloadable pack or an API key slot
can be added later without changing the core.

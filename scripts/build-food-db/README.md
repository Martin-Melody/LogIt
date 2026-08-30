# build-food-db

Builds the **bundled, offline food database** shipped with the app — nutrition facts +
servings for generic foods (USDA + CIQUAL) and packaged products with barcodes (Open Food
Facts). Consumed by `FoodDbRepo` in `@logit/core`.

This is a **maintainer script**, run occasionally to refresh the data. It is not part of the
app build.

## Two tiers

| Tier | Command | What's in it | Size | Ships as |
|---|---|---|---|---|
| **core** | `npm run build` | USDA + CIQUAL generics, plus the ~250k most-scanned packaged products across the EU + North America | ~55–70 MB on disk, **~18–25 MB zipped** | inside the app (`static` asset) |
| **full** | `npm run build:full` | everything that passes the quality filter, worldwide (~1M products) | ~280 MB / ~75 MB zipped | optional on-demand download |
| sample | `npm run build:sample` | tiny build from `fixtures/` — for app dev + CI | a few KB | — |

Anything beyond the installed tier is served live by the Open Food Facts API
(`createOpenFoodFactsRepo`), and looked-up items are cached locally — so each user's DB
effectively self-tailors to their diet over time.

Tune coverage in `config.mjs`: `tiers.core.maxProducts`, `minPopularityScans`, the
`CORE_COUNTRIES` list, and the `limits.*` plausibility filters.

## Prerequisites

- Node ≥ 22.5 (uses the built-in `node:sqlite` — no native modules)
- `unzip` on `PATH` (for the USDA bundles)
- ~4 GB free disk for a full build (the OFF CSV export is ~1 GB compressed, ~9 GB inflated
  but streamed, never fully written)

## Usage

```bash
npm test                       # unit tests for the curation pipeline
npm run build:sample           # -> dist/food.db (+ .zip) from fixtures, no download

npm run download               # -> data/  (OFF CSV ~1 GB; USDA zips)
#   ... then save the CIQUAL table as data/ciqual/ciqual.csv (see below) ...
npm run build                  # -> dist/food.db      + dist/food.zip   (core tier)
npm run build:full             # -> dist/food-full.db + dist/food-full.zip
```

`download.mjs` also takes `usda` or `off` to fetch just one source.

### CIQUAL (EU generic foods)

CIQUAL is distributed by ANSES as an XLSX. Download the current *Table CIQUAL* from
<https://ciqual.anses.fr/> (or the CSV resource on
<https://www.data.gouv.fr/fr/datasets/table-de-composition-nutritionnelle-des-aliments-ciqual/>),
save it as **`data/ciqual/ciqual.csv`**, and re-run `npm run build`. The loader is tolerant
of the usual quirks (`;` delimiter, decimal commas, `traces` / `-`, header wording changes)
and prefers the English name column when present. If the file is absent the build simply
skips CIQUAL and warns.

## Installing the built database in the app

The app reads a bundled DB via `@capacitor-community/sqlite`'s `copyFromAssets`, which
unpacks any `*.zip` it finds. Ship the **zip**, not the raw `.db`:

```bash
cp dist/food.zip ../../apps/clients/logit-frontend/static/assets/databases/food.zip
# then: npm --workspace apps/clients/logit-frontend run build && npx cap sync
```

The archive contains `food.db`; the plugin copies it in as `foodSQLite.db` and
`initFoodDb()` opens it read-only. If it's absent the app falls back to the Open Food Facts
API for search + barcode. (The `full` tier's `food-full.zip` is delivered by the optional
"download full food database" flow, not bundled — see the nutrition roadmap.)

## Output schema

`dist/food.db` — SQLite with:

| object | purpose |
|---|---|
| `foods` | `id` (`usda:<fdc_id>` / `ciqual:<code>` / `off:<barcode>`), `source`, `name`, `brand`, `barcode`, `*_100g` macros, `popularity` (search rank hint), `serving_json` |
| `foods_fts` | FTS5 (external-content) over `name` + `brand` (`unicode61`, diacritics folded) |
| `idx_foods_barcode` | exact barcode lookup |
| `meta` | build date, tier, row counts, **attribution string** |

On a platform without FTS5 the repo falls back to `LIKE`.

## Quality filter

Every row from every source must pass (`lib/normalize.mjs`):

- a non-empty name and at least one non-zero macro or energy value
- energy within 4/4/9 tolerance of the macros (`limits.energyMismatch*`) — catches kJ typed
  into a kcal field, per-serving values in a per-100 g column, decimal slips
- macros ≤ 100 g/100 g, energy ≤ 950 kcal/100 g

OFF rows additionally need a barcode, a scan count ≥ `minPopularityScans`, and (core tier)
a `countries_tag` in `CORE_COUNTRIES`. Duplicate barcodes collapse to the most complete /
most scanned row.

## Data sources & licensing

| Source | License | Notes |
|---|---|---|
| [USDA FoodData Central](https://fdc.nal.usda.gov/) — Foundation + SR Legacy | **Public domain** (U.S. Government work) | Generic, lab-analysed foods. Branded Foods (~1.5M, US-centric) excluded — OFF covers packaged. |
| [ANSES CIQUAL](https://ciqual.anses.fr/) | **Etalab Licence Ouverte / Open Licence 2.0** | French/EU generic food-composition table (~3.2k foods). Attribution required. |
| [Open Food Facts](https://world.openfoodfacts.org/data) | **ODbL v1.0** (database) + DbCL (contents) | Crowd-sourced packaged products. Share-alike: any publicly distributed adaptation of the database must be offered under the ODbL, and Open Food Facts must be attributed. |

The `meta.attribution` row is written into every build and **must be surfaced in the app's
"About" / licences screen**. Keep it intact when redistributing the built database.

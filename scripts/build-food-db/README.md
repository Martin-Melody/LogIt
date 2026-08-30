# build-food-db

Builds `food.db` — the bundled, offline food database shipped inside the app. Read-only
reference data: nutrition facts + servings for generic foods (USDA) and packaged products
with barcodes (Open Food Facts). Consumed by `FoodDbRepo` in `@logit/core`.

This is a **maintainer script**, run occasionally to refresh the bundle. It is not part of
the app build.

## Prerequisites

- Node ≥ 22.5 (uses the built-in `node:sqlite` — no native modules)
- `unzip` on `PATH` (for the USDA bundles)
- ~15 GB free disk for a full build (the Open Food Facts export is ~9 GB compressed)

## Usage

```bash
# tiny build from fixtures — for app development and CI, no download needed
node build.mjs --sample        # -> dist/food.db  (~9 rows)

# full build
node download.mjs              # -> data/  (slow: OFF export is ~9 GB)
node build.mjs                 # -> dist/food.db
```

`download.mjs` also takes `usda` or `off` to fetch just one source.

Tune coverage in `config.mjs` (Open Food Facts product cap, popularity threshold, country
filter) and the source URLs (update when USDA publishes a new release).

## Output

`dist/food.db` — SQLite with:

| object | purpose |
|---|---|
| `foods` | `id` (`usda:<fdc_id>` / `off:<barcode>`), `source`, `name`, `brand`, `barcode`, `*_100g` macros, `serving_json` |
| `foods_fts` | FTS5 over `name` + `brand` (`unicode61`, diacritics folded) |
| `idx_foods_barcode` | exact barcode lookup |
| `meta` | build date, row counts, **attribution string** |

The app ships this file as a Capacitor asset and opens it read-only alongside the main
database (see the frontend nutrition repos). On a platform without FTS5 the repo falls back
to `LIKE`.

## Data sources & licensing

| Source | License | Notes |
|---|---|---|
| [USDA FoodData Central](https://fdc.nal.usda.gov/) — Foundation Foods + SR Legacy | **Public domain** (U.S. Government work) | Generic, lab-analysed foods. Branded Foods (~1.5M, US-centric) is excluded from the bundle. |
| [Open Food Facts](https://world.openfoodfacts.org/data) | **ODbL v1.0** (database) + DbCL (contents) | Crowd-sourced packaged products. Share-alike: any publicly distributed adaptation of this database must be offered under the ODbL, and Open Food Facts must be attributed. |

The `meta.attribution` row is written into every `food.db` and must be surfaced in the app's
"About" / licences screen. Keep attribution intact when redistributing the built database.

// Curation knobs for the bundled food database. Tune, then `npm run build`.
//
// Two output tiers:
//   core  — ships inside the app (dist/food.db + dist/food.zip). Kept small: generic whole
//           foods (USDA + CIQUAL) plus the most-scanned packaged products across the EU and
//           North America.
//   full  — an optional download the app offers on demand (dist/food-full.db + .zip).
//           Everything that passes the quality filter, worldwide.
//
// The long tail beyond either tier is served live by the Open Food Facts API
// (`createOpenFoodFactsRepo` in @logit/core), and looked-up items are cached locally.

// OFF `countries_tags` taxonomy ids for the core tier. Food is food — this is about which
// *packaged* products to bundle, not which generic foods. EU-27 + EEA + UK + US + CA.
const CORE_COUNTRIES = [
  "en:united-states", "en:canada", "en:united-kingdom", "en:ireland",
  "en:france", "en:germany", "en:spain", "en:italy", "en:portugal",
  "en:netherlands", "en:belgium", "en:luxembourg", "en:austria", "en:switzerland",
  "en:poland", "en:czechia", "en:slovakia", "en:hungary", "en:romania", "en:bulgaria",
  "en:greece", "en:croatia", "en:slovenia", "en:sweden", "en:denmark", "en:finland",
  "en:norway", "en:iceland", "en:estonia", "en:latvia", "en:lithuania",
  "en:cyprus", "en:malta",
];

export const config = {
  // Written to meta.build_version. Bump when a shipped DB change must reach devices that
  // already unpacked an older copy — must match FOOD_DB_VERSION in the app's sqlite.ts.
  // v2 = `curated` column + common-foods.json staples.
  dbVersion: 2,

  usda: {
    // USDA FoodData Central CSV bundles. Public domain. Update these URLs when USDA
    // publishes a new release — https://fdc.nal.usda.gov/download-datasets
    // Foundation Foods = a few hundred lab-analysed staples; SR Legacy = ~7.8k generic
    // foods. Branded (~1.5M, US-centric) is deliberately left out — OFF covers packaged.
    foundationUrl:
      "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-04-24.zip",
    srLegacyUrl:
      "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
  },

  ciqual: {
    // ANSES CIQUAL — the French/EU generic food-composition table (~3.2k foods, lab data).
    // Etalab Licence Ouverte 2.0 (attribution). The official distribution is an XLSX; the
    // script consumes a CSV export of it. See README for the one conversion step and the
    // data.gouv.fr mirror.
    csvPath: "data/ciqual/ciqual.csv",
  },

  off: {
    // Open Food Facts CSV export — tab-separated, ~1 GB gzipped (vs ~9 GB for the JSONL
    // dump). ODbL (attribution + share-alike — see README). The build also accepts a
    // .jsonl / .jsonl.gz export if that's what you have.
    csvUrl: "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz",
  },

  tiers: {
    core: {
      maxProducts: 250_000,
      minPopularityScans: 3,
      countries: CORE_COUNTRIES,
      output: "dist/food.db",
    },
    full: {
      maxProducts: 2_000_000,
      minPopularityScans: 1,
      countries: null, // worldwide
      output: "dist/food-full.db",
    },
  },

  // Baseline search-popularity for generic (unscanned) foods, so "banana" ranks the USDA
  // entry above a branded "Banana flavour drink". OFF rows use their real scan count.
  genericPopularity: 400,

  // Base popularity for the hand-curated staples from common-foods.json — each entry gets
  // `commonPopularity - listIndex`, so the block stays in the curator's order. Far above any
  // real OFF scan count so curated rows also win the LIKE fallback (platforms without FTS5);
  // the `curated` column is what separates them on the FTS path.
  commonPopularity: 9_000_000,

  // Plausibility filters applied to every row (per 100 g).
  limits: {
    kcalMax: 950,
    macroGramsMax: 100,
    // Reject rows whose stated energy contradicts 4/4/9 kcal from the macros by more than
    // both of these (catches unit mix-ups and data-entry noise, mostly in OFF).
    energyMismatchKcal: 120,
    energyMismatchPct: 0.35,
  },
};

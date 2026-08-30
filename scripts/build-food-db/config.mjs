// Curation knobs for the bundled food database. Tune, then `npm run build`.

export const config = {
  usda: {
    // USDA FoodData Central CSV bundles. Public domain. Update these URLs when USDA
    // publishes a new release — https://fdc.nal.usda.gov/download-datasets
    // Foundation Foods = a few hundred lab-analysed staples; SR Legacy = ~7.8k generic
    // foods. Branded (~1.5M, US-centric) is deliberately left out of the bundle.
    foundationUrl:
      "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-04-24.zip",
    srLegacyUrl:
      "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
  },

  off: {
    // Open Food Facts full export. ODbL (attribution + share-alike — see README).
    jsonlUrl: "https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz",

    // Curation: keep the most-scanned products with complete, plausible nutrition data.
    maxProducts: 80_000,
    minPopularityScans: 1,
    // Restrict to these `countries_tags` (OFF taxonomy ids), or null for worldwide.
    // e.g. ["en:ireland", "en:united-kingdom", "en:united-states"]
    countries: null,
  },

  // Plausibility filters applied to every row (per 100 g).
  limits: {
    kcalMax: 950,
    macroGramsMax: 100,
  },

  output: "dist/food.db",
};

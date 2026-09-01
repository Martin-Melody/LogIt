-- Bundled food database. Read-only reference data shipped with the app; never synced,
-- never owner-scoped. Matches FoodDbRepo in @logit/core.
--
-- `id` is "usda:<fdc_id>", "ciqual:<code>" or "off:<barcode>". Macros are per 100 g.
-- `serving_json` is a JSON array of { "label": string, "grams": number }, always including
-- a raw 100 g option. `popularity` is a search-ranking hint (OFF scan count; a fixed
-- baseline for generic USDA/CIQUAL foods) — higher sorts first on equal text relevance.

CREATE TABLE foods (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,          -- 'usda' | 'ciqual' | 'off'
  name         TEXT NOT NULL,
  brand        TEXT,
  barcode      TEXT,                   -- EAN/UPC, 'off' rows only
  kcal_100g    REAL NOT NULL,
  protein_100g REAL NOT NULL,
  carb_100g    REAL NOT NULL,
  fat_100g     REAL NOT NULL,
  popularity   INTEGER NOT NULL DEFAULT 0,
  curated      INTEGER NOT NULL DEFAULT 0,   -- 1 for hand-curated staples (see common-foods.json); sorted first
  serving_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_foods_barcode ON foods(barcode) WHERE barcode IS NOT NULL;

-- Full-text search over name + brand. Populated once after the bulk load (see build.mjs);
-- external-content table keyed on foods.rowid.
CREATE VIRTUAL TABLE foods_fts USING fts5(
  name,
  brand,
  content='foods',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

-- Provenance / attribution, surfaced in the app's "About" screen.
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

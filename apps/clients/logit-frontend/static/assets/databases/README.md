# Bundled databases

`@capacitor-community/sqlite` (`copyFromAssets`) copies every `*.db` — and unpacks every
`*.zip` — it finds under **`public/assets/databases/`** into the app's database store on
first launch. SvelteKit copies this `static/` folder to `build/` (→ Capacitor `public/`),
so files placed here land where the plugin looks. `initFoodDb()` in
`src/lib/data/db/sqlite.ts` triggers the copy and opens `food` read-only.

## food.zip

The bundled food database (USDA + CIQUAL + Open Food Facts, **core tier**). Built by
`scripts/build-food-db`:

```bash
cd scripts/build-food-db
npm run download && npm run build          # full build → dist/food.zip
#   or, for local device testing:
npm run build:sample
cp dist/food.zip ../../apps/clients/logit-frontend/static/assets/databases/food.zip
```

The archive contains `food.db`; the plugin installs it as `foodSQLite.db`.

`*.zip` / `*.db` here are gitignored — the release build drops `food.zip` in before
`cap sync`. If it's absent the app falls back to the Open Food Facts API for search +
barcode.

The **full tier** (`food-full.zip`) is *not* bundled — it's fetched by the optional
"download full food database" flow.

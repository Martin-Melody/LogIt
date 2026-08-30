# Bundled databases (Capacitor SQLite `copyFromAssets`)

`@capacitor-community/sqlite` copies every `*.db` in this folder into the app's database
store on first launch (`initFoodDb()` in `src/lib/data/db/sqlite.ts`).

## food.db

The bundled food database (USDA + Open Food Facts). Built by `scripts/build-food-db`:

```bash
cd scripts/build-food-db
node download.mjs && node build.mjs          # full build
#   or, for local device testing:
node build.mjs --sample
cp dist/food.db ../../apps/clients/logit-frontend/android/app/src/main/assets/databases/
```

`*.db` files here are gitignored — the release build drops `food.db` in before `cap sync`.
If it's absent, the app falls back to the Open Food Facts API for search + barcode.

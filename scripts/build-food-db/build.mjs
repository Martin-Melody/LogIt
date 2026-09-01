// Builds the bundled food database from the downloaded USDA + CIQUAL + Open Food Facts
// sources.
//
//   node build.mjs             core tier  -> dist/food.db      + dist/food.zip
//   node build.mjs --full      full tier  -> dist/food-full.db + dist/food-full.zip
//   node build.mjs --sample    tiny build from ./fixtures (for app development / CI)
//
// The core tier ships inside the app; the full tier is an optional on-demand download.
// See README.md for the download step and data licensing.

import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.mjs";
import { loadUsdaBundle } from "./lib/usda.mjs";
import { loadCiqualTable } from "./lib/ciqual.mjs";
import { loadOffExport } from "./lib/off.mjs";
import { completeness } from "./lib/normalize.mjs";
import { resolveCommonFoods } from "./lib/common.mjs";
import { writeZip } from "./lib/zip.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const sample = process.argv.includes("--sample");
const full = process.argv.includes("--full");

const tier = full
  ? { name: "full", ...config.tiers.full }
  : { name: "core", ...config.tiers.core };

// The sample build always uses the fixtures and the core tier's knobs.
const sampleTier = { ...config.tiers.core, countries: null, minPopularityScans: 0 };

function firstExisting(...paths) {
  return paths.find((p) => existsSync(p)) ?? null;
}

const paths = sample
  ? {
      usda: [join(HERE, "fixtures/usda-foundation-sample")],
      ciqual: join(HERE, "fixtures/ciqual-sample.csv"),
      off: join(HERE, "fixtures/off-sample.jsonl"),
    }
  : {
      usda: [join(HERE, "data/usda/foundation"), join(HERE, "data/usda/sr_legacy")],
      ciqual: join(HERE, config.ciqual.csvPath),
      off: firstExisting(
        join(HERE, "data/off/en.openfoodfacts.org.products.csv.gz"),
        join(HERE, "data/off/en.openfoodfacts.org.products.csv"),
        join(HERE, "data/off/openfoodfacts-products.jsonl.gz"),
        join(HERE, "data/off/openfoodfacts-products.jsonl"),
      ),
    };

async function collectRows() {
  const offTier = sample ? sampleTier : tier;

  // Dedupe on id as we go; if two sources collide, keep the more complete row.
  const byId = new Map();
  const add = (list) => {
    for (const r of list) {
      const prev = byId.get(r.id);
      if (!prev || completeness(r) > completeness(prev)) byId.set(r.id, r);
    }
  };

  for (const dir of paths.usda) {
    if (!existsSync(dir)) {
      console.warn(`! skipping USDA bundle (not found): ${rel(dir)}`);
      continue;
    }
    const bundle = await loadUsdaBundle(dir);
    console.log(`  USDA ${dir.split("/").pop()}: ${bundle.length.toLocaleString()} foods`);
    add(bundle);
  }

  if (paths.ciqual && existsSync(paths.ciqual)) {
    const ciqual = await loadCiqualTable(paths.ciqual);
    console.log(`  CIQUAL: ${ciqual.length.toLocaleString()} foods`);
    add(ciqual);
  } else {
    console.warn(`! skipping CIQUAL (not found): ${rel(paths.ciqual)}`);
  }

  if (paths.off && existsSync(paths.off)) {
    console.log(`  Open Food Facts: reading ${rel(paths.off)} …`);
    const off = await loadOffExport(paths.off, offTier);
    console.log(`  Open Food Facts: ${off.length.toLocaleString()} products (${offTier === sampleTier ? "sample" : tier.name} tier)`);
    add(off);
  } else {
    console.warn(`! skipping Open Food Facts (not found): run \`npm run download\``);
  }

  // Curated staples: resolve each against the loaded USDA/CIQUAL rows, then add as their own
  // `curated` rows so the app can float them above brand noise for generic queries.
  // Skipped for --sample (the fixture set is too small to resolve the real list).
  const listPath = join(HERE, "common-foods.json");
  if (!sample && existsSync(listPath)) {
    const list = JSON.parse(await readFile(listPath, "utf8")).foods ?? [];
    const { rows: common, warnings } = resolveCommonFoods([...byId.values()], list, {
      popularity: config.commonPopularity,
    });
    for (const r of common) byId.set(r.id, r);
    console.log(`  Common foods: ${common.length} curated of ${list.length}`);
    if (warnings.length) {
      console.warn(
        `  ! ${warnings.length} common-foods entries had no match: ` +
          warnings.slice(0, 10).join(" | ") +
          (warnings.length > 10 ? " …" : ""),
      );
    }
  }

  return [...byId.values()];
}

function rel(p) {
  return p ? p.replace(HERE + "/", "") : String(p);
}

async function main() {
  console.log(
    sample ? "Building sample food.db from fixtures…" : `Building ${tier.name} food database…`,
  );
  const rows = await collectRows();
  if (rows.length === 0) {
    console.error("No rows collected — run `npm run download` first, or use --sample.");
    process.exit(1);
  }

  const outPath = join(HERE, sample ? config.tiers.core.output : tier.output);
  await mkdir(dirname(outPath), { recursive: true });
  await rm(outPath, { force: true });

  const db = new DatabaseSync(outPath);
  db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;");
  db.exec(await readFile(join(HERE, "schema.sql"), "utf8"));

  const insert = db.prepare(
    `INSERT INTO foods
       (id, source, name, brand, barcode, kcal_100g, protein_100g, carb_100g, fat_100g, popularity, curated, serving_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec("BEGIN");
  let n = 0;
  for (const r of rows) {
    insert.run(
      r.id,
      r.source,
      r.name,
      r.brand,
      r.barcode,
      r.kcal_100g,
      r.protein_100g,
      r.carb_100g,
      r.fat_100g,
      Math.round(r.popularity ?? 0),
      r.curated ? 1 : 0,
      JSON.stringify(r.servings),
    );
    n++;
  }
  db.exec("COMMIT");

  // Build the FTS index from the loaded content, then compact it.
  db.exec("INSERT INTO foods_fts(rowid, name, brand) SELECT rowid, name, brand FROM foods");
  db.exec("INSERT INTO foods_fts(foods_fts) VALUES('optimize')");

  const counts = db.prepare("SELECT source, COUNT(*) c FROM foods GROUP BY source").all();
  const curatedCount = db.prepare("SELECT COUNT(*) c FROM foods WHERE curated = 1").get().c;
  const meta = {
    built_at: new Date().toISOString(),
    build_mode: sample ? "sample" : tier.name,
    build_version: String(config.dbVersion),
    total: String(n),
    curated: String(curatedCount),
    sources: JSON.stringify(counts),
    attribution:
      "Contains data from USDA FoodData Central (public domain); ANSES CIQUAL " +
      "(Etalab Open Licence 2.0 — https://www.etalab.gouv.fr/licence-ouverte-open-licence); " +
      "and Open Food Facts (Open Database License, ODbL v1.0 — " +
      "https://opendatacommons.org/licenses/odbl/1-0/), individual product content under " +
      "the Database Contents License. Adaptations of the Open Food Facts database that are " +
      "publicly distributed must be offered under the ODbL.",
  };
  const setMeta = db.prepare("INSERT INTO meta(key, value) VALUES(?, ?)");
  for (const [k, v] of Object.entries(meta)) setMeta.run(k, v);

  db.exec("PRAGMA journal_mode = DELETE");
  db.exec("VACUUM");
  db.close();

  const size = (await stat(outPath)).size;

  // Compressed, shippable artifact. The app unpacks <name>.zip via copyFromAssets; the
  // entry inside is <name>.db so the plugin names it <name>SQLite.db.
  const zipPath = outPath.replace(/\.db$/, ".zip");
  const dbBuf = await readFile(outPath);
  await writeZip(zipPath, [{ name: outPath.split("/").pop(), data: dbBuf }]);
  const zipSize = (await stat(zipPath)).size;

  console.log(`\n✓ ${rel(outPath)}`);
  console.log(`  ${n.toLocaleString()} foods  ·  ${mb(size)} on disk  ·  ${mb(zipSize)} zipped`);
  for (const c of counts) console.log(`  ${c.source}: ${c.c.toLocaleString()}`);
  console.log(`\n✓ ${rel(zipPath)}  — ship this in apps/clients/logit-frontend static assets`);
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

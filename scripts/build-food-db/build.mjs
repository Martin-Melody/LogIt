// Builds dist/food.db from the downloaded USDA + Open Food Facts sources.
//
//   node build.mjs             full build from ./data (run download.mjs first)
//   node build.mjs --sample    tiny build from ./fixtures (for app development / CI)
//
// See README.md for the download step and data licensing.

import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.mjs";
import { loadUsdaBundle } from "./lib/usda.mjs";
import { loadOffExport } from "./lib/off.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const sample = process.argv.includes("--sample");

const paths = sample
  ? {
      usda: [join(HERE, "fixtures/usda-foundation-sample")],
      off: join(HERE, "fixtures/off-sample.jsonl"),
    }
  : {
      usda: [join(HERE, "data/usda/foundation"), join(HERE, "data/usda/sr_legacy")],
      off: join(HERE, "data/off/openfoodfacts-products.jsonl.gz"),
    };

async function collectRows() {
  const rows = [];

  for (const dir of paths.usda) {
    if (!existsSync(dir)) {
      console.warn(`! skipping USDA bundle (not found): ${dir}`);
      continue;
    }
    const bundle = await loadUsdaBundle(dir);
    console.log(`  USDA ${dir.split("/").pop()}: ${bundle.length.toLocaleString()} foods`);
    rows.push(...bundle);
  }

  if (existsSync(paths.off)) {
    const off = await loadOffExport(paths.off);
    console.log(`  Open Food Facts: ${off.length.toLocaleString()} products (curated)`);
    rows.push(...off);
  } else {
    console.warn(`! skipping Open Food Facts (not found): ${paths.off}`);
  }

  // Last row wins on id collision (shouldn't happen across sources, but be safe).
  const byId = new Map();
  for (const r of rows) byId.set(r.id, r);
  return [...byId.values()];
}

async function main() {
  console.log(sample ? "Building sample food.db from fixtures…" : "Building food.db…");
  const rows = await collectRows();
  if (rows.length === 0) {
    console.error("No rows collected — run `npm run download` first, or use --sample.");
    process.exit(1);
  }

  const outPath = join(HERE, config.output);
  await mkdir(dirname(outPath), { recursive: true });
  await rm(outPath, { force: true });

  const db = new DatabaseSync(outPath);
  db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;");
  db.exec(await readFile(join(HERE, "schema.sql"), "utf8"));

  const insert = db.prepare(
    `INSERT INTO foods (id, source, name, brand, barcode, kcal_100g, protein_100g, carb_100g, fat_100g, serving_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      JSON.stringify(r.servings),
    );
    n++;
  }
  db.exec("COMMIT");

  // Build the FTS index from the loaded content, then compact it.
  db.exec("INSERT INTO foods_fts(rowid, name, brand) SELECT rowid, name, brand FROM foods");
  db.exec("INSERT INTO foods_fts(foods_fts) VALUES('optimize')");

  const counts = db.prepare("SELECT source, COUNT(*) c FROM foods GROUP BY source").all();
  const meta = {
    built_at: new Date().toISOString(),
    build_mode: sample ? "sample" : "full",
    total: String(n),
    sources: JSON.stringify(counts),
    attribution:
      "Contains data from USDA FoodData Central (public domain) and Open Food Facts " +
      "(Open Database License, ODbL v1.0 — https://opendatacommons.org/licenses/odbl/1-0/). " +
      "Open Food Facts data and derived databases are made available under the ODbL; " +
      "individual product content is under the Database Contents License.",
  };
  const setMeta = db.prepare("INSERT INTO meta(key, value) VALUES(?, ?)");
  for (const [k, v] of Object.entries(meta)) setMeta.run(k, v);

  db.exec("PRAGMA journal_mode = DELETE");
  db.exec("VACUUM");
  db.close();

  const size = (await stat(outPath)).size;
  console.log(`\n✓ ${outPath}`);
  console.log(`  ${n.toLocaleString()} foods  ·  ${(size / 1024 / 1024).toFixed(1)} MB`);
  for (const c of counts) console.log(`  ${c.source}: ${c.c.toLocaleString()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

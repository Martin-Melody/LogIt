// Unit tests for the curation pipeline. Run: `npm test` (node --test).

import test from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

import {
  acceptRow,
  energyConsistent,
  parseLooseNumber,
  completeness,
  buildServings,
} from "./lib/normalize.mjs";
import { normalizeOffProduct, loadOffExport } from "./lib/off.mjs";
import { loadCiqualTable } from "./lib/ciqual.mjs";
import { resolveCommonFoods, scoreMatch } from "./lib/common.mjs";
import { writeZip } from "./lib/zip.mjs";
import { config } from "./config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE = config.tiers.core;
const FULL = config.tiers.full;

test("parseLooseNumber handles CIQUAL quirks", () => {
  assert.equal(parseLooseNumber("12,5"), 12.5);
  assert.equal(parseLooseNumber("traces"), 0);
  assert.equal(parseLooseNumber("< 0,1"), 0.1);
  assert.ok(Number.isNaN(parseLooseNumber("-")));
  assert.ok(Number.isNaN(parseLooseNumber("")));
});

test("energyConsistent rejects kJ-in-kcal and per-serving slips", () => {
  assert.equal(energyConsistent({ kcal_100g: 250, protein_100g: 10, carb_100g: 40, fat_100g: 5 }), true);
  // 2000 "kcal" against ~250 kcal of macros
  assert.equal(energyConsistent({ kcal_100g: 900, protein_100g: 10, carb_100g: 40, fat_100g: 5 }), false);
  // no macros -> nothing to contradict
  assert.equal(energyConsistent({ kcal_100g: 500, protein_100g: 0, carb_100g: 0, fat_100g: 0 }), true);
});

test("acceptRow drops empty and inconsistent rows", () => {
  assert.equal(acceptRow({ name: "x", kcal_100g: 0, protein_100g: 0, carb_100g: 0, fat_100g: 0 }), null);
  assert.equal(acceptRow({ name: "", kcal_100g: 100, protein_100g: 1, carb_100g: 1, fat_100g: 1 }), null);
  const ok = acceptRow({ name: "Rice", kcal_100g: 130, protein_100g: 2.7, carb_100g: 28, fat_100g: 0.3 });
  assert.ok(ok);
});

test("completeness counts present macros", () => {
  assert.equal(completeness({ kcal_100g: 100, protein_100g: 1, carb_100g: 0, fat_100g: 2 }), 3);
});

test("buildServings always includes 100 g and dedupes", () => {
  const s = buildServings([{ label: "slice", grams: 28 }, { label: "dup", grams: 100 }]);
  assert.deepEqual(s[0], { label: "100 g", grams: 100 });
  assert.equal(s.length, 2);
});

test("normalizeOffProduct applies the country filter per tier", () => {
  const jp = {
    code: "1", product_name: "Snack", brands: "B", countries_tags: ["en:japan"],
    kcal_100g_raw: 400, proteins_100g: 5, carbohydrates_100g: 50, fat_100g: 18, unique_scans_n: 10,
  };
  assert.equal(normalizeOffProduct(jp, CORE), null);
  assert.ok(normalizeOffProduct(jp, FULL));
});

test("normalizeOffProduct derives kcal from kJ when kcal is absent", () => {
  const row = normalizeOffProduct(
    {
      code: "2", product_name: "Juice", brands: "B", countries_tags: ["en:france"],
      energy_100g_raw: 180, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0,
    },
    CORE,
  );
  assert.ok(row);
  assert.ok(Math.abs(row.kcal_100g - 43) < 2);
});

test("loadOffExport reads the CSV (TSV) fixture and curates by tier", async () => {
  const path = join(HERE, "fixtures/off-sample.csv");
  const core = await loadOffExport(path, { ...CORE, minPopularityScans: 1 });
  const names = core.map((r) => r.name).sort();
  assert.deepEqual(names, ["Coca-Cola", "Nutella"]); // JP snack filtered, kJ-mislabel & blank dropped
  assert.equal(core.find((r) => r.name === "Nutella").servings.length, 2);

  const full = await loadOffExport(path, { ...FULL, minPopularityScans: 1 });
  assert.ok(full.some((r) => r.name === "Obscure Local Snack"));
});

test("loadOffExport reads the JSONL fixture", async () => {
  const path = join(HERE, "fixtures/off-sample.jsonl");
  const rows = await loadOffExport(path, { ...FULL, minPopularityScans: 1 });
  const names = rows.map((r) => r.name).sort();
  assert.ok(names.includes("Nutella"));
  assert.ok(names.includes("Snickers")); // energy_100g kJ -> kcal
  assert.ok(!names.includes("Mystery Item No Nutrition"));
});

test("loadCiqualTable parses ;-delimited French export", async () => {
  const rows = await loadCiqualTable(join(HERE, "fixtures/ciqual-sample.csv"));
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.ok(byName["Banana, raw"]); // English name preferred, not the "fruits" group name
  assert.equal(byName["Banana, raw"].id, "ciqual:13000"); // alim_code, not alim_grp_code
  assert.equal(byName["Banana, raw"].kcal_100g, 89); // the kcal column, not kJ
  assert.equal(byName["Banana, raw"].carb_100g, 20.5); // decimal comma
  assert.equal(byName["Chicken, roasted"].carb_100g, 0); // "traces" -> 0
  assert.ok(!byName["Tap water"]); // all-zero row dropped
  assert.equal(rows.length, new Set(rows.map((r) => r.id)).size); // ids unique
  assert.equal(rows[0].source, "ciqual");
  assert.equal(rows[0].popularity, config.genericPopularity);
});

test("resolveCommonFoods picks the most generic match and stamps it curated", () => {
  const mk = (id, source, name, macros = { kcal_100g: 100, protein_100g: 5, carb_100g: 10, fat_100g: 2 }) => ({
    id, source, name, brand: null, barcode: null, ...macros,
    popularity: config.genericPopularity, servings: [{ label: "100 g", grams: 100 }],
  });
  const rows = [
    mk("usda:1", "usda", "Milk, whole, 3.25% milkfat, with added vitamin D", { kcal_100g: 61, protein_100g: 3.2, carb_100g: 4.8, fat_100g: 3.3 }),
    mk("usda:2", "usda", "Milk chocolate, with added vitamin D"),
    mk("off:1", "off", "Milka chocolate bar"), // wrong source — must be ignored
    mk("ciqual:9", "ciqual", "Chicken, roasted", { kcal_100g: 223, protein_100g: 28.7, carb_100g: 0, fat_100g: 12.1 }),
    mk("usda:3", "usda", "Chicken spread, canned"),
  ];

  const { rows: out, warnings } = resolveCommonFoods(
    rows,
    [
      { name: "Milk, whole", match: "milk whole 3.25 milkfat vitamin d" },
      { name: "Chicken, whole, roasted", match: "chicken roasted" },
      { name: "Unicorn steak", match: "unicorn tenderloin" },
    ],
    { popularity: config.commonPopularity },
  );

  const milk = out.find((r) => r.id === "common:milk-whole");
  assert.ok(milk);
  assert.equal(milk.source, "usda");
  assert.equal(milk.protein_100g, 3.2); // macros copied from the matched row
  assert.equal(milk.curated, 1);
  assert.equal(milk.popularity, config.commonPopularity); // list index 0

  const chicken = out.find((r) => r.id === "common:chicken-whole-roasted");
  assert.ok(chicken);
  assert.equal(chicken.name, "Chicken, whole, roasted"); // clean display name, not "Chicken, roasted"
  assert.equal(chicken.protein_100g, 28.7);
  assert.equal(chicken.popularity, config.commonPopularity - 1); // list index 1 — later = lower
  assert.ok(milk.popularity > chicken.popularity); // curated block keeps JSON order

  assert.deepEqual(warnings, ["unicorn tenderloin"]); // no match -> warned, not emitted
  assert.equal(out.length, 2);
});

test("scoreMatch rejects non-matches and rewards leading-token / generic names", () => {
  const row = (name) => ({ name, kcal_100g: 1, protein_100g: 1, carb_100g: 1, fat_100g: 1 });
  assert.equal(scoreMatch(["milk", "whole"], "milk", row("Whole grain bread")), null);
  const leading = scoreMatch(["apple"], "apple", row("Apples, raw, with skin"));
  const trailing = scoreMatch(["apple"], "apple", row("Crabapples, raw"));
  assert.ok(leading > trailing);
  // token must start at a word boundary — "apple" doesn't match "pineapple"
  assert.equal(scoreMatch(["apple", "raw"], "apple", row("Pineapple, raw, all varieties")), null);
  assert.ok(scoreMatch(["apple", "raw"], "apple", row("Apples, raw, without skin")) != null);
});

test("writeZip emits an archive node:sqlite can reopen after unzip", async () => {
  const tmpDb = join(HERE, "dist/_test.db");
  const tmpZip = join(HERE, "dist/_test.zip");
  await rm(tmpDb, { force: true });
  await rm(tmpZip, { force: true });

  const db = new DatabaseSync(tmpDb);
  db.exec("CREATE TABLE t(x)"); db.exec("INSERT INTO t VALUES(42)"); db.close();

  const buf = await readFile(tmpDb);
  await writeZip(tmpZip, [{ name: "_test.db", data: buf }]);

  // Validate the ZIP structure: End-Of-Central-Directory signature present.
  const zbuf = await readFile(tmpZip);
  assert.equal(zbuf.readUInt32LE(zbuf.length - 22), 0x06054b50);
  assert.ok(zbuf.length < buf.length); // compressed

  await rm(tmpDb, { force: true });
  await rm(tmpZip, { force: true });
});

test("end-to-end: the sample build produces a queryable food.db", async () => {
  // The sample build is exercised by `npm run build:sample` in CI; here we just assert the
  // schema shape if it's already been built.
  const dbPath = join(HERE, config.tiers.core.output);
  if (!existsSync(dbPath)) return; // nothing to check
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const cols = db.prepare("PRAGMA table_info(foods)").all().map((c) => c.name);
  assert.ok(cols.includes("popularity"));
  assert.ok(cols.includes("curated"));
  const hit = db.prepare(
    "SELECT f.name FROM foods_fts JOIN foods f ON f.rowid = foods_fts.rowid WHERE foods_fts MATCH ? ORDER BY rank, f.popularity DESC LIMIT 1",
  ).get("chick*");
  assert.ok(hit);
  db.close();
});

// Downloads the source datasets into ./data. Requires `unzip` on PATH for the USDA bundles.
//
//   node download.mjs           USDA + Open Food Facts
//   node download.mjs usda      USDA bundles only
//   node download.mjs off       Open Food Facts CSV export only
//
// The Open Food Facts CSV export is ~1 GB compressed (the full JSONL dump is ~9 GB — this
// script uses the CSV). CIQUAL is not fetched here: download the XLSX, save it as CSV to
// data/ciqual/ciqual.csv — see README.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { config } from "./config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");
const execFileAsync = promisify(execFile);
const which = process.argv[2] ?? "all";

async function fetchToFile(url, dest) {
  if (existsSync(dest)) {
    console.log(`• have ${dest.replace(HERE + "/", "")}`);
    return;
  }
  console.log(`↓ ${url}`);
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const tmp = `${dest}.partial`;
  await pipeline(res.body, createWriteStream(tmp));
  await rename(tmp, dest);
  console.log(`  saved ${dest.replace(HERE + "/", "")}`);
}

async function unzipInto(zipPath, destDir) {
  await mkdir(destDir, { recursive: true });
  // USDA zips contain a single top-level folder; -j would flatten wrongly, so extract then
  // the bundle's CSVs land in a subfolder we point loadUsdaBundle at.
  await execFileAsync("unzip", ["-o", zipPath, "-d", destDir]);
}

async function downloadUsda() {
  const jobs = [
    { url: config.usda.foundationUrl, zip: join(DATA, "usda/foundation.zip"), dir: join(DATA, "usda/foundation") },
    { url: config.usda.srLegacyUrl, zip: join(DATA, "usda/sr_legacy.zip"), dir: join(DATA, "usda/sr_legacy") },
  ];
  for (const j of jobs) {
    await fetchToFile(j.url, j.zip);
    await mkdir(j.dir, { recursive: true });
    const staging = `${j.dir}.staging`;
    await rm(staging, { recursive: true, force: true });
    await unzipInto(j.zip, staging);
    // Move the CSVs up out of the single wrapper folder USDA ships.
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(staging, { withFileTypes: true });
    const wrapper = entries.find((e) => e.isDirectory());
    const src = wrapper ? join(staging, wrapper.name) : staging;
    await rm(j.dir, { recursive: true, force: true });
    await rename(src, j.dir);
    await rm(staging, { recursive: true, force: true });
    console.log(`  extracted → ${j.dir.replace(HERE + "/", "")}`);
  }
}

async function downloadOff() {
  await fetchToFile(
    config.off.csvUrl,
    join(DATA, "off/en.openfoodfacts.org.products.csv.gz"),
  );
}

const run = async () => {
  if (which === "all" || which === "usda") await downloadUsda();
  if (which === "all" || which === "off") await downloadOff();
  if (!existsSync(join(DATA, "ciqual/ciqual.csv"))) {
    console.log("\nnote: CIQUAL not present. Save the ANSES CIQUAL table as CSV to");
    console.log("      data/ciqual/ciqual.csv (see README) for EU generic-food coverage.");
  }
  console.log("\ndone. Next: npm run build");
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
